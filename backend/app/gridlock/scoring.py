"""GRIDLOCK fantasy scoring engine — V3.

Single source of truth for how fantasy points are computed. Framework-free,
database-free, HTTP-free, so it can be unit-tested in isolation and reused by
live ingestion, historical recalculation, and preview tooling alike.

Guarantees:
  * **Deterministic** — the same normalized inputs always produce the same
    output, down to the ledger.
  * **Config-driven** — every value lives in ``ScoringRules``; no magic numbers
    are scattered through the branching logic, so an admin/DB layer can override
    any of them.
  * **Auditable** — scoring produces an itemized *ledger* (``LedgerEntry`` list)
    where every point is attributable to a ``rule_code`` with a base value and a
    multiplier. The UI renders explanations from this ledger, never from
    duplicated frontend logic.
  * **Pure** — no I/O, no globals, no randomness.

Scores are kept as floats (multiples of 0.5 once captain/boost/constructor
halving is applied). Intermediate components are never rounded; round only at a
documented display boundary via :func:`round_display`.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional


# --------------------------------------------------------------------------- #
# Classification + score states.
# --------------------------------------------------------------------------- #

FINISHED = "finished"     # took the flag, classified on the lead lap
CLASSIFIED = "classified"  # ran out of laps but classified (>= 90% distance)
DNF = "dnf"               # did not finish
DNS = "dns"               # did not start
DSQ = "dsq"               # disqualified

CLASSIFIED_STATES = (FINISHED, CLASSIFIED)


class ScoreState(str, Enum):
    """Lifecycle of a fantasy score for a session/weekend."""

    LIVE = "live"                # computed from current (in-progress) timing
    PROVISIONAL = "provisional"  # session done, official reconciliation pending
    FINAL = "final"              # official results processed, scoring locked


# --------------------------------------------------------------------------- #
# Normalized inputs (what the provider/normalizer feeds the engine).
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class DriverRaceResult:
    """Normalized outcome for one driver across a race weekend.

    Positions gained/lost are computed from the **official starting grid** →
    **final classification**, never from qualifying position. Retirements
    (DNF/DNS/DSQ) never contribute gained/lost points, to avoid double
    reward/punishment on top of the reliability penalty.
    """

    driver_id: int
    # Main qualifying classification (None if no dry/complete quali data).
    quali_position: Optional[int] = None
    # Race: official starting grid (penalty-adjusted) and final classification.
    grid: Optional[int] = None
    finish: Optional[int] = None
    status: str = FINISHED
    fastest_lap: bool = False
    is_sprint: bool = False


# Alias used by sprint-only inputs for readability at call sites.
DriverSprintResult = DriverRaceResult


@dataclass(frozen=True)
class ConstructorRaceResult:
    """Normalized constructor outcome for one race.

    ``pit_stop_rank`` (1 = fastest comparable stop of the event) is only set when
    reliable comparable stop-duration data exists; otherwise it stays ``None`` and
    no pit-stop fantasy points are awarded (we never invent pit times).
    """

    constructor_id: int
    driver_results: List[DriverRaceResult]
    pit_stop_rank: Optional[int] = None


# --------------------------------------------------------------------------- #
# Configuration.
# --------------------------------------------------------------------------- #


def _table(pairs: Dict[int, int]) -> Dict[int, int]:
    return dict(pairs)


DEFAULT_SCORING_RULES: Dict[str, object] = {
    # ---- Qualifying (main weekend) ----
    "quali_points": _table({1: 12, 2: 10, 3: 8, 4: 7, 5: 6, 6: 5, 7: 4, 8: 3, 9: 2, 10: 1}),
    "quali_beat_teammate": 3,
    # ---- Race finish ----
    "race_points": _table({
        1: 30, 2: 25, 3: 21, 4: 18, 5: 16, 6: 14, 7: 12, 8: 10, 9: 8, 10: 6,
        11: 5, 12: 4, 13: 3, 14: 2, 15: 1,  # P16-P20 => 0
    }),
    # ---- Positions gained / lost (grid -> classification) ----
    "position_gained": 2, "position_gained_max": 12,
    "position_lost": -1, "position_lost_max": -6,
    # ---- Race extras ----
    "race_beat_teammate": 3,
    "fastest_lap": 5,
    # ---- Reliability (mutually exclusive by status) ----
    "classified": 2, "dnf": -8, "dns": -5, "dsq": -15,
    # ---- Sprint ----
    "sprint_points": _table({1: 12, 2: 10, 3: 8, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2}),
    "sprint_position_gained": 1, "sprint_position_gained_max": 5,
    "sprint_position_lost": -1, "sprint_position_lost_max": -3,
    "sprint_beat_teammate": 2,
    "sprint_dnf": -4, "sprint_dns": -2, "sprint_dsq": -8,
    # ---- Constructor ----
    "constructor_race_fraction": 0.5,   # of both drivers' RACE FINISH points
    "constructor_both_q3": 4,
    "constructor_front_row_lockout": 5,
    # Race team result — HIGHEST APPLICABLE TIER ONLY (never stacks):
    "constructor_tier_1_2": 12,
    "constructor_tier_double_podium": 10,
    "constructor_tier_both_top5": 8,
    "constructor_tier_both_points": 6,
    "constructor_both_classified": 3,
    "constructor_pit_1": 5, "constructor_pit_2": 3, "constructor_pit_3": 1,
    # ---- Multipliers ----
    "captain_multiplier": 1.5,
    "turbo_multiplier": 2.0,      # non-captain driver
    "pit_wall_multiplier": 1.5,   # constructor
}


def merge_rules(overrides: Optional[Dict[str, object]]) -> Dict[str, object]:
    merged = dict(DEFAULT_SCORING_RULES)
    if overrides:
        merged.update(overrides)
    return merged


def round_display(x: float) -> float:
    """Documented display rounding: nearest 0.1, preserving legitimate .5 values."""
    return round(x + 1e-9, 1)


# --------------------------------------------------------------------------- #
# Ledger output.
# --------------------------------------------------------------------------- #


@dataclass
class LedgerEntry:
    rule_code: str
    phase: str            # quali / race / sprint / constructor / bonus
    label: str
    base_points: float
    multiplier: float
    points: float

    def as_dict(self) -> Dict[str, object]:
        return {
            "rule_code": self.rule_code,
            "phase": self.phase,
            "tag": self.phase,          # back-compat with existing serializers
            "label": self.label,
            "base_points": self.base_points,
            "multiplier": self.multiplier,
            "points": round_display(self.points),
        }


@dataclass
class ScoreResult:
    entries: List[LedgerEntry] = field(default_factory=list)

    @property
    def total(self) -> float:
        return round_display(sum(e.points for e in self.entries))

    @property
    def items(self) -> List[Dict[str, object]]:  # back-compat alias
        return [e.as_dict() for e in self.entries]

    def add(self, rule_code: str, phase: str, label: str, base: float, mult: float = 1.0) -> None:
        pts = base * mult
        if pts == 0 and base == 0:
            return
        self.entries.append(LedgerEntry(rule_code, phase, label, base, mult, pts))


# --------------------------------------------------------------------------- #
# The engine.
# --------------------------------------------------------------------------- #


class FantasyScoringEngine:
    def __init__(self, rules: Optional[Dict[str, object]] = None) -> None:
        self.rules = merge_rules(rules)

    # -- helpers -------------------------------------------------------------

    def _r(self, key: str) -> float:
        return float(self.rules[key])  # type: ignore[arg-type]

    def _race_finish_points(self, result: DriverRaceResult) -> int:
        if result.finish is None or result.status not in CLASSIFIED_STATES:
            return 0
        return int(self.rules["race_points"].get(result.finish, 0))  # type: ignore[union-attr]

    # -- driver --------------------------------------------------------------

    def score_driver(
        self, result: DriverRaceResult, *, teammate: Optional[DriverRaceResult] = None,
    ) -> ScoreResult:
        return self._score_sprint(result, teammate) if result.is_sprint else self._score_main(result, teammate)

    def _score_main(self, r: DriverRaceResult, teammate: Optional[DriverRaceResult]) -> ScoreResult:
        res = ScoreResult()
        rules = self.rules

        # --- Qualifying ---
        if r.quali_position is not None:
            qp = int(rules["quali_points"].get(r.quali_position, 0))  # type: ignore[union-attr]
            if qp:
                res.add("QUALI_POS", "quali", f"Qualifying P{r.quali_position}", qp)
            if (teammate and teammate.quali_position is not None
                    and r.quali_position < teammate.quali_position):
                res.add("QUALI_TEAMMATE", "quali", "Out-qualified teammate", self._r("quali_beat_teammate"))

        # --- Reliability (status is exclusive) ---
        if r.status == DNS:
            res.add("REL_DNS", "race", "Did not start", self._r("dns"))
            return res
        if r.status == DSQ:
            res.add("REL_DSQ", "race", "Disqualified", self._r("dsq"))
            return res
        if r.status == DNF:
            res.add("REL_DNF", "race", "Did not finish", self._r("dnf"))
            return res  # no finish/position/teammate/FL points on a retirement

        # Classified from here on.
        res.add("REL_CLASSIFIED", "race", "Classified", self._r("classified"))

        # --- Race finish points ---
        fp = self._race_finish_points(r)
        if fp:
            res.add("RACE_POS", "race", f"Race finish P{r.finish}", fp)

        # --- Positions gained / lost (grid -> classification; classified only) ---
        if r.grid is not None and r.finish is not None:
            delta = r.grid - r.finish
            if delta > 0:
                pts = min(delta * int(self._r("position_gained")), int(self._r("position_gained_max")))
                res.add("RACE_GAINED", "race", f"+{delta} positions", pts)
            elif delta < 0:
                pts = max(delta * abs(int(self._r("position_lost"))), int(self._r("position_lost_max")))
                res.add("RACE_LOST", "race", f"{delta} positions", pts)

        # --- Fastest lap ---
        if r.fastest_lap:
            res.add("FASTEST_LAP", "race", "Fastest lap", self._r("fastest_lap"))

        # --- Teammate battle (only meaningful when BOTH are classified) ---
        if (teammate and teammate.status in CLASSIFIED_STATES
                and r.finish is not None and teammate.finish is not None
                and r.finish < teammate.finish):
            res.add("RACE_TEAMMATE", "race", "Beat teammate", self._r("race_beat_teammate"))

        return res

    def _score_sprint(self, r: DriverRaceResult, teammate: Optional[DriverRaceResult]) -> ScoreResult:
        res = ScoreResult()

        if r.status == DNS:
            res.add("SPRINT_DNS", "sprint", "Sprint DNS", self._r("sprint_dns")); return res
        if r.status == DSQ:
            res.add("SPRINT_DSQ", "sprint", "Sprint DSQ", self._r("sprint_dsq")); return res
        if r.status == DNF:
            res.add("SPRINT_DNF", "sprint", "Sprint DNF", self._r("sprint_dnf")); return res

        sp = int(self.rules["sprint_points"].get(r.finish, 0)) if r.finish else 0  # type: ignore[union-attr]
        if sp:
            res.add("SPRINT_POS", "sprint", f"Sprint P{r.finish}", sp)

        if r.grid is not None and r.finish is not None:
            delta = r.grid - r.finish
            if delta > 0:
                pts = min(delta * int(self._r("sprint_position_gained")), int(self._r("sprint_position_gained_max")))
                res.add("SPRINT_GAINED", "sprint", f"Sprint +{delta} positions", pts)
            elif delta < 0:
                pts = max(delta * abs(int(self._r("sprint_position_lost"))), int(self._r("sprint_position_lost_max")))
                res.add("SPRINT_LOST", "sprint", f"Sprint {delta} positions", pts)

        if (teammate and teammate.status in CLASSIFIED_STATES
                and r.finish is not None and teammate.finish is not None
                and r.finish < teammate.finish):
            res.add("SPRINT_TEAMMATE", "sprint", "Beat teammate (sprint)", self._r("sprint_beat_teammate"))

        return res

    # -- constructor ---------------------------------------------------------

    def score_constructor(self, cr: ConstructorRaceResult) -> ScoreResult:
        res = ScoreResult()
        drs = cr.driver_results
        # Race component: fraction of both drivers' RACE FINISH points only.
        finish_sum = sum(self._race_finish_points(d) for d in drs)
        frac = self._r("constructor_race_fraction")
        if finish_sum:
            res.add("CON_RACE_BASE", "constructor", "Drivers' race points (50%)", finish_sum, frac)

        quali = [d.quali_position for d in drs if d.quali_position is not None]
        if len(quali) >= 2:
            if all(q <= 10 for q in quali):
                res.add("CON_BOTH_Q3", "constructor", "Both cars in Q3", self._r("constructor_both_q3"))
            if set(quali[:2]) == {1, 2} or (min(quali) == 1 and sorted(quali)[1] == 2):
                res.add("CON_FRONT_ROW", "constructor", "Front-row lockout", self._r("constructor_front_row_lockout"))

        # Race team tier — highest applicable only.
        classified = [d for d in drs if d.status in CLASSIFIED_STATES and d.finish is not None]
        if len(classified) >= 2:
            finishes = sorted(d.finish for d in classified)  # type: ignore[misc]
            a, b = finishes[0], finishes[1]
            if a == 1 and b == 2:
                res.add("CON_TIER_1_2", "constructor", "1-2 finish", self._r("constructor_tier_1_2"))
            elif b <= 3:
                res.add("CON_TIER_PODIUM", "constructor", "Double podium", self._r("constructor_tier_double_podium"))
            elif b <= 5:
                res.add("CON_TIER_TOP5", "constructor", "Both top 5", self._r("constructor_tier_both_top5"))
            elif b <= 10:
                res.add("CON_TIER_POINTS", "constructor", "Both in the points", self._r("constructor_tier_both_points"))

        if len(classified) == len(drs) and drs:
            res.add("CON_BOTH_CLASSIFIED", "constructor", "Both cars classified", self._r("constructor_both_classified"))

        # Pit stop — only when comparable data exists (rank set).
        if cr.pit_stop_rank == 1:
            res.add("CON_PIT_1", "constructor", "Fastest pit stop", self._r("constructor_pit_1"))
        elif cr.pit_stop_rank == 2:
            res.add("CON_PIT_2", "constructor", "2nd-fastest pit stop", self._r("constructor_pit_2"))
        elif cr.pit_stop_rank == 3:
            res.add("CON_PIT_3", "constructor", "3rd-fastest pit stop", self._r("constructor_pit_3"))

        return res

    # -- team-level multipliers (captain / boosts) ---------------------------

    def captain_bonus_entry(self, driver_total: float) -> LedgerEntry:
        mult = self._r("captain_multiplier")
        bonus = driver_total * (mult - 1.0)
        return LedgerEntry("CAPTAIN", "bonus", f"Captain {mult:g}×", driver_total, mult - 1.0, bonus)

    def turbo_bonus_entry(self, driver_total: float) -> LedgerEntry:
        mult = self._r("turbo_multiplier")
        bonus = driver_total * (mult - 1.0)
        return LedgerEntry("TURBO", "bonus", f"Turbo {mult:g}×", driver_total, mult - 1.0, bonus)

    def pit_wall_bonus_entry(self, constructor_total: float) -> LedgerEntry:
        mult = self._r("pit_wall_multiplier")
        bonus = constructor_total * (mult - 1.0)
        return LedgerEntry("PIT_WALL", "bonus", f"Pit Wall {mult:g}×", constructor_total, mult - 1.0, bonus)


def describe_rules(rules: Optional[Dict[str, object]] = None) -> Dict[str, object]:
    """Serialize the active ruleset for the public Rules page (kept in sync with
    the engine so the UI never drifts from real scoring)."""
    r = merge_rules(rules)
    return {
        "quali_points": r["quali_points"], "quali_beat_teammate": r["quali_beat_teammate"],
        "race_points": r["race_points"],
        "position_gained": r["position_gained"], "position_gained_max": r["position_gained_max"],
        "position_lost": r["position_lost"], "position_lost_max": r["position_lost_max"],
        "race_beat_teammate": r["race_beat_teammate"], "fastest_lap": r["fastest_lap"],
        "classified": r["classified"], "dnf": r["dnf"], "dns": r["dns"], "dsq": r["dsq"],
        "sprint_points": r["sprint_points"], "sprint_beat_teammate": r["sprint_beat_teammate"],
        "constructor_race_fraction": r["constructor_race_fraction"],
        "constructor_both_q3": r["constructor_both_q3"],
        "constructor_front_row_lockout": r["constructor_front_row_lockout"],
        "constructor_tier_1_2": r["constructor_tier_1_2"],
        "constructor_tier_double_podium": r["constructor_tier_double_podium"],
        "constructor_tier_both_top5": r["constructor_tier_both_top5"],
        "constructor_tier_both_points": r["constructor_tier_both_points"],
        "constructor_both_classified": r["constructor_both_classified"],
        "captain_multiplier": r["captain_multiplier"],
        "turbo_multiplier": r["turbo_multiplier"], "pit_wall_multiplier": r["pit_wall_multiplier"],
    }
