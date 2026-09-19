"""Notifications — real, derived-on-read alerts about the user's own state.

Deliberately never persisted (no read/unread table): every call reflects
exactly what's true right now, computed from the same team/deadline/ledger
data every other screen already reads. Nothing to keep in sync, nothing that
can go stale or get "stuck" showing an alert that's no longer true.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlmodel import Session, select

from . import deadlines
from .models import GLLedgerAudit, GLTeam
from .store import STORE

UTC = timezone.utc


def _hours_to(dt: datetime) -> float:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return (dt - datetime.now(UTC)).total_seconds() / 3600


def compute_notifications(session: Session, profile_id: int) -> List[dict]:
    s = STORE.season
    out: List[dict] = []
    team = session.exec(select(GLTeam).where(GLTeam.profile_id == profile_id)).first()

    active_round = deadlines.active_round()
    active_race = next((r for r in s.races if r.round == active_round), None)
    state = deadlines.round_state(active_race) if active_race else None

    if team and team.driver_ids and state == "OPEN" and active_race:
        hours = _hours_to(active_race.deadline)
        if team.captain_id is None:
            out.append({
                "type": "captain_missing", "severity": "warning", "round": active_round,
                "text": "You haven't set a captain for this round — your top scorer won't get the 2× bonus.",
            })
        if team.free_transfers >= 1:
            n = int(team.free_transfers)
            out.append({
                "type": "unused_transfer", "severity": "info", "round": active_round,
                "text": f"You have {n} free transfer{'s' if n != 1 else ''} unused this round.",
            })
        if team.active_boost != "underdog":
            out.append({
                "type": "unused_underdog", "severity": "info", "round": active_round,
                "text": "Underdog boost isn't armed this round.",
            })
        if 0 < hours <= 24:
            out.append({
                "type": "lock_reminder", "severity": "urgent" if hours <= 6 else "warning", "round": active_round,
                "text": f"Team locks in {max(1, round(hours))} hour{'s' if round(hours) != 1 else ''} — round {active_round}.",
            })

    last_round = s.next_round - 1
    last_race = next((r for r in s.races if r.round == last_round), None)
    if last_race and deadlines.round_state(last_race) == "FINAL":
        out.append({
            "type": "results_final", "severity": "info", "round": last_round,
            "text": f"Round {last_round} results are final — {last_race.name}.",
        })

        if team and team.driver_ids:
            corrected = session.exec(
                select(GLLedgerAudit).where(
                    GLLedgerAudit.round_id == last_round, GLLedgerAudit.entity_type == "driver",
                    GLLedgerAudit.entity_id.in_(team.driver_ids),
                )
            ).first() or session.exec(
                select(GLLedgerAudit).where(
                    GLLedgerAudit.round_id == last_round, GLLedgerAudit.entity_type == "constructor",
                    GLLedgerAudit.entity_id.in_(team.constructor_ids),
                )
            ).first()
            if corrected:
                out.append({
                    "type": "score_corrected", "severity": "warning", "round": last_round,
                    "text": f"Your round {last_round} score was adjusted after an official result update.",
                })

    return out
