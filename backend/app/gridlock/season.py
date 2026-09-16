"""Seeded GRIDLOCK demo season.

All driver / constructor identities are **original** and not affiliated with,
or endorsed by, any real driver, team, or series. Race results are generated
*deterministically* (fixed seeds) so the whole product — points, form, prices,
ownership, standings, leaderboards — is populated and stable without any
external API or credentials.

The calendar is anchored to "now" at build time so countdowns to the next race
always look live in a demo, while past rounds carry realistic dates.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from .scoring import (
    CLASSIFIED,
    DNF,
    FINISHED,
    ConstructorRaceResult,
    DriverRaceResult,
    FantasyScoringEngine,
)

UTC = timezone.utc
SEASON_YEAR = 2026
TOTAL_ROUNDS = 24
COMPLETED_ROUNDS = 14  # rounds 1..14 finished; round 15 is the next race.


# --------------------------------------------------------------------------- #
# Static identities (hand-authored for quality; all original).
# --------------------------------------------------------------------------- #

# (name, base_pace 0-1, reliability 0-1, hex color, short code)
CONSTRUCTOR_DEFS = [
    ("Vermillion Racing", 0.95, 0.93, "#E10600", "VMR"),
    ("Meridian GP", 0.93, 0.95, "#2D6CDF", "MER"),
    ("Apex Dynamics", 0.88, 0.90, "#FF7A00", "APX"),
    ("Nova Motorsport", 0.82, 0.88, "#17C3B2", "NOV"),
    ("Velocity Works", 0.78, 0.85, "#46D160", "VEL"),
    ("Phantom GP", 0.72, 0.82, "#8B5CF6", "PHM"),
    ("Solaris Racing", 0.66, 0.80, "#F4C20D", "SOL"),
    ("Ironclad Racing", 0.60, 0.86, "#B7BFC6", "IRN"),
    ("Titan Autosport", 0.54, 0.78, "#3E5C86", "TTN"),
    ("Eclipse Racing", 0.48, 0.74, "#D6409F", "ECL"),
]

# (name, short, number, country ISO2, skill 0-100, constructor index)
DRIVER_DEFS = [
    ("Marco Vitale", "VIT", 1, "IT", 94, 0),
    ("Théo Rémy", "REM", 27, "FR", 88, 0),
    ("Lars Novak", "NOV", 4, "NL", 95, 1),
    ("Diego Herrera", "HER", 11, "ES", 86, 1),
    ("Callum Reid", "REI", 3, "GB", 90, 2),
    ("Kenji Sato", "SAT", 22, "JP", 84, 2),
    ("Oskar Lind", "LIN", 10, "SE", 85, 3),
    ("Mateo Rossi", "ROS", 31, "BR", 80, 3),
    ("Aiden Cross", "CRO", 14, "AU", 83, 4),
    ("Noah Berg", "BRG", 7, "DE", 79, 4),
    ("Luca Moretti", "MOR", 23, "IT", 80, 5),
    ("Finn Walsh", "WAL", 44, "IE", 77, 5),
    ("Rafael Costa", "COS", 9, "PT", 78, 6),
    ("Yuki Tanaka", "TAN", 18, "JP", 75, 6),
    ("Sam Hollis", "HOL", 6, "GB", 74, 7),
    ("Emil Sørensen", "SOR", 21, "DK", 72, 7),
    ("Owen Blake", "BLK", 77, "CA", 70, 8),
    ("André Dumont", "DUM", 5, "FR", 68, 8),
    ("Hugo Méndez", "MEN", 29, "MX", 66, 9),
    ("Jack Turner", "TUR", 33, "US", 63, 9),
]

# (round, name, location, country ISO2, circuit, laps, length_km, sprint?)
CIRCUIT_DEFS = [
    ("Sunrise Grand Prix", "Melbourne", "AU", "Albert Cove Circuit", 58, 5.28, False),
    ("Desert Grand Prix", "Jeddah", "SA", "Coastline Speedway", 50, 6.17, True),
    ("Twilight Grand Prix", "Bahrain", "BH", "Dunes International", 57, 5.41, False),
    ("Cherry Grand Prix", "Suzuka", "JP", "Figure-Eight Raceway", 53, 5.81, False),
    ("Monsoon Grand Prix", "Shanghai", "CN", "Golden Dragon Circuit", 56, 5.45, True),
    ("Skyline Grand Prix", "Miami", "US", "Harbor Loop", 57, 5.41, False),
    ("Riviera Grand Prix", "Imola", "IT", "Sabbia Autodrome", 63, 4.91, False),
    ("Harbour Grand Prix", "Monaco", "MC", "Rue Serpentine", 78, 3.34, False),
    ("Iberia Grand Prix", "Barcelona", "ES", "Catalonia Ring", 66, 4.66, False),
    ("Maple Grand Prix", "Montréal", "CA", "Île Vitesse", 70, 4.36, True),
    ("Alpine Grand Prix", "Spielberg", "AT", "Grünberg Ring", 71, 4.32, False),
    ("Legends Grand Prix", "Silverstone", "GB", "Northgate Circuit", 52, 5.89, False),
    ("Meadow Grand Prix", "Budapest", "HU", "Hungaro Basin", 70, 4.38, False),
    ("Forest Grand Prix", "Spa", "BE", "Ardenne Heights", 44, 7.00, True),
    ("Lowland Grand Prix", "Zandvoort", "NL", "Dune Bowl", 72, 4.26, False),
    ("Cathedral Grand Prix", "Monza", "IT", "Velocità Park", 53, 5.79, False),
    ("Lantern Grand Prix", "Singapore", "SG", "Marina Nightway", 62, 4.94, False),
    ("Frontier Grand Prix", "Austin", "US", "Lone Star Circuit", 56, 5.51, True),
    ("Sierra Grand Prix", "Mexico City", "MX", "Altitude Autodromo", 71, 4.30, False),
    ("Carnival Grand Prix", "São Paulo", "BR", "Interlagos Heights", 71, 4.31, True),
    ("Neon Grand Prix", "Las Vegas", "US", "Boulevard Circuit", 50, 6.20, False),
    ("Falcon Grand Prix", "Lusail", "QA", "Desert Crown", 57, 5.42, False),
    ("Marina Grand Prix", "Yas", "AE", "Harbor Island", 58, 5.28, False),
    ("Finale Grand Prix", "Portimão", "PT", "Algarve Waves", 66, 4.65, False),
]

COUNTRY_NAMES = {
    "AU": "Australia", "SA": "Saudi Arabia", "BH": "Bahrain", "JP": "Japan",
    "CN": "China", "US": "United States", "IT": "Italy", "MC": "Monaco",
    "ES": "Spain", "CA": "Canada", "AT": "Austria", "GB": "United Kingdom",
    "HU": "Hungary", "BE": "Belgium", "NL": "Netherlands", "SG": "Singapore",
    "MX": "Mexico", "BR": "Brazil", "QA": "Qatar", "AE": "United Arab Emirates",
    "PT": "Portugal", "FR": "France", "SE": "Sweden", "DE": "Germany",
    "IE": "Ireland", "DK": "Denmark",
}

WEATHER = ["Dry · Warm", "Dry · Hot", "Overcast", "Light Rain", "Wet"]


# --------------------------------------------------------------------------- #
# Domain objects.
# --------------------------------------------------------------------------- #


@dataclass
class Constructor:
    id: int
    name: str
    slug: str
    short: str
    color: str
    pace: float
    reliability: float
    driver_ids: List[int] = field(default_factory=list)
    price: float = 0.0
    price_prev: float = 0.0
    points: int = 0
    form: float = 0.0
    round_points: Dict[int, int] = field(default_factory=dict)
    ownership: float = 0.0


@dataclass
class Driver:
    id: int
    name: str
    short: str
    number: int
    country: str
    skill: int
    constructor_id: int
    slug: str = ""
    price: float = 0.0
    price_prev: float = 0.0
    points: int = 0
    form: float = 0.0
    status: str = "active"  # active / reserve / withdrawn / suspended
    round_points: Dict[int, int] = field(default_factory=dict)
    round_breakdown: Dict[int, list] = field(default_factory=dict)
    results: Dict[int, dict] = field(default_factory=dict)  # round -> classification
    ownership: float = 0.0


@dataclass
class RaceSession:
    kind: str          # FP1/FP2/FP3/SQ/SPRINT/QUALI/RACE
    label: str
    start: datetime


@dataclass
class Race:
    id: int
    round: int
    name: str
    slug: str
    location: str
    country: str
    circuit: str
    laps: int
    length_km: float
    is_sprint: bool
    race_start: datetime
    deadline: datetime
    weather: str
    status: str        # completed / upcoming / live
    sessions: List[RaceSession] = field(default_factory=list)
    winner_id: Optional[int] = None
    fastest_lap_id: Optional[int] = None
    dotd_id: Optional[int] = None
    classification: List[dict] = field(default_factory=list)
    quali: List[dict] = field(default_factory=list)


@dataclass
class Season:
    year: int
    drivers: Dict[int, Driver]
    constructors: Dict[int, Constructor]
    races: List[Race]
    next_round: int
    engine: FantasyScoringEngine

    @property
    def next_race(self) -> Optional[Race]:
        for r in self.races:
            if r.round == self.next_round:
                return r
        return None

    def driver_list(self) -> List[Driver]:
        return list(self.drivers.values())

    def constructor_list(self) -> List[Constructor]:
        return list(self.constructors.values())


def _slugify(text: str) -> str:
    out = []
    for ch in text.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in " -_":
            out.append("-")
    slug = "".join(out)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-")


# --------------------------------------------------------------------------- #
# Deterministic race simulation.
# --------------------------------------------------------------------------- #


def _simulate_round(rnd: int, drivers: List[Driver], constructors: Dict[int, Constructor]):
    """Return (driver_results, constructor_results, quali_order, meta) for one
    completed round. Fully deterministic in ``rnd``."""
    rng = random.Random(SEASON_YEAR * 1000 + rnd)

    def strength(d: Driver) -> float:
        c = constructors[d.constructor_id]
        return d.skill * 0.62 + c.pace * 42.0

    # Qualifying pace.
    quali_scores = []
    for d in drivers:
        s = strength(d) + rng.gauss(0, 5.5)
        quali_scores.append((d, s))
    quali_scores.sort(key=lambda t: t[1], reverse=True)
    quali_order = {d.id: i + 1 for i, (d, _) in enumerate(quali_scores)}

    # Grid = quali order, occasionally penalized.
    grid = dict(quali_order)
    penalized = set()
    for d in drivers:
        if rng.random() < 0.06:  # ~6% chance of a grid penalty
            drop = rng.randint(3, 6)
            grid[d.id] = min(20, grid[d.id] + drop)
            penalized.add(d.id)
    # Renormalize grid to a clean 1..20 permutation preserving order.
    ordered = sorted(drivers, key=lambda d: grid[d.id])
    grid = {d.id: i + 1 for i, d in enumerate(ordered)}

    # Race: survivors + finishing order.
    dnf_ids = set()
    for d in drivers:
        c = constructors[d.constructor_id]
        fail = (1.0 - c.reliability) * 0.28 + 0.015
        if rng.random() < fail:
            dnf_ids.add(d.id)

    race_scores = []
    for d in drivers:
        if d.id in dnf_ids:
            continue
        s = strength(d) + rng.gauss(0, 6.5) - grid[d.id] * 0.15
        race_scores.append((d, s))
    race_scores.sort(key=lambda t: t[1], reverse=True)
    finish_order = {d.id: i + 1 for i, (d, _) in enumerate(race_scores)}

    # Fastest lap: usually a front-runner, occasionally a fresh-tyre gambit.
    finishers = [d for d, _ in race_scores]
    fl_pool = finishers[: min(8, len(finishers))]
    fastest_lap_id = rng.choice(fl_pool).id if fl_pool else None

    # Driver of the Day: biggest positive mover, else the winner.
    best_gain, dotd_id = -99, None
    for d in finishers:
        gain = grid[d.id] - finish_order[d.id]
        if gain > best_gain:
            best_gain, dotd_id = gain, d.id
    if best_gain <= 1 and finishers:
        dotd_id = finishers[0].id

    # Pit-stop ranking per constructor (weekend fastest stop).
    pit_rank = list(constructors.keys())
    rng.shuffle(pit_rank)
    pit_rank_of = {cid: i + 1 for i, cid in enumerate(pit_rank)}

    is_sprint = CIRCUIT_DEFS[rnd - 1][6]

    driver_results: Dict[int, DriverRaceResult] = {}
    for d in drivers:
        if d.id in dnf_ids:
            status, finish = DNF, None
        else:
            pos = finish_order[d.id]
            status = FINISHED if pos <= 16 else CLASSIFIED
            finish = pos
        driver_results[d.id] = DriverRaceResult(
            driver_id=d.id,
            grid=grid[d.id],
            finish=finish,
            status=status,
            fastest_lap=(d.id == fastest_lap_id),
            driver_of_the_day=(d.id == dotd_id),
            reached_q3=quali_order[d.id] <= 10,
            reached_q2=quali_order[d.id] <= 15,
            quali_position=quali_order[d.id],
            is_sprint=False,
        )

    constructor_results: Dict[int, ConstructorRaceResult] = {}
    for cid, c in constructors.items():
        drs = [driver_results[did] for did in c.driver_ids]
        both_finished = all(dr.status in (FINISHED, CLASSIFIED) for dr in drs)
        constructor_results[cid] = ConstructorRaceResult(
            constructor_id=cid,
            driver_results=drs,
            fastest_pit_stop=(pit_rank_of[cid] == 1),
            both_finished=both_finished,
            pit_stop_rank=pit_rank_of[cid],
        )

    meta = {
        "fastest_lap_id": fastest_lap_id,
        "dotd_id": dotd_id,
        "winner_id": finishers[0].id if finishers else None,
        "grid": grid,
        "quali_order": quali_order,
        "finish_order": finish_order,
        "dnf_ids": dnf_ids,
        "penalized": penalized,
        "is_sprint": is_sprint,
    }
    return driver_results, constructor_results, meta


# --------------------------------------------------------------------------- #
# Season builder.
# --------------------------------------------------------------------------- #


def _build_calendar(now: datetime) -> List[Race]:
    """Anchor round ``COMPLETED_ROUNDS+1`` a few days out; two-week cadence."""
    next_round = COMPLETED_ROUNDS + 1
    anchor_race = now + timedelta(days=2, hours=14, minutes=37, seconds=8)
    races: List[Race] = []
    for i, (name, loc, country, circuit, laps, length, sprint) in enumerate(CIRCUIT_DEFS):
        rnd = i + 1
        race_start = anchor_race + timedelta(days=14 * (rnd - next_round))
        if rnd < next_round:
            status = "completed"
        elif rnd == next_round:
            status = "upcoming"
        else:
            status = "upcoming"
        # Sessions across the weekend (race day = race_start).
        fp1 = race_start - timedelta(days=2, hours=6)
        sessions = [RaceSession("FP1", "Practice 1", fp1)]
        if sprint:
            sessions.append(RaceSession("FP2", "Practice 2", fp1 + timedelta(hours=4)))
            sessions.append(RaceSession("SQ", "Sprint Qualifying", race_start - timedelta(days=1, hours=6)))
            sessions.append(RaceSession("SPRINT", "Sprint", race_start - timedelta(days=1, hours=2)))
            sessions.append(RaceSession("QUALI", "Qualifying", race_start - timedelta(hours=4)))
        else:
            sessions.append(RaceSession("FP2", "Practice 2", fp1 + timedelta(hours=4)))
            sessions.append(RaceSession("FP3", "Practice 3", race_start - timedelta(days=1, hours=6)))
            sessions.append(RaceSession("QUALI", "Qualifying", race_start - timedelta(days=1, hours=2)))
        sessions.append(RaceSession("RACE", "Grand Prix", race_start))
        # Deadline = first competitive session (quali, or sprint quali).
        deadline = min(
            (s.start for s in sessions if s.kind in ("QUALI", "SQ")),
            default=race_start,
        )
        rng = random.Random(SEASON_YEAR * 7 + rnd)
        races.append(
            Race(
                id=rnd,
                round=rnd,
                name=name,
                slug=_slugify(name),
                location=loc,
                country=country,
                circuit=circuit,
                laps=laps,
                length_km=length,
                is_sprint=sprint,
                race_start=race_start,
                deadline=deadline,
                weather=rng.choice(WEATHER),
                status=status,
                sessions=sessions,
            )
        )
    return races


def build_season(now: Optional[datetime] = None) -> Season:
    now = now or datetime.now(UTC)
    engine = FantasyScoringEngine()

    constructors: Dict[int, Constructor] = {}
    for i, (name, pace, rel, color, short) in enumerate(CONSTRUCTOR_DEFS):
        cid = i + 1
        constructors[cid] = Constructor(
            id=cid, name=name, slug=_slugify(name), short=short,
            color=color, pace=pace, reliability=rel,
        )

    drivers: Dict[int, Driver] = {}
    for i, (name, short, number, country, skill, cidx) in enumerate(DRIVER_DEFS):
        did = i + 1
        cid = cidx + 1
        d = Driver(
            id=did, name=name, short=short, number=number, country=country,
            skill=skill, constructor_id=cid, slug=_slugify(name),
        )
        drivers[did] = d
        constructors[cid].driver_ids.append(did)

    races = _build_calendar(now)

    # Simulate completed rounds and accumulate.
    driver_objs = list(drivers.values())
    for race in races:
        if race.status != "completed":
            continue
        dr, cr, meta = _simulate_round(race.round, driver_objs, constructors)
        race.winner_id = meta["winner_id"]
        race.fastest_lap_id = meta["fastest_lap_id"]
        race.dotd_id = meta["dotd_id"]

        for did, result in dr.items():
            bd = engine.score_driver(result, teammate=_teammate_result(did, drivers, dr))
            d = drivers[did]
            d.points += bd.total
            d.round_points[race.round] = bd.total
            d.round_breakdown[race.round] = bd.items
            d.results[race.round] = {
                "grid": result.grid,
                "finish": result.finish,
                "status": result.status,
                "quali": result.quali_position,
                "fastest_lap": result.fastest_lap,
                "dotd": result.driver_of_the_day,
            }

        for cid, result in cr.items():
            bd = engine.score_constructor(result)
            c = constructors[cid]
            c.points += bd.total
            c.round_points[race.round] = bd.total

        # Build race classification + quali tables for the race detail page.
        race.classification = _classification_rows(dr, drivers, constructors)
        race.quali = _quali_rows(meta["quali_order"], drivers, constructors)

    _finalize_metrics(drivers, constructors)
    return Season(
        year=SEASON_YEAR,
        drivers=drivers,
        constructors=constructors,
        races=races,
        next_round=COMPLETED_ROUNDS + 1,
        engine=engine,
    )


def _teammate_result(did, drivers, dr):
    d = drivers[did]
    for did2 in drivers:
        if did2 != did and drivers[did2].constructor_id == d.constructor_id:
            return dr.get(did2)
    return None


def _classification_rows(dr, drivers, constructors):
    rows = []
    for did, r in dr.items():
        d = drivers[did]
        rows.append({
            "driver_id": did, "name": d.name, "short": d.short, "number": d.number,
            "constructor": constructors[d.constructor_id].name,
            "color": constructors[d.constructor_id].color,
            "grid": r.grid, "finish": r.finish, "status": r.status,
            "fastest_lap": r.fastest_lap, "dotd": r.driver_of_the_day,
            "delta": (r.grid - r.finish) if r.finish else None,
        })
    rows.sort(key=lambda x: (x["finish"] is None, x["finish"] or 99))
    return rows


def _quali_rows(quali_order, drivers, constructors):
    rows = []
    for did, pos in quali_order.items():
        d = drivers[did]
        rows.append({
            "driver_id": did, "name": d.name, "short": d.short,
            "constructor": constructors[d.constructor_id].name,
            "color": constructors[d.constructor_id].color, "position": pos,
        })
    rows.sort(key=lambda x: x["position"])
    return rows


def _finalize_metrics(drivers: Dict[int, Driver], constructors: Dict[int, Constructor]):
    """Derive form (last-5 avg), prices (from performance), and ownership."""
    completed = list(range(1, COMPLETED_ROUNDS + 1))
    last5 = completed[-5:]

    # Form = average points over last 5 rounds, on a 0-10-ish scale.
    for d in drivers.values():
        recent = [d.round_points.get(r, 0) for r in last5]
        avg = sum(recent) / len(recent) if recent else 0
        d.form = round(max(0.0, min(10.0, avg / 4.0)), 1)
    for c in constructors.values():
        recent = [c.round_points.get(r, 0) for r in last5]
        avg = sum(recent) / len(recent) if recent else 0
        c.form = round(max(0.0, min(10.0, avg / 8.0)), 1)

    # Prices: map season points to a $5.0–$30.0 market for drivers.
    d_pts = [d.points for d in drivers.values()]
    dmin, dmax = min(d_pts), max(d_pts)
    for d in drivers.values():
        frac = (d.points - dmin) / (dmax - dmin) if dmax > dmin else 0.5
        # slight curve so top drivers are premium
        price = 5.0 + (frac ** 0.85) * 24.5
        d.price = round(price * 2) / 2  # nearest 0.5
        # Previous price implied by a small form-based drift.
        drift = (d.form - 5.0) * 0.12
        d.price_prev = round((d.price - drift) * 2) / 2

    c_pts = [c.points for c in constructors.values()]
    cmin, cmax = min(c_pts), max(c_pts)
    for c in constructors.values():
        frac = (c.points - cmin) / (cmax - cmin) if cmax > cmin else 0.5
        price = 6.0 + (frac ** 0.9) * 20.0
        c.price = round(price * 2) / 2
        drift = (c.form - 5.0) * 0.15
        c.price_prev = round((c.price - drift) * 2) / 2

    # Ownership: deterministic pseudo-metric anchored to price/form so the
    # market looks alive without scanning any real teams.
    rng = random.Random(4242)
    for d in sorted(drivers.values(), key=lambda x: x.points, reverse=True):
        base = 6 + (d.price / 30.0) * 48 + d.form * 2
        d.ownership = round(min(72.0, max(1.0, base + rng.uniform(-6, 6))), 1)
    for c in sorted(constructors.values(), key=lambda x: x.points, reverse=True):
        base = 8 + (c.price / 26.0) * 44 + c.form * 2
        c.ownership = round(min(70.0, max(2.0, base + rng.uniform(-5, 5))), 1)
