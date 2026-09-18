"""Real fantasy ownership — driver/constructor/captain/Underdog percentages,
computed live from actual squads (never fabricated).

Only ever reveals the *latest locked* round. A round's picks are gameable
(free transfers) until its deadline, so exposing ownership for the active,
still-open round would leak opponents' unlocked future selections — this is
the one hard rule the feature exists under.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from sqlmodel import Session, select

from . import deadlines
from .models import GLTeam
from .snapshots import resolve_team


def ownership_round() -> Optional[int]:
    """The newest round whose picks are locked in, or None before round 1
    has even locked (nothing to reveal yet — an honest empty state)."""
    active = deadlines.active_round()
    if deadlines.is_locked(active):
        return active
    return active - 1 if active > 1 else None


def compute_ownership(
    session: Session, round_id: Optional[int] = None, profile_ids: Optional[List[int]] = None,
) -> dict:
    if round_id is None:
        round_id = ownership_round()
    if round_id is None:
        return {"round": None, "total_teams": 0, "drivers": {}, "constructors": {}}

    if profile_ids is None:
        profile_ids = list(session.exec(select(GLTeam.profile_id)))

    driver_count: Dict[int, int] = {}
    captain_count: Dict[int, int] = {}
    underdog_count: Dict[int, int] = {}
    constructor_count: Dict[int, int] = {}
    total = 0
    for pid in profile_ids:
        team = resolve_team(session, pid, round_id)
        if team is None:
            continue
        total += 1
        for did in team["driver_ids"]:
            driver_count[did] = driver_count.get(did, 0) + 1
        for cid in team["constructor_ids"]:
            constructor_count[cid] = constructor_count.get(cid, 0) + 1
        if team["captain_id"] is not None:
            captain_count[team["captain_id"]] = captain_count.get(team["captain_id"], 0) + 1
        if team["active_boost"] == "underdog" and team["boost_driver_id"] is not None:
            underdog_count[team["boost_driver_id"]] = underdog_count.get(team["boost_driver_id"], 0) + 1

    def pct(n: int) -> float:
        return round(n / total * 100, 1) if total else 0.0

    drivers = {
        did: {
            "owned_pct": pct(n),
            "captain_pct": pct(captain_count.get(did, 0)),
            "underdog_pct": pct(underdog_count.get(did, 0)),
        }
        for did, n in driver_count.items()
    }
    constructors = {cid: {"owned_pct": pct(n)} for cid, n in constructor_count.items()}
    return {"round": round_id, "total_teams": total, "drivers": drivers, "constructors": constructors}
