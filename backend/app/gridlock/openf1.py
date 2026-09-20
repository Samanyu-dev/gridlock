"""OpenF1 data provider — real motorsport data behind the existing interface.

Fantasy business logic never touches OpenF1 response shapes. Raw OpenF1 JSON is
fetched here and passed through :mod:`normalize` into GRIDLOCK domain objects
(the same ``Season`` the mock provider produces), from which the scoring engine
works. Selected with ``MOTORSPORT_DATA_PROVIDER=openf1``.

OpenF1 (https://openf1.org/) is a free, key-less REST API for historical data;
realtime access may require a subscription. Network access and endpoint coverage
vary by environment, so this provider is defensive: on any fetch/parse failure it
records the failure and retains the last real snapshot. All normalization tolerates missing fields (not every historical session
carries every field).

Endpoints used (all GET, JSON):
  /sessions, /drivers, /meetings, /session_result, /starting_grid,
  /laps, /pit, /position, /intervals, /race_control, /weather
"""
from __future__ import annotations

import json
import os
import time
import threading
from fastapi import HTTPException
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlencode

from .provider import MotorsportDataProvider
from .season import Season

UTC = timezone.utc
OPENF1_BASE = os.environ.get("OPENF1_BASE_URL", "https://api.openf1.org/v1")
OPENF1_TOKEN = os.environ.get("OPENF1_API_KEY")  # only needed for realtime
HTTP_TIMEOUT = float(os.environ.get("OPENF1_TIMEOUT", "8"))
# How long a built season is trusted before the next request triggers a full
# rebuild from OpenF1. A rebuild is a deterministic recompute from whatever
# OpenF1 currently reports — this *is* the reconciliation mechanism: if a
# classification changes upstream (e.g. a post-race penalty), the next
# rebuild reflects it automatically. Nothing is ever hand-patched.
SEASON_CACHE_TTL = float(os.environ.get("GRIDLOCK_SEASON_CACHE_TTL", "300"))


