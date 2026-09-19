"""Immutable team snapshots + weekend scoring from the auditable ledger.

Historical scores are always computed from the *snapshot* of the team as it
stood at a round's deadline — never from the user's current team. Scoring reuses
each driver/constructor's per-round ledger (produced by the engine) and applies
captain / boost multipliers, emitting a full breakdown the UI renders verbatim.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlmodel import Session, select

from . import deadlines
from .models import GLTeam, GLTeamSnapshot
from .scoring import ScoreState, round_display
from .store import CAPTAIN_MULTIPLIER, STORE

UTC = timezone.utc
UNDERDOG_MULT = 2.0
UNDERDOG_RANGE = (6, 10)


def resolve_team(session: Session, profile_id: int, round_id: int) -> Optional[dict]:
    """The team as it stood for a given round: the snapshot taken at that
    round's deadline if one exists, else the profile's current live team (the
    same fallback ``/team/score`` has always used for rounds nobody explicitly
    re-saved) — one place other features (ownership, H2H, optimal-team) share
    instead of re-deriving this lookup."""
    snap = session.exec(
        select(GLTeamSnapshot).where(
            GLTeamSnapshot.profile_id == profile_id, GLTeamSnapshot.round_id == round_id,
        )
    ).first()
    if snap:
        return {
            "driver_ids": snap.driver_ids, "constructor_ids": snap.constructor_ids,
            "captain_id": snap.captain_id, "active_boost": snap.active_boost,
            "boost_driver_id": snap.boost_driver_id, "boost_constructor_id": snap.boost_constructor_id,
        }
    team = session.exec(select(GLTeam).where(GLTeam.profile_id == profile_id)).first()
    if not team or not team.driver_ids:
        return None
    return {
        "driver_ids": team.driver_ids, "constructor_ids": team.constructor_ids,
        "captain_id": team.captain_id, "active_boost": team.active_boost,
        "boost_driver_id": team.boost_driver_id, "boost_constructor_id": team.boost_constructor_id,
    }


def _round_state(round_id: int) -> str:
    """Completed rounds are FINAL in the demo; the active round is LIVE until its
    deadline, then PROVISIONAL. A real deployment sets FINAL on official results."""
    s = STORE.season
    if round_id < s.next_round:
        return ScoreState.FINAL.value
    if round_id == s.next_round:
        return ScoreState.PROVISIONAL.value if deadlines.is_locked(round_id) else ScoreState.LIVE.value
    return ScoreState.LIVE.value


def score_team_for_round(
    driver_ids: List[int],
    constructor_ids: List[int],
    captain_id: Optional[int],
    active_boost: Optional[str],
    boost_driver_id: Optional[int],
    boost_constructor_id: Optional[int],
    round_id: int,
) -> dict:
    """Return {total, state, assets:[{ref,name,subtotal,entries,multiplier}]}."""
    s = STORE.season
    assets = []
    total = 0.0

    for did in driver_ids:
        d = s.drivers.get(did)
        if not d:
            continue
        entries = list(d.round_breakdown.get(round_id, []))
        subtotal = float(d.round_points.get(round_id, 0))
        mult = 1.0
        bonus_entries = []
        if captain_id == did:
            mult *= CAPTAIN_MULTIPLIER
            bonus_entries.append({"rule_code": "CAPTAIN", "phase": "bonus", "tag": "bonus",
                                  "label": f"Captain {CAPTAIN_MULTIPLIER:g}×", "points": round_display(subtotal * (CAPTAIN_MULTIPLIER - 1))})
        if active_boost == "underdog" and boost_driver_id == did:
            finish = d.results.get(round_id, {}).get("finish")
            if finish is not None and UNDERDOG_RANGE[0] <= finish <= UNDERDOG_RANGE[1]:
                mult *= UNDERDOG_MULT
                bonus_entries.append({"rule_code": "UNDERDOG", "phase": "bonus", "tag": "bonus",
                                      "label": f"Underdog {UNDERDOG_MULT:g}× (P{finish})", "points": round_display(subtotal * (UNDERDOG_MULT - 1))})
        final = round_display(subtotal * mult)
        total += final
        assets.append({
            "ref": f"driver:{did}", "name": d.name, "short": d.short, "color": s.constructors[d.constructor_id].color,
            "base": round_display(subtotal), "multiplier": mult, "subtotal": final,
            "entries": entries + bonus_entries,
        })

    for cid in constructor_ids:
        c = s.constructors.get(cid)
        if not c:
            continue
        entries = list(c.round_breakdown.get(round_id, []))
        subtotal = float(c.round_points.get(round_id, 0))
        final = round_display(subtotal)
        total += final
        assets.append({
            "ref": f"constructor:{cid}", "name": c.name, "short": c.short, "color": c.color,
            "base": round_display(subtotal), "multiplier": 1.0, "subtotal": final,
            "entries": entries,
        })

    return {"total": round_display(total), "state": _round_state(round_id), "assets": assets, "round": round_id}


def build_snapshot(session: Session, profile_id: int, round_id: int, state: str = "provisional") -> Optional[GLTeamSnapshot]:
    """Create (or update, while still open) the immutable snapshot for a round."""
    team = session.exec(select(GLTeam).where(GLTeam.profile_id == profile_id)).first()
    if not team or not team.driver_ids:
        return None
    existing = session.exec(
        select(GLTeamSnapshot).where(
            GLTeamSnapshot.profile_id == profile_id, GLTeamSnapshot.round_id == round_id
        )
    ).first()
    if existing and existing.state == ScoreState.FINAL.value:
        return existing  # never mutate a finalized snapshot

    s = STORE.season
    prices = {f"driver:{d}": s.drivers[d].price for d in team.driver_ids if d in s.drivers}
    prices.update({f"constructor:{c}": s.constructors[c].price for c in team.constructor_ids if c in s.constructors})
    scored = score_team_for_round(
        team.driver_ids, team.constructor_ids, team.captain_id,
        team.active_boost, team.boost_driver_id, team.boost_constructor_id, round_id,
    )

    snap = existing or GLTeamSnapshot(profile_id=profile_id, round_id=round_id)
    snap.driver_ids = list(team.driver_ids)
    snap.constructor_ids = list(team.constructor_ids)
    snap.captain_id = team.captain_id
    snap.active_boost = team.active_boost
    snap.boost_driver_id = team.boost_driver_id
    snap.boost_constructor_id = team.boost_constructor_id
    snap.prices = prices
    snap.team_value = team.team_value
    snap.points = scored["total"]
    snap.state = state
    snap.locked_at = datetime.now(UTC)
    session.add(snap)
    session.commit()
    session.refresh(snap)
    return snap
