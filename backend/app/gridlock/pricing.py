"""Dynamic pricing engine.

Driver/constructor prices evolve across the season from **performance, form and
ownership** — the FPL-style market. Deterministic and config-driven: the same
season always yields the same price path, and every value lives in ``PRICING``.

Model (per completed round, per asset):
  * expectation = price × ``value_factor`` (what a driver at this price "should" score)
  * surprise    = round_points − expectation
  * Δ = clamp( surprise/``perf_scale`` + form_weight·(form−5) + own_weight·(own−mid),
               −max_fall, +max_rise ), rounded to $0.1
  * price = clamp(price + Δ, min, max)

Opening price is anchored to skill + constructor pace so day-one prices are
sensible; the walk then moves them. Exposes a per-round ``price_history`` used by
the UI (trend sparkline) and a market movers query (risers / fallers).
"""
from __future__ import annotations

from typing import Dict, List

PRICING: Dict[str, float] = {
    "min": 4.0, "max": 30.0,
    "open_min": 5.0, "open_max": 28.0,
    "max_rise": 0.3, "max_fall": 0.3,
    "value_factor": 1.15,     # expected pts per $1M of price
    "perf_scale": 55.0,       # higher = less sensitive to a single result
    "form_weight": 0.03,
    "own_weight": 0.004, "own_mid": 30.0,
    "con_value_factor": 2.4,  # constructors score more in absolute terms
    "con_perf_scale": 90.0,
}


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _round1(x: float) -> float:
    return round(x * 10) / 10


def _open_price(raw: float, lo_raw: float, hi_raw: float) -> float:
    frac = (raw - lo_raw) / (hi_raw - lo_raw) if hi_raw > lo_raw else 0.5
    p = PRICING["open_min"] + (frac ** 0.85) * (PRICING["open_max"] - PRICING["open_min"])
    return _round1(p)


def price_driver_path(
    open_raw: float, open_lo: float, open_hi: float,
    round_points: Dict[int, int], form: float, ownership: float, rounds: List[int],
) -> List[dict]:
    """Return [{round, price, change}] including an opening entry at round 0."""
    p = _open_price(open_raw, open_lo, open_hi)
    history = [{"round": 0, "price": p, "change": 0.0}]
    for r in rounds:
        pts = round_points.get(r, 0)
        expectation = p * PRICING["value_factor"]
        surprise = pts - expectation
        delta = (surprise / PRICING["perf_scale"]
                 + PRICING["form_weight"] * (form - 5.0)
                 + PRICING["own_weight"] * (ownership - PRICING["own_mid"]))
        delta = _clamp(delta, -PRICING["max_fall"], PRICING["max_rise"])
        delta = _round1(delta)
        p = _round1(_clamp(p + delta, PRICING["min"], PRICING["max"]))
        history.append({"round": r, "price": p, "change": delta})
    return history


def price_constructor_path(
    open_raw: float, open_lo: float, open_hi: float,
    round_points: Dict[int, int], form: float, ownership: float, rounds: List[int],
) -> List[dict]:
    p = _open_price(open_raw, open_lo, open_hi)
    history = [{"round": 0, "price": p, "change": 0.0}]
    for r in rounds:
        pts = round_points.get(r, 0)
        expectation = p * PRICING["con_value_factor"]
        surprise = pts - expectation
        delta = (surprise / PRICING["con_perf_scale"]
                 + PRICING["form_weight"] * (form - 5.0)
                 + PRICING["own_weight"] * (ownership - PRICING["own_mid"]))
        delta = _clamp(delta, -PRICING["max_fall"], PRICING["max_rise"])
        p = _round1(_clamp(p + _round1(delta), PRICING["min"], PRICING["max"]))
        history.append({"round": r, "price": p, "change": _round1(delta)})
    return history
