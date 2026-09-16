"""Motorsport data provider adapter.

Application logic depends on the ``MotorsportDataProvider`` interface, never on
a concrete API. Today only ``MockMotorsportProvider`` (deterministic seeded
season) exists; a ``RealMotorsportProvider`` (OpenF1 / Ergast-compatible /
commercial feed) can be dropped in behind the same interface and selected with
the ``MOTORSPORT_DATA_PROVIDER`` environment variable — no call-site changes.
"""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import List, Optional

from .season import Season, build_season


class MotorsportDataProvider(ABC):
    """The contract every data source must satisfy."""

    name: str = "abstract"
    live: bool = False

    @abstractmethod
    def get_season(self) -> Season: ...


class MockMotorsportProvider(MotorsportDataProvider):
    """Deterministic seeded season. Works with zero credentials."""

    name = "mock"
    live = False

    def __init__(self) -> None:
        self._season: Optional[Season] = None

    def get_season(self) -> Season:
        # Built once per process; deterministic apart from the "now" anchor,
        # which we freeze at first build so countdowns are stable within a run.
        if self._season is None:
            self._season = build_season()
        return self._season


class RealMotorsportProvider(MotorsportDataProvider):
    """Placeholder for a real feed (OpenF1 / Ergast-compatible / commercial).

    Intentionally not implemented: it exists to prove the seam. If selected
    without an implementation we fail fast rather than silently degrade.
    """

    name = "real"
    live = True

    def get_season(self) -> Season:  # pragma: no cover - not wired yet
        raise NotImplementedError(
            "RealMotorsportProvider is not implemented. Set "
            "MOTORSPORT_DATA_PROVIDER=mock or supply a real feed adapter."
        )


_PROVIDERS = {
    "mock": MockMotorsportProvider,
    "real": RealMotorsportProvider,
}

_INSTANCE: Optional[MotorsportDataProvider] = None


def get_provider() -> MotorsportDataProvider:
    global _INSTANCE
    if _INSTANCE is None:
        key = os.environ.get("MOTORSPORT_DATA_PROVIDER", "mock").lower()
        cls = _PROVIDERS.get(key, MockMotorsportProvider)
        _INSTANCE = cls()
    return _INSTANCE


def available_providers() -> List[str]:
    return list(_PROVIDERS.keys())
