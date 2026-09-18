"""Transfer trends — one shared service layer so driver pages, constructor
pages, and the transfer centre all read the same numbers instead of each
re-deriving them from GLTransfer rows.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from sqlmodel import Session, select

from . import ownership as ownership_mod
from .models import GLTransfer


def compute_transfer_trends(
    session: Session, since_round: Optional[int] = None, profile_ids: Optional[List[int]] = None,
) -> dict:
    """{"drivers": {id: {"in": n, "out": n, "net": n}}, "constructors": {...}}"""
    rows = session.exec(select(GLTransfer)).all()
    if profile_ids is not None:
        allowed = set(profile_ids)
        rows = [r for r in rows if r.profile_id in allowed]
    if since_round is not None:
        rows = [r for r in rows if r.round_id >= since_round]

    def _tally(asset_type: str) -> Dict[int, dict]:
        tally: Dict[int, dict] = {}
        for r in rows:
            if r.asset_type != asset_type:
                continue
            if r.bought_id is not None:
                tally.setdefault(r.bought_id, {"in": 0, "out": 0})
                tally[r.bought_id]["in"] += 1
            if r.sold_id is not None:
                tally.setdefault(r.sold_id, {"in": 0, "out": 0})
                tally[r.sold_id]["out"] += 1
        for v in tally.values():
            v["net"] = v["in"] - v["out"]
        return tally

    return {"drivers": _tally("driver"), "constructors": _tally("constructor")}


def ownership_delta(session: Session, profile_ids: Optional[List[int]] = None) -> dict:
    """Ownership % change since the previous locked round — reuses the real
    ownership computation twice and diffs it, never a separate estimate."""
    current_round = ownership_mod.ownership_round()
    if current_round is None:
        return {"round": None, "previous_round": None, "drivers": {}, "constructors": {}}
    previous_round = current_round - 1 if current_round > 1 else None

    current = ownership_mod.compute_ownership(session, round_id=current_round, profile_ids=profile_ids)
    previous = (
        ownership_mod.compute_ownership(session, round_id=previous_round, profile_ids=profile_ids)
        if previous_round else {"drivers": {}, "constructors": {}}
    )

    def _delta(cur: dict, prev: dict) -> Dict[int, float]:
        return {aid: round(stats["owned_pct"] - prev.get(aid, {}).get("owned_pct", 0.0), 1) for aid, stats in cur.items()}

    return {
        "round": current_round, "previous_round": previous_round,
        "drivers": _delta(current["drivers"], previous["drivers"]),
        "constructors": _delta(current["constructors"], previous["constructors"]),
    }
