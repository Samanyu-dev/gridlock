"""Head-to-head comparison — season-long and live-round — built entirely on
the existing scoring pipeline. Season totals reuse STORE.score_team (the
same function the leaderboard uses); round breakdowns reuse
snapshots.score_team_for_round (the same function /team/score uses). No
parallel scoring logic lives here, only comparison and diffing.
"""
from __future__ import annotations

from typing import List, Optional

from sqlmodel import Session, select

from . import deadlines
from .models import GLTeam
from .ownership import ownership_round
from .snapshots import resolve_team, score_team_for_round
from .store import STORE


def _team_row(session: Session, profile_id: int) -> Optional[GLTeam]:
    return session.exec(select(GLTeam).where(GLTeam.profile_id == profile_id)).first()


def compare_season(session: Session, profile_a_id: int, profile_b_id: int) -> Optional[dict]:
    """Shared/differential picks, captains, season gap, and a round-by-round
    historical H2H record (assuming each side's current squad held all
    season — the same assumption the real leaderboard already makes).

    Both sides are resolved to the latest *locked* round's picks, never the
    live/still-changeable team — the same rule ownership() and live_battle()
    already enforce, so a rival's unlocked future picks can never leak here
    either. Bug fix: this previously read GLTeam directly, unconditionally
    exposing a rival's current picks regardless of lock state."""
    locked_round = ownership_round()
    if locked_round is None:
        return None
    team_a = resolve_team(session, profile_a_id, locked_round)
    team_b = resolve_team(session, profile_b_id, locked_round)
    if not team_a or not team_b:
        return None

    score_a = STORE.score_team(team_a["driver_ids"], team_a["constructor_ids"], team_a["captain_id"])
    score_b = STORE.score_team(team_b["driver_ids"], team_b["constructor_ids"], team_b["captain_id"])

    rounds_a = rounds_b = ties = 0
    for rnd, pts_a in score_a["per_round"].items():
        pts_b = score_b["per_round"].get(rnd, 0)
        if pts_a > pts_b:
            rounds_a += 1
        elif pts_b > pts_a:
            rounds_b += 1
        else:
            ties += 1

    return {
        "a": {
            "profile_id": profile_a_id, "total": score_a["total"], "last_race_points": score_a["last_race_points"],
            "captain_id": team_a["captain_id"], "driver_ids": team_a["driver_ids"], "constructor_ids": team_a["constructor_ids"],
            "differentials": sorted(set(team_a["driver_ids"]) - set(team_b["driver_ids"])),
        },
        "b": {
            "profile_id": profile_b_id, "total": score_b["total"], "last_race_points": score_b["last_race_points"],
            "captain_id": team_b["captain_id"], "driver_ids": team_b["driver_ids"], "constructor_ids": team_b["constructor_ids"],
            "differentials": sorted(set(team_b["driver_ids"]) - set(team_a["driver_ids"])),
        },
        "shared_drivers": sorted(set(team_a["driver_ids"]) & set(team_b["driver_ids"])),
        "shared_constructors": sorted(set(team_a["constructor_ids"]) & set(team_b["constructor_ids"])),
        "gap": round(score_a["total"] - score_b["total"], 1),
        "rounds_record": {"a": rounds_a, "b": rounds_b, "ties": ties},
    }


def live_battle(session: Session, profile_a_id: int, profile_b_id: int, round_id: int) -> Optional[dict]:
    """Round-level swing comparison — only ever computed once the round is
    locked, so a rival's still-changeable picks never leak before deadline."""
    if not deadlines.is_locked(round_id):
        return None

    team_a = _team_row(session, profile_a_id)
    team_b = _team_row(session, profile_b_id)
    if not team_a or not team_a.driver_ids or not team_b or not team_b.driver_ids:
        return None

    live_a = score_team_for_round(
        team_a.driver_ids, team_a.constructor_ids, team_a.captain_id,
        team_a.active_boost, team_a.boost_driver_id, team_a.boost_constructor_id, round_id,
    )
    live_b = score_team_for_round(
        team_b.driver_ids, team_b.constructor_ids, team_b.captain_id,
        team_b.active_boost, team_b.boost_driver_id, team_b.boost_constructor_id, round_id,
    )

    by_ref_b = {a["ref"]: a for a in live_b["assets"]}
    swings: List[dict] = []
    for a in live_a["assets"]:
        b = by_ref_b.pop(a["ref"], None)
        b_sub = b["subtotal"] if b else 0.0
        delta = round(a["subtotal"] - b_sub, 1)
        if delta != 0:
            swings.append({
                "ref": a["ref"], "name": a["name"], "short": a["short"], "color": a["color"],
                "mine": a["subtotal"], "rival": b_sub, "delta": delta,
            })
    for b in by_ref_b.values():
        swings.append({
            "ref": b["ref"], "name": b["name"], "short": b["short"], "color": b["color"],
            "mine": 0.0, "rival": b["subtotal"], "delta": round(-b["subtotal"], 1),
        })
    swings.sort(key=lambda x: abs(x["delta"]), reverse=True)

    season_a = STORE.score_team(team_a.driver_ids, team_a.constructor_ids, team_a.captain_id)["total"]
    season_b = STORE.score_team(team_b.driver_ids, team_b.constructor_ids, team_b.captain_id)["total"]

    captain_a = next((a for a in live_a["assets"] if a["ref"] == f"driver:{team_a.captain_id}"), None)
    captain_b = next((a for a in live_b["assets"] if a["ref"] == f"driver:{team_b.captain_id}"), None)

    return {
        "round": round_id, "state": live_a["state"],
        "mine": {"total": live_a["total"], "season_before": season_a},
        "rival": {"total": live_b["total"], "season_before": season_b},
        "swing": round(live_a["total"] - live_b["total"], 1),
        "gap_before": round(season_a - season_b, 1),
        "gap_projected": round((season_a + live_a["total"]) - (season_b + live_b["total"]), 1),
        "swings": swings,
        "captain_battle": {"mine": captain_a, "rival": captain_b},
    }
