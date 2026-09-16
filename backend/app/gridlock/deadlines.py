"""Server-authoritative fantasy deadlines.

Every team-changing operation validates the deadline here, server-side. The
frontend countdown is informational only. Default strategy: the deadline is the
start of qualifying (already computed per weekend in the season model).
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException

from .store import STORE

UTC = timezone.utc


def _now() -> datetime:
    return datetime.now(UTC)


def active_round() -> int:
    return STORE.season.next_round


def deadline_for_round(round_id: int) -> datetime | None:
    for r in STORE.season.races:
        if r.round == round_id:
            dl = r.deadline
            return dl if dl.tzinfo else dl.replace(tzinfo=UTC)
    return None


def is_locked(round_id: int, at: datetime | None = None) -> bool:
    dl = deadline_for_round(round_id)
    if dl is None:
        return False
    return (at or _now()) >= dl


def enforce_open(round_id: int) -> None:
    """Raise 423 if the round's deadline has passed."""
    if is_locked(round_id):
        raise HTTPException(423, "The deadline for this round has passed — your team is locked.")
