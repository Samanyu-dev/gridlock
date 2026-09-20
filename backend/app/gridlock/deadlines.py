"""Server-authoritative fantasy deadlines and round lifecycle.

Every team-changing operation validates the deadline here, server-side. The
frontend countdown is informational only. Default strategy: the deadline is the
start of qualifying (already computed per weekend in the season model).

The round lifecycle (UPCOMING -> OPEN -> LOCKED -> LIVE -> PROVISIONAL ->
FINAL) is one function of real dates + real result data — never a scattered
set of timestamp checks re-invented per screen.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException

from .store import STORE

UTC = timezone.utc

# A race is "live" for roughly this long from lights-out, and results are
# treated as provisional (not yet FIA-final) for this long after the checkered
# flag — real-world post-race technical checks take a few hours, not days.
LIVE_WINDOW = timedelta(hours=2, minutes=30)
PROVISIONAL_WINDOW = timedelta(hours=24)


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def active_round() -> int:
    return STORE.season.next_round


def deadline_for_round(round_id: int) -> Optional[datetime]:
    for r in STORE.season.races:
        if r.round == round_id:
            return _aware(r.deadline)
    return None


def is_locked(round_id: int, at: Optional[datetime] = None) -> bool:
    dl = deadline_for_round(round_id)
    if dl is None:
        return False
    return (at or _now()) >= dl


def enforce_open(round_id: int) -> None:
    """Raise 423 if the round's deadline has passed."""
    if is_locked(round_id):
        raise HTTPException(423, "The deadline for this round has passed — your team is locked.")


def round_state(race, at: Optional[datetime] = None) -> str:
    """UPCOMING / OPEN / LOCKED / LIVE / PROVISIONAL / FINAL for one race,
    derived purely from real dates (and, for FINAL, real result data) — the
    single source of truth every screen should read instead of re-deriving it."""
    now = at or _now()
    deadline = _aware(race.deadline)
    start = _aware(race.race_start)
    if deadline and now < deadline:
        # "OPEN" once the previous round's live window has passed; otherwise
        # it's just a future round on the calendar, not yet the active pick.
        return "OPEN" if race.round == STORE.season.next_round else "UPCOMING"
    if start and now < start:
        return "LOCKED"
    if start and now <= start + LIVE_WINDOW:
        return "LIVE"
    if start and now <= start + LIVE_WINDOW + PROVISIONAL_WINDOW:
        return "PROVISIONAL"
    return "FINAL" if race.classification else "PROVISIONAL"
