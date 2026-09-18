"""In-memory demo state layered on top of the seeded season.

Everything here is *deterministic demo data* — thousands of plausible managers,
public leagues, a live-race snapshot, and algorithmic insights — so the product
looks alive on first load with no auth and no external API. Real user teams
(persisted via SQLModel) are scored against the same season and ranked amongst
these demo managers.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from .provider import get_provider
from .scoring import DEFAULT_SCORING_RULES
from .season import Season

UTC = timezone.utc

CAPTAIN_MULTIPLIER = 1.5
BUDGET = 300.0
ROSTER = {"drivers": 10, "constructors": 2}
FREE_TRANSFERS = 1
MAX_STORED_TRANSFERS = 1
EXTRA_TRANSFER_COST = 5


# --------------------------------------------------------------------------- #
# Tactical boosts (config-driven; would live in a DB table in production).
# --------------------------------------------------------------------------- #

# One boost: back an underdog. Availability + usage are persisted per profile
# and activation is locked at the deadline. Config-driven so values can change.
BOOSTS = [
    {
        "id": "underdog", "name": "Underdog", "icon": "trending-up",
        "description": "Pick a driver you think will finish P6–P10. If they do, they score 2× for the round.",
        "usage_limit": 3, "scoring_modifier": {"type": "driver_range_multiplier", "value": 2.0, "range": [6, 10]},
        "activation_period": "round",
    },
]

# Original team-name suggestions for onboarding.
TEAM_NAME_SUGGESTIONS = [
    "Send It Racing", "Purple Sector", "Late Brakers", "DRS Merchants",
    "Box Box Box", "Apex Predators", "Full Send GP", "Undercut Kings",
    "Slipstream Squad", "Gravel Trap FC", "Tyre Whisperers", "Podium Bound",
]


def now() -> datetime:
    return datetime.now(UTC)


def rank_with_ties(rows: List[dict], key: str) -> None:
    """Assign competition ranking (1, 2, 2, 4, ...) in place — equal scores on
    ``key`` (already sorted desc) share the same rank, per the leaderboard
    tiebreaker rule "equal score => same rank"."""
    prev_value = None
    prev_rank = 0
    for i, row in enumerate(rows):
        value = row[key]
        if value != prev_value:
            prev_rank = i + 1
            prev_value = value
        row["rank"] = prev_rank


# --------------------------------------------------------------------------- #
# Season cache + derived state.
# --------------------------------------------------------------------------- #


class GameStore:
    @property
    def season(self) -> Season:
        # The provider owns caching/TTL/reconciliation — GameStore must not
        # add a second, permanent cache on top or a stale season would never
        # get the chance to refresh.
        return get_provider().get_season()

    def resync(self) -> Season:
        """Force a full, deterministic rebuild from the live feed right now."""
        return get_provider().get_season(force=True)

    # -- team scoring --------------------------------------------------------

    def score_team(
        self, driver_ids: List[int], constructor_ids: List[int], captain_id: Optional[int]
    ) -> dict:
        """Projected season points for a team held all season (demo model)."""
        s = self.season
        drivers_pts = sum(s.drivers[d].points for d in driver_ids if d in s.drivers)
        constr_pts = sum(s.constructors[c].points for c in constructor_ids if c in s.constructors)
        captain_bonus = 0
        if captain_id in s.drivers and captain_id in driver_ids:
            captain_bonus = s.drivers[captain_id].points * (CAPTAIN_MULTIPLIER - 1)
        total = drivers_pts + constr_pts + captain_bonus

        # Per-round series for charts.
        per_round: Dict[int, int] = {}
        for rnd in range(1, s.next_round):
            rp = sum(s.drivers[d].round_points.get(rnd, 0) for d in driver_ids if d in s.drivers)
            rp += sum(s.constructors[c].round_points.get(rnd, 0) for c in constructor_ids if c in s.constructors)
            if captain_id in s.drivers and captain_id in driver_ids:
                rp += s.drivers[captain_id].round_points.get(rnd, 0) * (CAPTAIN_MULTIPLIER - 1)
            per_round[rnd] = rp
        last_round = s.next_round - 1
        return {
            "total": total,
            "drivers_points": drivers_pts,
            "constructors_points": constr_pts,
            "captain_bonus": captain_bonus,
            "per_round": per_round,
            "last_race_points": per_round.get(last_round, 0),
        }

    def team_cost(self, driver_ids: List[int], constructor_ids: List[int]) -> float:
        """Squad value — informational only; there is no budget cap to spend against."""
        s = self.season
        cost = sum(s.drivers[d].price for d in driver_ids if d in s.drivers)
        cost += sum(s.constructors[c].price for c in constructor_ids if c in s.constructors)
        return round(cost, 1)

    def validate_team(
        self, driver_ids: List[int], constructor_ids: List[int], captain_id: Optional[int]
    ) -> Tuple[bool, List[str]]:
        """Authoritative, server-side team validation."""
        s = self.season
        errors: List[str] = []
        if len(driver_ids) != ROSTER["drivers"]:
            errors.append(f"Select exactly {ROSTER['drivers']} drivers.")
        if len(constructor_ids) != ROSTER["constructors"]:
            errors.append(f"Select exactly {ROSTER['constructors']} constructors.")
        if len(set(driver_ids)) != len(driver_ids):
            errors.append("Duplicate driver selected.")
        if len(set(constructor_ids)) != len(constructor_ids):
            errors.append("Duplicate constructor selected.")
        for d in driver_ids:
            if d not in s.drivers:
                errors.append(f"Unknown driver {d}.")
        for c in constructor_ids:
            if c not in s.constructors:
                errors.append(f"Unknown constructor {c}.")
        if captain_id is not None and captain_id not in driver_ids:
            errors.append("Captain must be one of your selected drivers.")
        cost = self.team_cost(driver_ids, constructor_ids)
        if cost > BUDGET + 1e-6:
            errors.append(f"Over budget: ${cost:.1f}M of ${BUDGET:.0f}M.")
        return (len(errors) == 0, errors)

    # -- insights engine (deterministic, no LLM) -----------------------------

    def insights(self) -> List[dict]:
        s = self.season
        out: List[dict] = []
        drivers = sorted(s.drivers.values(), key=lambda d: d.points, reverse=True)

        # 1. Consecutive point-scoring streak.
        def streak(d) -> int:
            n = 0
            for rnd in range(s.next_round - 1, 0, -1):
                if d.round_points.get(rnd, 0) >= 15:
                    n += 1
                else:
                    break
            return n
        streaks = sorted(((streak(d), d) for d in drivers), reverse=True, key=lambda t: t[0])
        if streaks and streaks[0][0] >= 3:
            n, d = streaks[0]
            out.append({"type": "form", "text": f"{d.name} has scored 15+ fantasy points in {n} consecutive rounds."})

        # 2. Ownership swing (form-driven, deterministic).
        risers = sorted(drivers, key=lambda d: d.form, reverse=True)[:1]
        if risers:
            d = risers[0]
            out.append({"type": "ownership", "text": f"{d.name} ownership is climbing — {d.ownership:.1f}% and rising on strong form."})

        # 3. Recent average.
        last3 = list(range(max(1, s.next_round - 3), s.next_round))
        best_avg = max(drivers, key=lambda d: sum(d.round_points.get(r, 0) for r in last3))
        avg = sum(best_avg.round_points.get(r, 0) for r in last3) / max(1, len(last3))
        out.append({"type": "form", "text": f"{best_avg.name} has averaged {avg:.0f} fantasy points across the last {len(last3)} rounds."})

        # 4. Best value driver.
        val = max(drivers, key=lambda d: d.points / d.price if d.price else 0)
        out.append({"type": "value", "text": f"{val.name} is the season's best value at {val.points / val.price:.1f} pts per $1M."})

        # 5. Constructor reliability.
        best_con = min(s.constructors.values(), key=lambda c: 1 - c.reliability)
        out.append({"type": "constructor", "text": f"{best_con.name} has the season's strongest reliability record."})

        return out

    # -- live race snapshot --------------------------------------------------

    def live_snapshot(self) -> dict:
        """The Live centre's state — real only. A Grand Prix runs for roughly
        2 hours; outside that window (true almost all the time for a hobby
        league) there is nothing to fabricate, so this reports "not live"
        with a real countdown instead of synthesizing a fake race.

        ponytail: no real live-timing poll (OpenF1 position/intervals) is
        wired up for the rare case a session genuinely is in progress —
        add it if someone's actually watching live and it matters.
        """
        s = self.season
        race = s.next_race
        now = datetime.now(timezone.utc)
        race_start = race.race_start if race else None
        if race_start and race_start.tzinfo is None:
            race_start = race_start.replace(tzinfo=timezone.utc)
        is_live = bool(race_start and race_start <= now <= race_start + timedelta(hours=2, minutes=30))

        race_brief = None
        if race:
            race_brief = {
                "name": race.name, "location": race.location, "country": race.country,
                "circuit": race.circuit, "weather": race.weather,
                "deadline": race.deadline.isoformat() if race.deadline else None,
                "race_start": race.race_start.isoformat() if race.race_start else None,
            }
        if not is_live:
            return {"live": False, "race": race_brief}

        # A session is genuinely in its live window, but there's no real-time
        # feed wired up yet — say so rather than fabricating a running order.
        return {"live": False, "race": race_brief, "reason": "Live timing isn't wired up yet — check back once it's finished."}


def _league_code(rng: random.Random) -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "GRID-" + "".join(rng.choice(chars) for _ in range(4))


def new_league_code() -> str:
    return _league_code(random.Random())


STORE = GameStore()


def scoring_config() -> dict:
    return {
        "budget": BUDGET,
        "roster": ROSTER,
        "captain_multiplier": CAPTAIN_MULTIPLIER,
        "free_transfers": FREE_TRANSFERS,
        "extra_transfer_cost": EXTRA_TRANSFER_COST,
        "rules": DEFAULT_SCORING_RULES,
        "boosts": BOOSTS,
    }
