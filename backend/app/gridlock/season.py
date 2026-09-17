"""Seeded GRIDLOCK 2026 season.

Benchmarks the real Formula 1 2026 season — constructors, drivers, circuits —
referenced for fantasy play only. Race results are generated
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
from .pricing import price_constructor_path, price_driver_path

UTC = timezone.utc
SEASON_YEAR = 2026
TOTAL_ROUNDS = 24
COMPLETED_ROUNDS = 14  # rounds 1..14 finished; round 15 is the next race.


# --------------------------------------------------------------------------- #
# Static identities — the real 2026 F1 grid (fantasy play only).
# --------------------------------------------------------------------------- #

# (name, base_pace 0-1, reliability 0-1, hex color, accessible/dark shade,
#  short code, media folder) — colors + media folder match formula1.com.
CONSTRUCTOR_DEFS = [
    ("McLaren", 0.95, 0.92, "#FF8000", "#804000", "MCL", "mclaren"),
    ("Ferrari", 0.93, 0.93, "#E8002D", "#5C0012", "FER", "ferrari"),
    ("Red Bull Racing", 0.91, 0.90, "#3671C6", "#142948", "RBR", "redbullracing"),
    ("Mercedes", 0.89, 0.91, "#27F4D2", "#067E6A", "MER", "mercedes"),
    ("Aston Martin", 0.83, 0.87, "#229971", "#0F4331", "AMR", "astonmartin"),
    ("Williams", 0.79, 0.86, "#1868DB", "#082145", "WIL", "williams"),
    ("Alpine", 0.71, 0.81, "#00A1E8", "#004E70", "ALP", "alpine"),
    ("Racing Bulls", 0.66, 0.85, "#6692FF", "#0038C2", "RB", "racingbulls"),
    ("Haas F1 Team", 0.64, 0.80, "#DEE1E2", "#667175", "HAA", "haasf1team"),
    ("Audi", 0.60, 0.77, "#FF2D00", "#751500", "AUD", "audi"),
    ("Cadillac", 0.52, 0.75, "#AAAAAD", "#58585B", "CAD", "cadillac"),
]

# (name, short, number, country ISO2, skill 0-100, constructor index, media code)
# Confirmed 2026 F1 grid — 11 teams, 22 seats. Names + media codes match formula1.com.
DRIVER_DEFS = [
    ("Lando Norris", "NOR", 1, "GB", 95, 0, "lannor01"),
    ("Oscar Piastri", "PIA", 81, "AU", 92, 0, "oscpia01"),
    ("Charles Leclerc", "LEC", 16, "MC", 94, 1, "chalec01"),
    ("Lewis Hamilton", "HAM", 44, "GB", 92, 1, "lewham01"),
    ("Max Verstappen", "VER", 3, "NL", 96, 2, "maxver01"),
    ("Isack Hadjar", "HAD", 6, "FR", 84, 2, "isahad01"),
    ("George Russell", "RUS", 63, "GB", 90, 3, "georus01"),
    ("Kimi Antonelli", "ANT", 12, "IT", 85, 3, "andant01"),
    ("Fernando Alonso", "ALO", 14, "ES", 89, 4, "feralo01"),
    ("Lance Stroll", "STR", 18, "CA", 77, 4, "lanstr01"),
    ("Carlos Sainz", "SAI", 55, "ES", 87, 5, "carsai01"),
    ("Alexander Albon", "ALB", 23, "TH", 85, 5, "alealb01"),
    ("Pierre Gasly", "GAS", 10, "FR", 81, 6, "piegas01"),
    ("Franco Colapinto", "COL", 43, "AR", 76, 6, "fracol01"),
    ("Liam Lawson", "LAW", 30, "NZ", 79, 7, "lialaw01"),
    ("Arvid Lindblad", "LIN", 41, "GB", 74, 7, "arvlin01"),
    ("Esteban Ocon", "OCO", 31, "FR", 80, 8, "estoco01"),
    ("Oliver Bearman", "BEA", 87, "GB", 79, 8, "olibea01"),
    ("Nico Hulkenberg", "HUL", 27, "DE", 78, 9, "nichul01"),
    ("Gabriel Bortoleto", "BOR", 5, "BR", 77, 9, "gabbor01"),
    ("Sergio Perez", "PER", 11, "MX", 83, 10, "serper01"),
    ("Valtteri Bottas", "BOT", 77, "FI", 80, 10, "valbot01"),
]

# formula1.com media CDN — real driver/car/logo art (2026 fallback renders).
_MEDIA_BASE = "https://media.formula1.com/image/upload"


def _driver_image(team_folder: str, code: str) -> str:
    return (
        f"{_MEDIA_BASE}/c_lfill,w_200/q_auto/"
        f"d_common:f1:2026:fallback:driver:2026fallbackdriverright.webp/"
        f"v1740000001/common/f1/2026/{team_folder}/{code}/2026{team_folder}{code}right.webp"
    )


def _car_image(team_folder: str) -> str:
    return (
        f"{_MEDIA_BASE}/c_lfill,h_224/q_auto/"
        f"d_common:f1:2026:fallback:car:2026fallbackcarright.webp/"
        f"v1740000001/common/f1/2026/{team_folder}/2026{team_folder}carright.webp"
    )


def _logo_image(team_folder: str) -> str:
    return f"{_MEDIA_BASE}/c_lfill,w_128/q_auto/v1740000001/common/f1/2026/{team_folder}/2026{team_folder}logowhite.webp"

# (round, name, location, country ISO2, circuit, laps, length_km, sprint?)
CIRCUIT_DEFS = [
    ("Australian Grand Prix", "Melbourne", "AU", "Albert Park Circuit", 58, 5.28, False),
    ("Chinese Grand Prix", "Shanghai", "CN", "Shanghai International Circuit", 56, 5.45, True),
    ("Japanese Grand Prix", "Suzuka", "JP", "Suzuka International Racing Course", 53, 5.81, False),
    ("Bahrain Grand Prix", "Sakhir", "BH", "Bahrain International Circuit", 57, 5.41, False),
    ("Saudi Arabian Grand Prix", "Jeddah", "SA", "Jeddah Corniche Circuit", 50, 6.17, False),
    ("Miami Grand Prix", "Miami", "US", "Miami International Autodrome", 57, 5.41, True),
    ("Emilia-Romagna Grand Prix", "Imola", "IT", "Autodromo Enzo e Dino Ferrari", 63, 4.91, False),
    ("Monaco Grand Prix", "Monaco", "MC", "Circuit de Monaco", 78, 3.34, False),
    ("Spanish Grand Prix", "Barcelona", "ES", "Circuit de Barcelona-Catalunya", 66, 4.66, False),
    ("Canadian Grand Prix", "Montréal", "CA", "Circuit Gilles Villeneuve", 70, 4.36, False),
    ("Austrian Grand Prix", "Spielberg", "AT", "Red Bull Ring", 71, 4.32, True),
    ("British Grand Prix", "Silverstone", "GB", "Silverstone Circuit", 52, 5.89, False),
    ("Belgian Grand Prix", "Spa", "BE", "Circuit de Spa-Francorchamps", 44, 7.00, True),
    ("Hungarian Grand Prix", "Budapest", "HU", "Hungaroring", 70, 4.38, False),
    ("Dutch Grand Prix", "Zandvoort", "NL", "Circuit Zandvoort", 72, 4.26, False),
    ("Italian Grand Prix", "Monza", "IT", "Autodromo Nazionale Monza", 53, 5.79, False),
    ("Azerbaijan Grand Prix", "Baku", "AZ", "Baku City Circuit", 51, 6.00, False),
    ("Singapore Grand Prix", "Marina Bay", "SG", "Marina Bay Street Circuit", 62, 4.94, False),
    ("United States Grand Prix", "Austin", "US", "Circuit of the Americas", 56, 5.51, True),
    ("Mexico City Grand Prix", "Mexico City", "MX", "Autódromo Hermanos Rodríguez", 71, 4.30, False),
    ("São Paulo Grand Prix", "São Paulo", "BR", "Autódromo José Carlos Pace", 71, 4.31, True),
    ("Las Vegas Grand Prix", "Las Vegas", "US", "Las Vegas Strip Circuit", 50, 6.20, False),
    ("Qatar Grand Prix", "Lusail", "QA", "Lusail International Circuit", 57, 5.42, False),
    ("Abu Dhabi Grand Prix", "Abu Dhabi", "AE", "Yas Marina Circuit", 58, 5.28, False),
]

COUNTRY_NAMES = {
    "AU": "Australia", "SA": "Saudi Arabia", "BH": "Bahrain", "JP": "Japan",
    "CN": "China", "US": "United States", "IT": "Italy", "MC": "Monaco",
    "ES": "Spain", "CA": "Canada", "AT": "Austria", "GB": "United Kingdom",
    "HU": "Hungary", "BE": "Belgium", "NL": "Netherlands", "SG": "Singapore",
    "MX": "Mexico", "BR": "Brazil", "QA": "Qatar", "AE": "United Arab Emirates",
    "AZ": "Azerbaijan", "NZ": "New Zealand", "TH": "Thailand", "AR": "Argentina",
    "FI": "Finland", "FR": "France", "DE": "Germany",
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
    price_history: list = field(default_factory=list)
    points: int = 0
    form: float = 0.0
    round_points: Dict[int, int] = field(default_factory=dict)
    round_breakdown: Dict[int, list] = field(default_factory=dict)
    ownership: float = 0.0
    accessible_color: str = ""
    logo_url: str = ""
    car_url: str = ""


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
    price_history: list = field(default_factory=list)
    points: int = 0
    form: float = 0.0
    status: str = "active"  # active / reserve / withdrawn / suspended
    round_points: Dict[int, int] = field(default_factory=dict)
    round_breakdown: Dict[int, list] = field(default_factory=dict)
    results: Dict[int, dict] = field(default_factory=dict)  # round -> classification
    ownership: float = 0.0
    image_url: str = ""


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
            quali_position=quali_order[d.id],
            is_sprint=False,
        )

    constructor_results: Dict[int, ConstructorRaceResult] = {}
    for cid, c in constructors.items():
        drs = [driver_results[did] for did in c.driver_ids]
        constructor_results[cid] = ConstructorRaceResult(
            constructor_id=cid,
            driver_results=drs,
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
    for i, (name, pace, rel, color, accessible, short, folder) in enumerate(CONSTRUCTOR_DEFS):
        cid = i + 1
        constructors[cid] = Constructor(
            id=cid, name=name, slug=_slugify(name), short=short,
            color=color, pace=pace, reliability=rel,
            accessible_color=accessible, logo_url=_logo_image(folder), car_url=_car_image(folder),
        )

    drivers: Dict[int, Driver] = {}
    for i, (name, short, number, country, skill, cidx, code) in enumerate(DRIVER_DEFS):
        did = i + 1
        cid = cidx + 1
        folder = CONSTRUCTOR_DEFS[cidx][6]
        d = Driver(
            id=did, name=name, short=short, number=number, country=country,
            skill=skill, constructor_id=cid, slug=_slugify(name),
            image_url=_driver_image(folder, code),
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
                "dotd": did == meta["dotd_id"],
            }

        for cid, result in cr.items():
            bd = engine.score_constructor(result)
            c = constructors[cid]
            c.points += bd.total
            c.round_points[race.round] = bd.total
            c.round_breakdown[race.round] = bd.items

        # Build race classification + quali tables for the race detail page.
        race.classification = _classification_rows(dr, drivers, constructors, meta["dotd_id"])
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


def _classification_rows(dr, drivers, constructors, dotd_id=None):
    from .scoring import CLASSIFIED_STATES
    rows = []
    for did, r in dr.items():
        d = drivers[did]
        classified = r.status in CLASSIFIED_STATES and r.finish is not None
        rows.append({
            "driver_id": did, "name": d.name, "short": d.short, "number": d.number,
            "constructor": constructors[d.constructor_id].name,
            "color": constructors[d.constructor_id].color,
            "grid": r.grid, "finish": r.finish, "status": r.status,
            "fastest_lap": r.fastest_lap, "dotd": did == dotd_id,
            "delta": (r.grid - r.finish) if classified else None,
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


def _finalize_metrics(
    drivers: Dict[int, Driver], constructors: Dict[int, Constructor],
    completed_rounds: int = COMPLETED_ROUNDS,
):
    """Derive form (last-5 avg), prices (from performance), and ownership."""
    completed = list(range(1, completed_rounds + 1))
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

    # Ownership first (points/form-anchored) so the pricing engine can use it.
    rng = random.Random(4242)
    for d in sorted(drivers.values(), key=lambda x: x.points, reverse=True):
        base = 6 + (d.points / max(1, max(x.points for x in drivers.values()))) * 52 + d.form * 2
        d.ownership = round(min(72.0, max(1.0, base + rng.uniform(-6, 6))), 1)
    for c in sorted(constructors.values(), key=lambda x: x.points, reverse=True):
        base = 8 + (c.points / max(1, max(x.points for x in constructors.values()))) * 46 + c.form * 2
        c.ownership = round(min(70.0, max(2.0, base + rng.uniform(-5, 5))), 1)

    # Dynamic pricing — evolve prices across the season from performance, form
    # and ownership (see pricing.py). Opening price anchored to skill + pace.
    d_raw = {d.id: d.skill * 0.6 + constructors[d.constructor_id].pace * 40 for d in drivers.values()}
    d_lo, d_hi = min(d_raw.values()), max(d_raw.values())
    for d in drivers.values():
        hist = price_driver_path(d_raw[d.id], d_lo, d_hi, d.round_points, d.form, d.ownership, completed)
        d.price_history = hist
        d.price = hist[-1]["price"]
        d.price_prev = hist[-2]["price"] if len(hist) > 1 else d.price

    c_raw = {c.id: c.pace * 40 for c in constructors.values()}
    c_lo, c_hi = min(c_raw.values()), max(c_raw.values())
    for c in constructors.values():
        hist = price_constructor_path(c_raw[c.id], c_lo, c_hi, c.round_points, c.form, c.ownership, completed)
        c.price_history = hist
        c.price = hist[-1]["price"]
        c.price_prev = hist[-2]["price"] if len(hist) > 1 else c.price
