"""League activity feed — real events derived on read, never persisted.

Transfers and boosts are only ever surfaced for rounds that are already
locked: revealing them earlier would leak a live strategic advantage over
league rivals who haven't made their own picks yet.
"""
from __future__ import annotations

from datetime import datetime
from typing import List

from sqlmodel import Session, select

from . import deadlines
from .models import GLLeagueMember, GLProfile, GLTeamSnapshot, GLTransfer
from .snapshots import resolve_team, score_team_for_round
from .store import STORE


def _asset_name(asset_type: str, asset_id: int) -> str:
    s = STORE.season
    if asset_type == "driver":
        d = s.drivers.get(asset_id)
        return d.name if d else "a driver"
    c = s.constructors.get(asset_id)
    return c.name if c else "a constructor"


def compute_activity(session: Session, league_id: int, limit: int = 50) -> List[dict]:
    members = session.exec(select(GLLeagueMember).where(GLLeagueMember.league_id == league_id)).all()
    member_ids = [m.profile_id for m in members]
    profiles = {p.id: p for p in session.exec(select(GLProfile).where(GLProfile.id.in_(member_ids)))} if member_ids else {}

    s = STORE.season
    locked_rounds = {r.round for r in s.races if deadlines.is_locked(r.round)}
    events: List[dict] = []

    for m in members:
        prof = profiles.get(m.profile_id)
        if not prof:
            continue
        events.append({
            "type": "join", "round": None, "at": m.joined_at,
            "text": f"{prof.team_name} joined the league.",
        })

    if member_ids:
        for t in session.exec(select(GLTransfer).where(GLTransfer.profile_id.in_(member_ids))):
            if t.round_id not in locked_rounds:
                continue
            prof = profiles.get(t.profile_id)
            if not prof:
                continue
            bought = _asset_name(t.asset_type, t.bought_id) if t.bought_id else None
            sold = _asset_name(t.asset_type, t.sold_id) if t.sold_id else None
            if bought and sold:
                text = f"{prof.team_name} swapped {sold} for {bought} (round {t.round_id})."
            elif bought:
                text = f"{prof.team_name} brought in {bought} (round {t.round_id})."
            else:
                continue
            events.append({"type": "transfer", "round": t.round_id, "at": t.created_at, "text": text})

        for snap in session.exec(select(GLTeamSnapshot).where(GLTeamSnapshot.profile_id.in_(member_ids))):
            if snap.round_id not in locked_rounds or snap.active_boost != "underdog" or not snap.boost_driver_id:
                continue
            prof = profiles.get(snap.profile_id)
            if not prof:
                continue
            driver = s.drivers.get(snap.boost_driver_id)
            events.append({
                "type": "boost", "round": snap.round_id, "at": snap.locked_at,
                "text": f"{prof.team_name} armed Underdog on {driver.name if driver else 'a driver'} (round {snap.round_id}).",
            })

        for rnd in sorted(locked_rounds):
            race = next((r for r in s.races if r.round == rnd), None)
            if not race:
                continue
            best_pid, best_total = None, None
            for pid in member_ids:
                team = resolve_team(session, pid, rnd)
                if not team:
                    continue
                scored = score_team_for_round(
                    team["driver_ids"], team["constructor_ids"], team["captain_id"],
                    team["active_boost"], team["boost_driver_id"], team["boost_constructor_id"], rnd,
                )
                if best_total is None or scored["total"] > best_total:
                    best_pid, best_total = pid, scored["total"]
            if best_pid is not None and best_total:
                prof = profiles.get(best_pid)
                if prof:
                    events.append({
                        "type": "round_win", "round": rnd, "at": race.race_start,
                        "text": f"{prof.team_name} won round {rnd} with {best_total} pts.",
                    })

    def _sort_key(e: dict):
        # Mix of naive (default_factory=utcnow) and aware (race_start) times
        # across sources — normalize to naive so sorting never raises.
        at = e["at"]
        if at and at.tzinfo is not None:
            at = at.replace(tzinfo=None)
        return at or datetime.min

    events.sort(key=_sort_key, reverse=True)
    return events[:limit]
