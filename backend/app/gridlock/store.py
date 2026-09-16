"""In-memory demo state layered on top of the seeded season.

Everything here is *deterministic demo data* — thousands of plausible managers,
public leagues, a live-race snapshot, and algorithmic insights — so the product
looks alive on first load with no auth and no external API. Real user teams
(persisted via SQLModel) are scored against the same season and ranked amongst
these demo managers.
"""
from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from .provider import get_provider
from .scoring import DEFAULT_SCORING_RULES
from .season import Season

UTC = timezone.utc

CAPTAIN_MULTIPLIER = 1.5
BUDGET = 100.0
ROSTER = {"drivers": 5, "constructors": 2}
FREE_TRANSFERS = 2
MAX_STORED_TRANSFERS = 4
EXTRA_TRANSFER_COST = 5


# --------------------------------------------------------------------------- #
# Tactical boosts (config-driven; would live in a DB table in production).
# --------------------------------------------------------------------------- #

# Tactical boosts (V3). Availability + usage are persisted per profile and
# activation is locked at the deadline. Config-driven so values can change.
BOOSTS = [
    {
        "id": "turbo", "name": "Turbo", "icon": "zap",
        "description": "A selected non-captain driver scores 2× for the weekend.",
        "usage_limit": 2, "scoring_modifier": {"type": "driver_multiplier", "value": 2.0},
        "activation_period": "weekend",
    },
    {
        "id": "pit-wall", "name": "Pit Wall", "icon": "layers",
        "description": "A selected constructor scores 1.5× for the weekend.",
        "usage_limit": 2, "scoring_modifier": {"type": "constructor_multiplier", "value": 1.5},
        "activation_period": "weekend",
    },
    {
        "id": "wildcard", "name": "Wildcard", "icon": "shuffle",
        "description": "Unlimited free permanent transfers for one round.",
        "usage_limit": 1, "scoring_modifier": {"type": "unlimited_permanent_transfers"},
        "activation_period": "round",
    },
    {
        "id": "free-hit", "name": "Free Hit", "icon": "infinity",
        "description": "Unlimited temporary transfers for one round; your team reverts after.",
        "usage_limit": 1, "scoring_modifier": {"type": "temporary_transfers"},
        "activation_period": "round",
    },
]

# Original team-name suggestions for onboarding.
TEAM_NAME_SUGGESTIONS = [
    "Send It Racing", "Purple Sector", "Late Brakers", "DRS Merchants",
    "Box Box Box", "Apex Predators", "Full Send GP", "Undercut Kings",
    "Slipstream Squad", "Gravel Trap FC", "Tyre Whisperers", "Podium Bound",
]

_MANAGER_FIRST = [
    "Apex", "Late", "Grid", "Box", "Turbo", "Purple", "Full", "Slick", "Delta",
    "Chicane", "Downforce", "Redline", "Overcut", "Undercut", "Paddock", "Vapor",
    "Podium", "Ghost", "Nitro", "Sector", "Halo", "Draft", "Kerb", "Monza",
]
_MANAGER_SECOND = [
    "Hunters", "Brakers", "Bandits", "Kings", "Merchants", "Predators", "Crew",
    "Union", "Republic", "Society", "Collective", "Dynasty", "Syndicate",
    "Legends", "Rebels", "Mavericks", "Outlaws", "Pioneers", "Titans", "Aces",
]


def now() -> datetime:
    return datetime.now(UTC)


# --------------------------------------------------------------------------- #
# Season cache + derived state.
# --------------------------------------------------------------------------- #


