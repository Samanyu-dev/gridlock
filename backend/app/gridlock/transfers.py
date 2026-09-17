"""Transfer engine — transactional team changes.

Rules (config-driven via ``store``):
  * 2 free transfers per round, unused roll over, capped at 4 stored.
  * Each transfer beyond the free allowance costs -5 fantasy points.
  * Wildcard / Free Hit boosts waive penalties for the round.
  * A team can never enter an invalid intermediate state: validation happens
    up-front and the whole change commits or rolls back atomically.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from . import deadlines
from .models import GLTeam, GLTransfer
from .store import BUDGET, EXTRA_TRANSFER_COST, FREE_TRANSFERS, MAX_STORED_TRANSFERS, STORE


class TransferOutcome:
    def __init__(self, transfers: int, free_used: int, penalized: int, penalty: int):
        self.transfers = transfers
        self.free_used = free_used
        self.penalized = penalized
        self.penalty = penalty

    def as_dict(self) -> dict:
        return {
            "transfers": self.transfers, "free_used": self.free_used,
            "penalized": self.penalized, "penalty": self.penalty,
        }


def _diff(old: List[int], new: List[int]) -> int:
    """Number of asset slots that changed (assets removed from the old set)."""
    return len(set(old) - set(new))


def save_team(
    session: Session,
    profile_id: int,
    driver_ids: List[int],
    constructor_ids: List[int],
    captain_id: Optional[int],
    active_boost: Optional[str],
    boost_driver_id: Optional[int] = None,
    boost_constructor_id: Optional[int] = None,
    *,
    enforce_deadline: bool = True,
) -> TransferOutcome:
    """Validate + persist a full team, accounting for transfers, atomically."""
    round_id = deadlines.active_round()
    if enforce_deadline:
        deadlines.enforce_open(round_id)

    ok, errors = STORE.validate_team(driver_ids, constructor_ids, captain_id)
    if not ok:
        raise HTTPException(400, "; ".join(errors))
    if active_boost and active_boost not in {b["id"] for b in STORE_boosts()}:
        raise HTTPException(400, "Unknown boost")

    team = session.exec(select(GLTeam).where(GLTeam.profile_id == profile_id)).first()
    first_pick = team is None or not team.driver_ids

    # Count transfers vs the current permanent team (first pick is free).
    if first_pick:
        transfers = 0
    else:
        transfers = _diff(team.driver_ids, driver_ids) + _diff(team.constructor_ids, constructor_ids)

    free_available = team.free_transfers if team else FREE_TRANSFERS
    free_used = min(transfers, free_available)
    penalized = max(0, transfers - free_available)
    penalty = penalized * EXTRA_TRANSFER_COST

    # --- atomic write ---
    try:
        if team is None:
            team = GLTeam(profile_id=profile_id, free_transfers=FREE_TRANSFERS)

        # Record individual transfers (sold assets) for audit.
        if not first_pick:
            sold_drivers = set(team.driver_ids) - set(driver_ids)
            bought_drivers = list(set(driver_ids) - set(team.driver_ids))
            for i, sold in enumerate(sold_drivers):
                bought = bought_drivers[i] if i < len(bought_drivers) else None
                is_free = i < free_available
                session.add(GLTransfer(
                    profile_id=profile_id, round_id=round_id, asset_type="driver",
                    sold_id=sold, bought_id=bought,
                    sale_price=_price(sold, "driver"), purchase_price=_price(bought, "driver"),
                    free=is_free, penalty=0 if is_free else EXTRA_TRANSFER_COST,
                ))

        team.driver_ids = driver_ids
        team.constructor_ids = constructor_ids
        team.captain_id = captain_id
        team.active_boost = active_boost
        team.boost_driver_id = boost_driver_id
        team.boost_constructor_id = boost_constructor_id
        team.team_value = STORE.team_cost(driver_ids, constructor_ids)
        team.bank = round(BUDGET - team.team_value, 1)
        if not first_pick:
            # Consume free transfers; unused roll over (capped) on round rollover.
            team.free_transfers = max(0, free_available - free_used)
        team.updated_at = datetime.utcnow()
        session.add(team)
        session.commit()
        session.refresh(team)
    except Exception:
        session.rollback()
        raise
    return TransferOutcome(transfers, free_used, penalized, penalty)


def rollover_free_transfers(session: Session, profile_id: int) -> None:
    """At round rollover: grant a free transfer, capped at MAX_STORED_TRANSFERS."""
    team = session.exec(select(GLTeam).where(GLTeam.profile_id == profile_id)).first()
    if team:
        team.free_transfers = min(MAX_STORED_TRANSFERS, team.free_transfers + FREE_TRANSFERS)
        session.add(team)
        session.commit()


# small indirections kept here so store internals aren't imported widely
def STORE_boosts():
    from .store import BOOSTS
    return BOOSTS


def _price(asset_id: Optional[int], kind: str) -> float:
    if asset_id is None:
        return 0.0
    s = STORE.season
    if kind == "driver":
        d = s.drivers.get(asset_id)
        return d.price if d else 0.0
    c = s.constructors.get(asset_id)
    return c.price if c else 0.0
