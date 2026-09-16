"""GRIDLOCK fantasy scoring engine.

This module is the single source of truth for how fantasy points are computed.
It is deliberately free of any framework, database, or HTTP concern so it can
be unit-tested in isolation and reused by live ingestion, historical
recalculation, and preview tooling alike.

Design rules:
  * **Deterministic** — same input events always produce the same output.
  * **Config-driven** — every point value lives in a ``ScoringRules`` dict, never
    hard-coded in branching logic, so an admin/DB can override it later.
  * **Pure** — functions take normalized data in and return numbers/breakdowns
    out. No I/O, no globals, no randomness.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, TypedDict


# --------------------------------------------------------------------------- #
# Normalized result shapes (what the data provider feeds the engine).
# --------------------------------------------------------------------------- #

# Classification of a driver in a session.
FINISHED = "finished"     # took the flag on the lead lap classification
CLASSIFIED = "classified"  # ran out of laps but classified (>=90% distance)
DNF = "dnf"               # did not finish (mechanical / crash)
DNS = "dns"               # did not start
DSQ = "dsq"               # disqualified


@dataclass(frozen=True)
class DriverRaceResult:
    """Normalized outcome for one driver in one race (or sprint) session."""

    driver_id: int
    grid: int                 # starting position AFTER any grid penalties
    finish: Optional[int]     # classified finishing position, or None if DNF/DNS
    status: str = FINISHED    # one of FINISHED / CLASSIFIED / DNF / DNS / DSQ
    fastest_lap: bool = False
    driver_of_the_day: bool = False
    reached_q3: bool = False
    reached_q2: bool = False
    quali_position: Optional[int] = None  # grid before penalties (pure pace)
    is_sprint: bool = False


@dataclass(frozen=True)
class ConstructorRaceResult:
    """Normalized outcome for a constructor in one race."""

    constructor_id: int
    driver_results: List[DriverRaceResult]
    fastest_pit_stop: bool = False
    both_finished: bool = False
    pit_stop_rank: Optional[int] = None  # 1 = fastest stop of the weekend


# --------------------------------------------------------------------------- #
# Scoring configuration.
# --------------------------------------------------------------------------- #


class ScoringRules(TypedDict, total=False):
    finish_points: Dict[int, int]      # position -> points (P1..P10)
    sprint_finish_points: Dict[int, int]
    position_gained: int               # per place gained vs grid
    position_lost: int                 # per place lost vs grid (negative)
    fastest_lap: int
    driver_of_the_day: int
    pole: int
    reached_q3: int
    reached_q2: int
    classified_finish: int             # bonus for being classified at all
    dnf: int
    dns: int
    dsq: int
    beat_teammate_race: int
    beat_teammate_quali: int
    constructor_both_finished: int
    constructor_fastest_pit: int
    constructor_pit_top3: int


# The canonical default ruleset. An admin/DB layer can override any key; the
# engine never assumes a value is present beyond these defaults.
DEFAULT_SCORING_RULES: ScoringRules = {
    "finish_points": {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4, 9: 2, 10: 1},
    "sprint_finish_points": {1: 8, 2: 7, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1},
    "position_gained": 2,
    "position_lost": -1,
    "fastest_lap": 5,
    "driver_of_the_day": 5,
    "pole": 5,
    "reached_q3": 3,
    "reached_q2": 2,
    "classified_finish": 1,
    "dnf": -10,
    "dns": -5,
    "dsq": -15,
    "beat_teammate_race": 3,
    "beat_teammate_quali": 2,
    "constructor_both_finished": 5,
    "constructor_fastest_pit": 5,
    "constructor_pit_top3": 2,
}


def merge_rules(overrides: Optional[ScoringRules]) -> ScoringRules:
    """Return DEFAULT_SCORING_RULES shallow-merged with ``overrides``."""
    merged: ScoringRules = {**DEFAULT_SCORING_RULES}  # type: ignore[assignment]
    if overrides:
        merged.update(overrides)  # type: ignore[typeddict-item]
    return merged


# --------------------------------------------------------------------------- #
# Breakdown output.
# --------------------------------------------------------------------------- #


@dataclass
class ScoreBreakdown:
    """Itemized fantasy points so the UI can show *why* a score is what it is."""

    total: int = 0
    items: List[Dict[str, object]] = field(default_factory=list)

    def add(self, label: str, points: int, tag: str = "") -> None:
        if points == 0:
            return
        self.total += points
        self.items.append({"label": label, "points": points, "tag": tag})


# --------------------------------------------------------------------------- #
# The engine.
# --------------------------------------------------------------------------- #


class FantasyScoringEngine:
    """Deterministic fantasy scoring. Given the same results and rules, output
    is always identical."""

    def __init__(self, rules: Optional[ScoringRules] = None) -> None:
        self.rules = merge_rules(rules)

    # -- drivers -------------------------------------------------------------

    def score_driver(
        self,
        result: DriverRaceResult,
        *,
        teammate: Optional[DriverRaceResult] = None,
    ) -> ScoreBreakdown:
        r = self.rules
        b = ScoreBreakdown()
        is_sprint = result.is_sprint

        # Qualifying progression (main weekend only; sprint quali is separate).
        if not is_sprint:
            if result.reached_q3:
                b.add("Reached Q3", r["reached_q3"], "quali")
            elif result.reached_q2:
                b.add("Reached Q2", r["reached_q2"], "quali")
            if result.quali_position == 1:
                b.add("Pole position", r["pole"], "quali")

        # Non-finishes short-circuit most race scoring.
        if result.status == DNS:
            b.add("Did not start", r["dns"], "status")
            return b
        if result.status == DSQ:
            b.add("Disqualified", r["dsq"], "status")
            return b
        if result.status == DNF:
            b.add("Did not finish", r["dnf"], "status")
            # A driver who retires can still have banked quali points above.
            return b

        # Finishing-position points.
        table = r["sprint_finish_points"] if is_sprint else r["finish_points"]
        if result.finish is not None and result.finish in table:
            label = "Sprint finish" if is_sprint else "Race finish"
            b.add(f"{label} P{result.finish}", table[result.finish], "finish")

        if result.status in (FINISHED, CLASSIFIED) and not is_sprint:
            b.add("Classified", r["classified_finish"], "finish")

        # Positions gained / lost vs the *grid* (penalty-adjusted start).
        if result.finish is not None:
            delta = result.grid - result.finish  # positive = gained places
            if delta > 0:
                b.add(f"+{delta} positions", delta * r["position_gained"], "gain")
            elif delta < 0:
                b.add(f"{delta} positions", abs(delta) * r["position_lost"], "loss")

        # Bonuses.
        if result.fastest_lap:
            b.add("Fastest lap", r["fastest_lap"], "fastest_lap")
        if result.driver_of_the_day:
            b.add("Driver of the Day", r["driver_of_the_day"], "dotd")

        # Teammate battles.
        if teammate is not None:
            if (
                not is_sprint
                and result.quali_position is not None
                and teammate.quali_position is not None
                and result.quali_position < teammate.quali_position
            ):
                b.add("Beat teammate (quali)", r["beat_teammate_quali"], "teammate")
            if (
                result.finish is not None
                and teammate.finish is not None
                and result.finish < teammate.finish
            ):
                b.add("Beat teammate (race)", r["beat_teammate_race"], "teammate")

        return b

    # -- constructors --------------------------------------------------------

    def score_constructor(self, result: ConstructorRaceResult) -> ScoreBreakdown:
        r = self.rules
        b = ScoreBreakdown()

        # A constructor scores the sum of its drivers' finishing-position and
        # bonus points (but NOT the individual quali-progression points, which
        # belong to the driver asset only).
        drivers_total = 0
        for dr in result.driver_results:
            db = self.score_driver(dr)
            drivers_total += sum(
                int(item["points"])  # type: ignore[arg-type]
                for item in db.items
                if item["tag"] in ("finish", "gain", "loss", "fastest_lap", "dotd", "status")
            )
        if drivers_total:
            b.add("Drivers combined", drivers_total, "drivers")

        if result.both_finished:
            b.add("Both cars finished", r["constructor_both_finished"], "reliability")
        if result.fastest_pit_stop:
            b.add("Fastest pit stop", r["constructor_fastest_pit"], "pit")
        elif result.pit_stop_rank is not None and result.pit_stop_rank <= 3:
            b.add("Top-3 pit stop", r["constructor_pit_top3"], "pit")

        return b

    # -- team-level helpers --------------------------------------------------

    def apply_captain(self, base_points: int, multiplier: int = 2) -> int:
        """Captain earns ``multiplier``x. Returns the *bonus* only (so callers
        can show base + bonus separately)."""
        return base_points * (multiplier - 1)


def describe_rules(rules: Optional[ScoringRules] = None) -> Dict[str, object]:
    """Serialize the active ruleset for the public Rules page (kept in sync
    with the engine so the UI never drifts from real scoring)."""
    r = merge_rules(rules)
    return {
        "finish_points": r["finish_points"],
        "sprint_finish_points": r["sprint_finish_points"],
        "position_gained": r["position_gained"],
        "position_lost": r["position_lost"],
        "fastest_lap": r["fastest_lap"],
        "driver_of_the_day": r["driver_of_the_day"],
        "pole": r["pole"],
        "reached_q3": r["reached_q3"],
        "reached_q2": r["reached_q2"],
        "classified_finish": r["classified_finish"],
        "dnf": r["dnf"],
        "dns": r["dns"],
        "dsq": r["dsq"],
        "beat_teammate_race": r["beat_teammate_race"],
        "beat_teammate_quali": r["beat_teammate_quali"],
        "constructor_both_finished": r["constructor_both_finished"],
        "constructor_fastest_pit": r["constructor_fastest_pit"],
    }