class GameStore:
    def __init__(self) -> None:
        self._season: Optional[Season] = None
        self._managers: Optional[List[dict]] = None
        self._leagues: Optional[Dict[str, dict]] = None
        self._theoretical_max: float = 0.0

    @property
    def season(self) -> Season:
        if self._season is None:
            self._season = get_provider().get_season()
            self._theoretical_max = self._compute_theoretical_max()
        return self._season

    # -- team scoring --------------------------------------------------------

    def _compute_theoretical_max(self) -> float:
        s = self._season
        assert s is not None
        top_d = sorted(s.drivers.values(), key=lambda d: d.points, reverse=True)[:5]
        top_c = sorted(s.constructors.values(), key=lambda c: c.points, reverse=True)[:2]
        cap = max(d.points for d in top_d) if top_d else 0
        return sum(d.points for d in top_d) + sum(c.points for c in top_c) + cap

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

    # -- demo managers + leaderboard ----------------------------------------

    def managers(self) -> List[dict]:
        if self._managers is None:
            self._managers = self._build_managers()
        return self._managers

    def _build_managers(self) -> List[dict]:
        _ = self.season  # ensure theoretical max computed
        rng = random.Random(90210)
        countries = ["GB", "IT", "ES", "NL", "FR", "DE", "BR", "US", "AU", "JP", "MX", "CA"]
        managers = []
        used = set()
        n = 240
        for i in range(n):
            while True:
                name = f"{rng.choice(_MANAGER_FIRST)} {rng.choice(_MANAGER_SECOND)}"
                if name not in used:
                    used.add(name)
                    break
            # Spread totals across a believable band of the theoretical max.
            frac = 0.96 - (i / n) * 0.42 + rng.uniform(-0.02, 0.02)
            total = int(self._theoretical_max * max(0.4, min(0.99, frac)))
            last = int(total / max(1, self.season.next_round - 1) * rng.uniform(0.7, 1.4))
            managers.append({
                "rank": 0,
                "team_name": name,
                "manager": f"@{name.split()[0].lower()}{rng.randint(10, 99)}",
                "country": rng.choice(countries),
                "total": total,
                "last_race": last,
                "movement": rng.randint(-8, 12),
            })
        managers.sort(key=lambda m: m["total"], reverse=True)
        for i, m in enumerate(managers):
            m["rank"] = i + 1
        return managers

    def rank_for_total(self, total: int) -> Tuple[int, int]:
        """Return (rank, field_size) for a given points total among managers."""
        managers = self.managers()
        rank = 1 + sum(1 for m in managers if m["total"] > total)
        return rank, len(managers) + 1

    # -- public leagues ------------------------------------------------------

    def public_leagues(self) -> Dict[str, dict]:
        if self._leagues is None:
            self._leagues = self._build_leagues()
        return self._leagues

    def _build_leagues(self) -> Dict[str, dict]:
        rng = random.Random(1337)
        managers = self.managers()
        names = [
            ("Overall Championship", "The global classic league — everyone's in."),
            ("Rookie Paddock", "New this season? Start here."),
            ("Purple Sector Club", "For the fastest-lap chasers."),
            ("Undercut Society", "Transfer strategists only."),
            ("Backmarker Heroes", "Budget-build believers."),
            ("Podium Hunters", "Top-3 or bust."),
        ]
        leagues: Dict[str, dict] = {}
        for i, (name, desc) in enumerate(names):
            code = _league_code(rng)
            members = rng.sample(managers, k=rng.randint(18, 60))
            members = sorted(members, key=lambda m: m["total"], reverse=True)
            leagues[code] = {
                "code": code,
                "name": name,
                "description": desc,
                "privacy": "public",
                "type": "classic",
                "creator": members[0]["team_name"] if members else "GRIDLOCK",
                "member_count": len(members),
                "members": [
                    {**m, "league_rank": j + 1} for j, m in enumerate(members)
                ],
            }
        return leagues

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

        for o in out:
            o["demo"] = True
        return out

    # -- live race snapshot --------------------------------------------------

    def live_snapshot(self) -> dict:
        """A deterministic 'race in progress' snapshot for the Live centre.

        In a real deployment this is fed by the provider's live-timing stream;
        here we synthesize a believable mid-race state so /live is compelling.
        """
        s = self.season
        race = s.next_race
        rng = random.Random(SEASON_LIVE_SEED)
        drivers = list(s.drivers.values())

        # Order by a strength proxy with noise → current running order.
        def strength(d):
            c = s.constructors[d.constructor_id]
            return d.skill * 0.6 + c.pace * 40 + rng.gauss(0, 5)
        order = sorted(drivers, key=strength, reverse=True)

        total_laps = race.laps if race else 57
        current_lap = int(total_laps * 0.68)
        compounds = ["S", "M", "H", "I"]
        gap = 0.0
        board = []
        for i, d in enumerate(order):
            c = s.constructors[d.constructor_id]
            if i > 0:
                gap += rng.uniform(0.6, 3.2)
            board.append({
                "position": i + 1,
                "driver_id": d.id,
                "short": d.short,
                "name": d.name,
                "number": d.number,
                "constructor": c.name,
                "color": c.color,
                "gap": "LEADER" if i == 0 else f"+{gap:.3f}",
                "tyre": rng.choice(compounds),
                "pits": rng.randint(1, 2),
                "delta": rng.randint(-4, 5),
            })

        # Live fantasy event feed.
        events = []
        for lap in range(current_lap, current_lap - 6, -1):
            d = rng.choice(order[:12])
            kind = rng.choice(["overtake", "fastest_lap", "pit", "gain"])
            if kind == "overtake":
                events.append({"lap": lap, "short": d.short, "color": s.constructors[d.constructor_id].color, "points": 2, "label": "Position gained"})
            elif kind == "fastest_lap":
                events.append({"lap": lap, "short": d.short, "color": s.constructors[d.constructor_id].color, "points": 5, "label": "Fastest lap"})
            elif kind == "pit":
                events.append({"lap": lap, "short": d.short, "color": s.constructors[d.constructor_id].color, "points": 0, "label": "Pit stop"})
            else:
                events.append({"lap": lap, "short": d.short, "color": s.constructors[d.constructor_id].color, "points": 3, "label": "Overtake"})

        return {
            "demo": True,
            "race": {
                "name": race.name if race else "Grand Prix",
                "location": race.location if race else "",
                "country": race.country if race else "",
                "circuit": race.circuit if race else "",
                "weather": race.weather if race else "Dry · Warm",
            },
            "status": "LIVE",
            "lap": current_lap,
            "total_laps": total_laps,
            "track_status": "GREEN",
            "board": board,
            "events": events,
        }


SEASON_LIVE_SEED = 555


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