class OpenF1Client:
    """Thin HTTP client for OpenF1. Returns parsed JSON lists on success; an
    HTTP/network failure raises rather than returning [] — an empty list is
    a legitimate response (e.g. a session with no pit stops) and must never
    be confused with "the request failed", so callers (ultimately _sync())
    can tell a real empty result apart from a fetch that needs to keep the
    last known-good season instead of overwriting it with nothing."""

    def __init__(self, base: str = OPENF1_BASE, token: Optional[str] = OPENF1_TOKEN) -> None:
        self.base = base.rstrip("/")
        self.token = token
        self._http_lock = threading.Lock()
        self._last_request = 0.0
        self._responses = {}
        self._loaded = False

    def get(self, path: str, ttl: Optional[float] = None, **params) -> List[dict]:
        """``ttl`` (seconds) is cache-control, kept separate from ``params``
        (the actual query string) so it can never leak into the request URL.
        Callers that know a specific session's real-world timing (see
        normalize._result_ttl) should always pass one; the fallback here is
        deliberately short (never the old flat 6h) so a caller that forgets
        fails toward re-fetching too often rather than freezing stale/partial
        results for hours."""
        qs = urlencode({k: v for k, v in params.items() if v is not None})
        url = f"{self.base}/{path.lstrip('/')}"
        if qs:
            url += f"?{qs}"
        req = urllib.request.Request(url, headers=self._headers())
        # OpenF1's free tier is limited to 30 requests/minute. Persist raw
        # responses so refreshes mostly reuse history instead of replaying it.
        with self._http_lock:
            if not self._loaded:
                from .feed_cache import load_raw
                self._responses = load_raw()
                self._loaded = True
            cached = self._responses.get(url)
            effective_ttl = ttl if ttl is not None else (300.0 if path in ('meetings', 'sessions') else 30.0)
            if cached and time.time() - cached['at'] < effective_ttl:
                return cached['rows']
            gap = max(0, 2.1 - (time.monotonic() - self._last_request))
            if gap:
                time.sleep(gap)
            self._last_request = time.monotonic()
            # An HTTP failure is not an empty classification. Abort the
            # refresh and retain the last known-good season.
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                data = json.loads(resp.read().decode('utf-8'))
            rows = data if isinstance(data, list) else [data]
            self._responses[url] = {'at': time.time(), 'rows': rows}
            return rows

    def persist(self):
        from .feed_cache import save_raw
        if self._loaded:
            save_raw(self._responses)

    def _headers(self) -> dict:
        h = {"Accept": "application/json", "User-Agent": "GRIDLOCK/1.0"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    # Convenience wrappers (kept 1:1 with OpenF1 resources).
    def sessions(self, ttl=None, **p): return self.get("sessions", ttl=ttl, **p)
    def drivers(self, ttl=None, **p): return self.get("drivers", ttl=ttl, **p)
    def meetings(self, ttl=None, **p): return self.get("meetings", ttl=ttl, **p)
    def session_result(self, ttl=None, **p): return self.get("session_result", ttl=ttl, **p)
    def starting_grid(self, ttl=None, **p): return self.get("starting_grid", ttl=ttl, **p)
    def laps(self, ttl=None, **p): return self.get("laps", ttl=ttl, **p)
    def pit(self, ttl=None, **p): return self.get("pit", ttl=ttl, **p)
    def position(self, ttl=None, **p): return self.get("position", ttl=ttl, **p)
    def intervals(self, ttl=None, **p): return self.get("intervals", ttl=ttl, **p)
    def race_control(self, ttl=None, **p): return self.get("race_control", ttl=ttl, **p)
    def weather(self, ttl=None, **p): return self.get("weather", ttl=ttl, **p)


class OpenF1Provider(MotorsportDataProvider):
    """Live/historical provider with durable real-data caching."""

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
        self._sync_lock = threading.Lock()
        self._cache_loaded = False

    def get_season(self, force: bool = False) -> Season:
        if self._season is not None and not force:
            self._maybe_schedule_refresh()
            return self._season
        with self._sync_lock:
            if not self._cache_loaded:
                from .feed_cache import load
                cached = load(self.year)
                if cached:
                    self._season, self.last_synced_at = cached
                    self.last_sync_source = 'persistent-cache'
                self._cache_loaded = True
            if force or self._season is None:
                self._sync()
            if self._season is None:
                raise HTTPException(503, 'Race data is temporarily unavailable. Please retry shortly.')
            return self._season

    def _is_stale(self) -> bool:
        anchor = getattr(self, '_last_attempt', None) or self.last_synced_at
        return anchor is None or (datetime.now(UTC) - anchor).total_seconds() > SEASON_CACHE_TTL

    def _maybe_schedule_refresh(self) -> None:
        """Freshness is a provider concern, not a route concern: every
        get_season() call runs this same check, not just /meta's explicit
        BackgroundTasks hook below — an API consumer that never calls /meta
        must not be able to keep an in-memory season stale indefinitely."""
        if not self._is_stale():
            return
        if not self._sync_lock.acquire(blocking=False):
            return  # another thread is already refreshing
        threading.Thread(target=self._sync_and_release, daemon=True).start()

    def _sync_and_release(self) -> None:
        try:
            self._sync()
        finally:
            self._sync_lock.release()

    def refresh_if_stale(self):
        # Kept for /meta's explicit BackgroundTasks hook, which gets the
        # refresh running slightly sooner for that route — get_season() now
        # runs the same check on every call regardless, so this is no longer
        # the *only* path that keeps the season fresh.
        self._maybe_schedule_refresh()

    def _sync(self) -> None:
        """One deterministic recompute from whatever the feed reports right
        now. Never patches individual points — a full, reproducible rebuild
        is the only way results ever change here. Reconciliation (persisting
        the ledger baseline + auditing any real change) happens after, and
        can never fail the sync itself.

        Cold (no season yet — ``self._season is None``): OpenF1's free-tier
        rate limit serializes every HTTP call to ~1 per 2.1s regardless of
        how many rounds fetch "concurrently", so rebuilding a ~24-round
        season that way can take minutes — past a serverless execution
        window. Jolpica has no such per-round cost (its whole-season
        calendar/results/qualifying come from a handful of paginated calls,
        not one call per round), so it bootstraps the very first snapshot,
        persisted immediately.

        Warm (a season already exists): normalize_season only re-fetches
        rounds that are new or still within their live/provisional window
        (see normalize._result_ttl's sibling round-level check) — already-
        finalized rounds are reused from the prior snapshot, so a routine
        resync stays fast no matter how many historical rounds exist."""
        from .reconciliation import finish_run, reconcile, start_run
        t0 = time.monotonic()
        run_id = start_run(self.name)
        changes = 0
        try:
            from .normalize import normalize_season
            if self._season is None:
                from .jolpica import JolpicaClient
                source = 'jolpica'
                season = normalize_season(JolpicaClient(self.year), self.year, source=source)
            else:
                source = 'openf1'
                season = normalize_season(self.client, self.year, base=self._season, source=source)

            if season is None:
                raise RuntimeError("No usable data from any provider")
            season.source = source
            self._season = season
            from .feed_cache import save
            save(season)
            self.last_error = None
            self.last_sync_source = source
            changes = reconcile(season, run_id)
            finish_run(run_id, "ok", changes)
        except Exception as exc:  # defensive: never crash the app on a data issue
            self.last_error = str(exc)
            finish_run(run_id, "failed", 0, error=str(exc))
            # Keep the last real snapshot; never invent a seeded season.
            self.last_sync_source = "stale-cache" if self._season else "unavailable"
        self.client.persist()
        self.last_sync_duration = round(time.monotonic() - t0, 2)
        self._last_attempt = datetime.now(UTC)
        if self.last_error is None:
            self.last_synced_at = self._last_attempt
        self.last_reconciled_changes = changes
        self.sync_count += 1

    def health(self) -> dict:
        s = self._season
        rounds_total = len(s.races) if s else 0
        rounds_with_winner = sum(1 for r in s.races if r.winner_id) if s else 0
        rounds_elapsed = sum(1 for r in s.races if r.status == "completed") if s else 0
        return {
            "provider": self.name,
            "data_source": s.source if s else None,
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
