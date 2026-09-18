"""OpenF1 data provider — real motorsport data behind the existing interface.

Fantasy business logic never touches OpenF1 response shapes. Raw OpenF1 JSON is
fetched here and passed through :mod:`normalize` into GRIDLOCK domain objects
(the same ``Season`` the mock provider produces), from which the scoring engine
works. Selected with ``MOTORSPORT_DATA_PROVIDER=openf1``.

OpenF1 (https://openf1.org/) is a free, key-less REST API for historical data;
realtime access may require a subscription. Network access and endpoint coverage
vary by environment, so this provider is defensive: on any fetch/parse failure it
records the failure and falls back to the seeded season rather than crashing the
app. All normalization tolerates missing fields (not every historical session
carries every field).

Endpoints used (all GET, JSON):
  /sessions, /drivers, /meetings, /session_result, /starting_grid,
  /laps, /pit, /position, /intervals, /race_control, /weather
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlencode

from .provider import MotorsportDataProvider
from .season import Season, build_season

UTC = timezone.utc
OPENF1_BASE = os.environ.get("OPENF1_BASE_URL", "https://api.openf1.org/v1")
OPENF1_TOKEN = os.environ.get("OPENF1_API_KEY")  # only needed for realtime
HTTP_TIMEOUT = float(os.environ.get("OPENF1_TIMEOUT", "12"))
# How long a built season is trusted before the next request triggers a full
# rebuild from OpenF1. A rebuild is a deterministic recompute from whatever
# OpenF1 currently reports — this *is* the reconciliation mechanism: if a
# classification changes upstream (e.g. a post-race penalty), the next
# rebuild reflects it automatically. Nothing is ever hand-patched.
SEASON_CACHE_TTL = float(os.environ.get("GRIDLOCK_SEASON_CACHE_TTL", "300"))


class OpenF1Client:
    """Thin HTTP client for OpenF1. Returns parsed JSON lists, or [] on failure."""

    def __init__(self, base: str = OPENF1_BASE, token: Optional[str] = OPENF1_TOKEN) -> None:
        self.base = base.rstrip("/")
        self.token = token

    def get(self, path: str, **params) -> List[dict]:
        qs = urlencode({k: v for k, v in params.items() if v is not None})
        url = f"{self.base}/{path.lstrip('/')}"
        if qs:
            url += f"?{qs}"
        req = urllib.request.Request(url, headers=self._headers())
        # The sandbox is flaky: the same query sometimes comes back empty, then
        # returns the real rows moments later. Retry a couple times before
        # treating an empty response as "no data" rather than "try again".
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:  # noqa: S310 (trusted host)
                    data = json.loads(resp.read().decode("utf-8"))
                    rows = data if isinstance(data, list) else [data]
                    if rows or attempt == 2:
                        return rows
            except Exception:
                if attempt == 2:
                    return []
            time.sleep(0.4 * (attempt + 1))
        return []

    def _headers(self) -> dict:
        h = {"Accept": "application/json", "User-Agent": "GRIDLOCK/1.0"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    # Convenience wrappers (kept 1:1 with OpenF1 resources).
    def sessions(self, **p): return self.get("sessions", **p)
    def drivers(self, **p): return self.get("drivers", **p)
    def meetings(self, **p): return self.get("meetings", **p)
    def session_result(self, **p): return self.get("session_result", **p)
    def starting_grid(self, **p): return self.get("starting_grid", **p)
    def laps(self, **p): return self.get("laps", **p)
    def pit(self, **p): return self.get("pit", **p)
    def position(self, **p): return self.get("position", **p)
    def intervals(self, **p): return self.get("intervals", **p)
    def race_control(self, **p): return self.get("race_control", **p)
    def weather(self, **p): return self.get("weather", **p)


class OpenF1Provider(MotorsportDataProvider):
    """Live/historical provider. Falls back to the seeded season if OpenF1 is
    unreachable, so the product never hard-fails on a data outage."""

    name = "openf1"
    live = True

    def __init__(self, year: Optional[int] = None) -> None:
        self.year = year or int(os.environ.get("GRIDLOCK_SEASON_YEAR", "2026"))
        self.client = OpenF1Client()
        self._season: Optional[Season] = None
        self.last_error: Optional[str] = None
        self.last_synced_at: Optional[datetime] = None
        self.last_sync_duration: Optional[float] = None
        self.last_sync_source: str = "none"  # "openf1" or "fallback"
        self.sync_count: int = 0
        self.last_reconciled_changes: int = 0

    def get_season(self, force: bool = False) -> Season:
        stale = (
            self._season is None
            or self.last_synced_at is None
            or (datetime.now(UTC) - self.last_synced_at).total_seconds() > SEASON_CACHE_TTL
        )
        if not force and not stale:
            return self._season
        self._sync()
        return self._season

    def _sync(self) -> None:
        """One deterministic recompute from whatever OpenF1 reports right
        now. Never patches individual points — a full, reproducible rebuild
        is the only way results ever change here. Reconciliation (persisting
        the ledger baseline + auditing any real change) happens after, and
        can never fail the sync itself."""
        from .reconciliation import finish_run, reconcile, start_run
        t0 = time.monotonic()
        run_id = start_run(self.name)
        changes = 0
        try:
            from .normalize import normalize_season
            season = normalize_season(self.client, self.year)
            if season is None:
                raise RuntimeError("OpenF1 returned no usable data")
            self._season = season
            self.last_error = None
            self.last_sync_source = "openf1"
            changes = reconcile(season, run_id)
            finish_run(run_id, "ok", changes)
        except Exception as exc:  # defensive: never crash the app on a data issue
            self.last_error = str(exc)
            finish_run(run_id, "failed", 0, error=str(exc))
            if self._season is None:
                self._season = build_season()  # seeded fallback keeps the app alive
                self.last_sync_source = "fallback"
        self.last_sync_duration = round(time.monotonic() - t0, 2)
        self.last_synced_at = datetime.now(UTC)
        self.last_reconciled_changes = changes
        self.sync_count += 1

    def health(self) -> dict:
        s = self._season
        rounds_total = len(s.races) if s else 0
        rounds_with_winner = sum(1 for r in s.races if r.winner_id) if s else 0
        rounds_elapsed = sum(1 for r in s.races if r.status == "completed") if s else 0
        return {
            "provider": self.name,
            "season_year": self.year,
            "last_synced_at": self.last_synced_at.isoformat() if self.last_synced_at else None,
            "last_sync_duration_seconds": self.last_sync_duration,
            "last_sync_source": self.last_sync_source,
            "sync_count": self.sync_count,
            "cache_ttl_seconds": SEASON_CACHE_TTL,
            "last_error": self.last_error,
            "next_round": s.next_round if s else None,
            "rounds_elapsed": rounds_elapsed,
            "rounds_with_confirmed_winner": rounds_with_winner,
            "rounds_total": rounds_total,
            "data_gaps": rounds_elapsed - rounds_with_winner,
            "last_reconciled_changes": self.last_reconciled_changes,
        }
