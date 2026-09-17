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
from typing import List, Optional
from urllib.parse import urlencode

from .provider import MotorsportDataProvider
from .season import Season, build_season

OPENF1_BASE = os.environ.get("OPENF1_BASE_URL", "https://api.openf1.org/v1")
OPENF1_TOKEN = os.environ.get("OPENF1_API_KEY")  # only needed for realtime
HTTP_TIMEOUT = float(os.environ.get("OPENF1_TIMEOUT", "12"))


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

    def get_season(self) -> Season:
        if self._season is not None:
            return self._season
        try:
            from .normalize import normalize_season
            season = normalize_season(self.client, self.year)
            if season is None:
                raise RuntimeError("OpenF1 returned no usable data")
            self._season = season
        except Exception as exc:  # defensive: never crash the app on a data issue
            self.last_error = str(exc)
            self._season = build_season()  # seeded fallback keeps the app alive
        return self._season
