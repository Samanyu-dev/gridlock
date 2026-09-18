"""Optimal Team / Missed Points Analysis — only for FINAL rounds.

Finds the mathematically optimal legal $300M squad (10 drivers + 2
constructors) plus optimal captain and Underdog pick for a round, using that
round's real per-round prices and points. The captain/Underdog bonus each
depend on which single driver ends up in the squad, so those two choices are
enumerated exactly (every driver as a captain candidate, every actual P6-P10
finisher as an Underdog candidate, plus "no Underdog") — not a heuristic —
and the remaining squad slots are filled by an exact 0/1 knapsack under the
leftover budget. The final reported score is produced by handing the
reconstructed squad to the real scoring pipeline (snapshots.score_team_for_round),
never a hand-rolled point sum, so it can never disagree with what the ledger
would show for that same squad.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from . import deadlines
from .snapshots import resolve_team, score_team_for_round
from .store import BUDGET, CAPTAIN_MULTIPLIER, ROSTER, STORE

NEG = float("-inf")
UNDERDOG_MULT = 2.0
UNDERDOG_RANGE = (6, 10)


def _price_at(price_history: list, round_id: int) -> float:
    for h in price_history:
        if h["round"] == round_id:
            return h["price"]
    return price_history[-1]["price"] if price_history else 0.0


def _knapsack(items: List[Tuple[int, int, float]], k: int, cap: int):
    """items: [(id, cost_tenths, value)]. Returns a full item-layered table
    dp[i][c][b] = max value choosing exactly c distinct items from items[:i]
    with total cost at most b, for i in 0..n, c in 0..k, b in 0..cap.

    Deliberately NOT the usual in-place 1D/2D knapsack: that trick keeps
    values correct but corrupts backtracking, because a later item can
    overwrite dp[c-1][b] after an earlier dp[c][b] update already relied on
    its old value — the reconstructed path then silently reuses one item
    twice. Keeping every item layer costs more memory but makes
    backtracking exact."""
    n = len(items)
    dp = [[[NEG] * (cap + 1) for _ in range(k + 1)] for _ in range(n + 1)]
    for b in range(cap + 1):
        dp[0][0][b] = 0.0
    for i in range(1, n + 1):
        _id, cost, value = items[i - 1]
        prev_layer = dp[i - 1]
        layer = dp[i]
        for c in range(min(k, i) + 1):
            row = layer[c]
            skip_row = prev_layer[c]
            if c > 0 and cost <= cap:
                take_row = prev_layer[c - 1]
                for b in range(cap + 1):
                    best = skip_row[b]
                    if b >= cost:
                        prev = take_row[b - cost]
                        if prev != NEG and prev + value > best:
                            best = prev + value
                    row[b] = best
            else:
                for b in range(cap + 1):
                    row[b] = skip_row[b]
    return dp


def _reconstruct(items: List[Tuple[int, int, float]], dp, k: int, b: int) -> List[int]:
    picks = []
    i, c = len(items), k
    while i > 0 and c > 0:
        if dp[i][c][b] == dp[i - 1][c][b]:
            i -= 1
            continue
        _id, cost, _value = items[i - 1]
        picks.append(_id)
        c -= 1
        b -= cost
        i -= 1
    return picks


def compute_optimal(round_id: int) -> Optional[dict]:
    s = STORE.season
    race = next((r for r in s.races if r.round == round_id), None)
    if not race or deadlines.round_state(race) != "FINAL":
        return None

    cap = round(BUDGET * 10)

    driver_items = [
        (d.id, round(_price_at(d.price_history, round_id) * 10), float(d.round_points.get(round_id, 0)))
        for d in s.drivers.values()
    ]
    con_items = [
        (c.id, round(_price_at(c.price_history, round_id) * 10), float(c.round_points.get(round_id, 0)))
        for c in s.constructors.values()
    ]
    points_by_driver = {i[0]: i[2] for i in driver_items}
    cost_by_driver = {i[0]: i[1] for i in driver_items}

    finishes = {d.id: d.results.get(round_id, {}).get("finish") for d in s.drivers.values()}
    underdog_candidates = [
        did for did, f in finishes.items() if f is not None and UNDERDOG_RANGE[0] <= f <= UNDERDOG_RANGE[1]
    ]

    con_dp = _knapsack(con_items, ROSTER["constructors"], cap)

    best: Optional[dict] = None
    for captain_id in points_by_driver:
        for underdog_id in [None] + underdog_candidates:
            forced = {captain_id} | ({underdog_id} if underdog_id is not None else set())
            forced_cost = sum(cost_by_driver[i] for i in forced)
            forced_value = sum(points_by_driver[i] for i in forced)
            if forced_cost > cap:
                continue
            remaining_items = [it for it in driver_items if it[0] not in forced]
            remaining_k = ROSTER["drivers"] - len(forced)
            remaining_cap = cap - forced_cost
            d_dp = _knapsack(remaining_items, remaining_k, remaining_cap)
            d_top = d_dp[len(remaining_items)][remaining_k]
            con_top = con_dp[len(con_items)][ROSTER["constructors"]]
            captain_bonus = points_by_driver[captain_id] * (CAPTAIN_MULTIPLIER - 1)
            underdog_bonus = points_by_driver[underdog_id] * (UNDERDOG_MULT - 1) if underdog_id is not None else 0.0

            for con_budget in range(cap + 1):
                rest_budget = cap - con_budget - forced_cost
                if rest_budget < 0:
                    continue
                rest_budget = min(rest_budget, remaining_cap)
                rest_val = d_top[rest_budget]
                if rest_val == NEG:
                    continue
                con_val = con_top[con_budget]
                if con_val == NEG:
                    continue
                total = forced_value + rest_val + captain_bonus + underdog_bonus + con_val
                if best is None or total > best["total"]:
                    best = {
                        "total": total, "captain_id": captain_id, "underdog_id": underdog_id,
                        "forced": forced, "remaining_items": remaining_items, "d_dp": d_dp,
                        "remaining_k": remaining_k, "rest_budget": rest_budget, "con_budget": con_budget,
                    }

    if best is None:
        return None

    rest_picks = _reconstruct(best["remaining_items"], best["d_dp"], best["remaining_k"], best["rest_budget"])
    driver_ids = sorted(best["forced"]) + rest_picks
    con_ids = _reconstruct(con_items, con_dp, ROSTER["constructors"], best["con_budget"])

    optimal = score_team_for_round(
        driver_ids, con_ids, best["captain_id"],
        "underdog" if best["underdog_id"] is not None else None, best["underdog_id"], None, round_id,
    )
    return {"round": round_id, **optimal, "captain_id": best["captain_id"], "underdog_id": best["underdog_id"]}


def compare_to_actual(session, profile_id: int, round_id: int) -> Optional[dict]:
    """The user's actual round score vs the mathematically optimal one —
    efficiency % and a swing-style breakdown of where points were left on
    the table. Both sides come from the same score_team_for_round pipeline."""
    optimal = compute_optimal(round_id)
    if optimal is None:
        return None

    team = resolve_team(session, profile_id, round_id)
    if team is None:
        actual = {"total": 0.0, "assets": [], "state": optimal["state"]}
    else:
        actual = score_team_for_round(
            team["driver_ids"], team["constructor_ids"], team["captain_id"],
            team["active_boost"], team["boost_driver_id"], team["boost_constructor_id"], round_id,
        )

    by_ref_actual = {a["ref"]: a for a in actual["assets"]}
    missed = []
    for a in optimal["assets"]:
        mine = by_ref_actual.get(a["ref"])
        mine_sub = mine["subtotal"] if mine else 0.0
        delta = round(a["subtotal"] - mine_sub, 1)
        if delta > 0:
            missed.append({"ref": a["ref"], "name": a["name"], "short": a["short"], "color": a["color"],
                           "optimal": a["subtotal"], "mine": mine_sub, "missed": delta})
    missed.sort(key=lambda x: x["missed"], reverse=True)

    efficiency = round(actual["total"] / optimal["total"] * 100, 1) if optimal["total"] else 100.0
    return {
        "round": round_id, "actual_total": actual["total"], "optimal_total": optimal["total"],
        "efficiency": min(efficiency, 100.0), "missed_points": round(optimal["total"] - actual["total"], 1),
        "optimal_assets": optimal["assets"], "actual_assets": actual["assets"],
        "optimal_captain_id": optimal["captain_id"], "optimal_underdog_id": optimal["underdog_id"],
        "breakdown": missed,
    }
