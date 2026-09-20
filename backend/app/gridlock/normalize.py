"""Normalize OpenF1 responses into GRIDLOCK domain objects.

Driver/constructor *identity* (name, official color, logo, car art) comes from
our curated 2026 grid in :mod:`season` — OpenF1 gives us real results, dates,
and weather, not brand assets. A driver number OpenF1 reports that isn't on
our curated grid (a reserve-driver substitution) is skipped rather than
guessed at, so identities stay stable and accurate.

Everything here is tolerant of missing fields — not every session carries
every attribute. The pure helpers are unit-tested with fixture payloads.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

from .scoring import (
    CLASSIFIED_STATES, DNF, DNS, DSQ, FINISHED,
    ConstructorRaceResult, DriverRaceResult, FantasyScoringEngine,
)
from .season import (
    CONSTRUCTOR_DEFS, DRIVER_DEFS,
    Constructor, Driver, Race, RaceSession, Season,
    _car_image, _driver_image, _finalize_metrics, _logo_image, _quali_rows, _slugify,
)

UTC = timezone.utc

# OpenF1 reports ISO3 country codes; the rest of GRIDLOCK (flags, COUNTRY_NAMES) uses ISO2.
_ISO3_TO_ISO2 = {
    "AUS": "AU", "CHN": "CN", "JPN": "JP", "BRN": "BH", "KSA": "SA", "USA": "US",
    "CAN": "CA", "MON": "MC", "ESP": "ES", "AUT": "AT", "GBR": "GB", "BEL": "BE",
    "HUN": "HU", "NED": "NL", "ITA": "IT", "AZE": "AZ", "SGP": "SG", "MEX": "MX",
    "BRA": "BR", "QAT": "QA", "UAE": "AE", "MYS": "MY", "MAS": "MY",
}

# Best-effort real lap count / circuit length by OpenF1 circuit_short_name —
# OpenF1 doesn't expose these, so we carry over accurate real-world values for
# established circuits and use a sane generic default for brand-new ones.
_CIRCUIT_INFO = {
    "Melbourne": (58, 5.28), "Shanghai": (56, 5.45), "Suzuka": (53, 5.81),
    "Sakhir": (57, 5.41), "Jeddah": (50, 6.17), "Miami": (57, 5.41),
    "Montreal": (70, 4.36), "Monte Carlo": (78, 3.34), "Catalunya": (66, 4.66),
    "Madring": (58, 5.47), "Spielberg": (71, 4.32), "Silverstone": (52, 5.89),
    "Spa-Francorchamps": (44, 7.00), "Hungaroring": (70, 4.38), "Zandvoort": (72, 4.26),
    "Monza": (53, 5.79), "Baku": (51, 6.00), "Kuala Lumpur": (56, 5.54),
    "Singapore": (62, 4.94), "Austin": (56, 5.51), "Mexico City": (71, 4.30),
    "Interlagos": (71, 4.31), "Las Vegas": (50, 6.20), "Lusail": (57, 5.42),
    "Yas Marina Circuit": (58, 5.28),
}


# --------------------------------------------------------------------------- #
# Pure helpers (unit-tested).
# --------------------------------------------------------------------------- #

def normalize_status(result_row: dict) -> str:
    """Map an OpenF1 session_result row to a GRIDLOCK classification."""
    if result_row.get("dsq"):
        return DSQ
    if result_row.get("dns"):
        return DNS
    if result_row.get("dnf"):
        return DNF
    if result_row.get("position") in (None, ""):
        # No position and not flagged: treat as DNF (didn't classify).
        return DNF
    return FINISHED


def fastest_lap_driver(laps: List[dict]) -> Optional[int]:
    """Driver number with the fastest valid race lap, or None."""
    best: Optional[float] = None
    who: Optional[int] = None
    for lap in laps:
        dur = lap.get("lap_duration")
        num = lap.get("driver_number")
        if dur is None or num is None:
            continue
        if lap.get("is_pit_out_lap"):
            continue
        if best is None or dur < best:
            best, who = dur, num
    return who


def pit_rank_map(pit_rows: List[dict]) -> Dict[int, int]:
    """Rank each driver's *best* pit stop by duration → {driver_number: rank}."""
    best_by_driver: Dict[int, float] = {}
    for p in pit_rows:
        num = p.get("driver_number")
        dur = p.get("pit_duration")
        if num is None or dur is None:
            continue
        if num not in best_by_driver or dur < best_by_driver[num]:
            best_by_driver[num] = dur
    ranked = sorted(best_by_driver.items(), key=lambda kv: kv[1])
    return {num: i + 1 for i, (num, _) in enumerate(ranked)}


def build_driver_result(
    driver_number: int,
    result_row: Optional[dict],
    grid_position: Optional[int],
    quali_position: Optional[int],
    is_fastest: bool,
    is_sprint: bool = False,
) -> DriverRaceResult:
    status = normalize_status(result_row) if result_row else DNS
    finish = None
    if status in CLASSIFIED_STATES and result_row:
        pos = result_row.get("position")
        finish = int(pos) if pos not in (None, "") else None
    return DriverRaceResult(
        driver_id=driver_number,
        quali_position=quali_position,
        grid=grid_position,
        finish=finish,
        status=status,
        fastest_lap=is_fastest,
        is_sprint=is_sprint,
    )


def weather_label(rows: List[dict]) -> str:
    """A short human label from the last real weather reading of a session."""
    if not rows:
        return "—"
    w = rows[-1]
    if (w.get("rainfall") or 0) > 0:
        return "Wet"
    temp = w.get("air_temperature")
    if temp is None:
        return "Dry"
    if temp >= 30:
        return "Dry · Hot"
    if temp >= 22:
        return "Dry · Warm"
    return "Overcast"


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _teammate(num, drivers, dr):
    d = drivers[num]
    for n in drivers:
        if n != num and drivers[n].constructor_id == d.constructor_id:
            return dr.get(n)
    return None


def _winner(dr: Dict[int, DriverRaceResult]) -> Optional[int]:
    winners = [d for d in dr.values() if d.finish == 1]
    return winners[0].driver_id if winners else None


# --------------------------------------------------------------------------- #
# Orchestrator (live).
# --------------------------------------------------------------------------- #

def _fetch_weekend(client, weekend: List[dict], race_sess: dict) -> dict:
    """All the raw OpenF1 data one Grand Prix weekend needs, in one call — run
    across weekends concurrently by the caller."""
    start = _parse_dt(race_sess.get("date_start"))
    if start and start > datetime.now(UTC) and all(
        (_parse_dt(s.get("date_start")) or start) > datetime.now(UTC) for s in weekend
    ):
        return {"results": {}, "grid": {}, "quali": {}, "has_results": False,
                "fl": None, "pits": {}, "weather": [], "sprint_results": {},
                "sprint_grid": {}, "sprint_quali": {}}
    skey = race_sess.get("session_key")
    results = {r.get("driver_number"): r for r in client.session_result(session_key=skey)}
    grid = {g.get("driver_number"): g.get("position") for g in client.starting_grid(session_key=skey)}
    quali_sess = next((s for s in weekend if (s.get("session_name") or "") == "Qualifying"), None)
    quali: Dict[int, int] = {}
    if quali_sess:
        for q in client.session_result(session_key=quali_sess.get("session_key")):
            quali[q.get("driver_number")] = q.get("position")
    has_results = any(r.get("position") is not None for r in results.values())
    fl = fastest_lap_driver(client.laps(session_key=skey)) if has_results else None
    pits = pit_rank_map(client.pit(session_key=skey)) if has_results else {}
    weather = client.weather(session_key=skey) if has_results else []

    # Sprint weekend: the sprint race and its own grid score separately.
    sprint_sess = next((s for s in weekend if (s.get("session_name") or "") == "Sprint"), None)
    sprint_results: Dict[int, dict] = {}
    sprint_grid: Dict[int, int] = {}
    if sprint_sess:
        skey2 = sprint_sess.get("session_key")
        sprint_results = {r.get("driver_number"): r for r in client.session_result(session_key=skey2)}
        sprint_grid = {g.get("driver_number"): g.get("position") for g in client.starting_grid(session_key=skey2)}

    # Sprint qualifying (aka Sprint Shootout in some seasons) sets the sprint
    # grid — its own session, distinct from both "Sprint" and "Qualifying".
    sprint_quali_sess = next(
        (s for s in weekend if "sprint" in (s.get("session_name") or "").lower()
         and "quali" in (s.get("session_name") or "").lower()), None,
    )
    sprint_quali: Dict[int, int] = {}
    if sprint_quali_sess:
        for q in client.session_result(session_key=sprint_quali_sess.get("session_key")):
            sprint_quali[q.get("driver_number")] = q.get("position")

    return {
        "results": results, "grid": grid, "quali": quali, "has_results": has_results,
        "fl": fl, "pits": pits, "weather": weather,
        "sprint_results": sprint_results, "sprint_grid": sprint_grid, "sprint_quali": sprint_quali,
    }


def normalize_season(client, year: int) -> Optional[Season]:
    """Build a full Season from real OpenF1 data for ``year``. Returns None if
    there isn't enough data to be useful (caller falls back to the seeded
    season)."""
    meetings = [
        m for m in client.meetings(year=year)
        if not m.get("is_cancelled") and "Grand Prix" in (m.get("meeting_name") or "")
    ]
    if not meetings:
        return None
    meetings.sort(key=lambda m: m.get("date_start") or "")

    all_sessions = client.sessions(year=year)
    by_meeting: Dict[int, List[dict]] = {}
    for s in all_sessions:
        by_meeting.setdefault(s.get("meeting_key"), []).append(s)

    engine = FantasyScoringEngine()

    # Identities + media come from our curated, hand-verified 2026 grid.
    constructors: Dict[int, Constructor] = {}
    for i, (name, pace, rel, color, accessible, short, folder) in enumerate(CONSTRUCTOR_DEFS):
        cid = i + 1
        constructors[cid] = Constructor(
            id=cid, name=name, slug=_slugify(name), short=short, color=color,
            pace=pace, reliability=rel, accessible_color=accessible,
            logo_url=_logo_image(folder), car_url=_car_image(folder),
        )
    drivers: Dict[int, Driver] = {}
    for name, short, number, country, skill, cidx, code in DRIVER_DEFS:
        cid = cidx + 1
        folder = CONSTRUCTOR_DEFS[cidx][6]
        drivers[number] = Driver(
            id=number, name=name, short=short, number=number, country=country,
            skill=skill, constructor_id=cid, slug=_slugify(name),
            image_url=_driver_image(folder, code),
        )
        constructors[cid].driver_ids.append(number)

    # Fetch every weekend's raw data concurrently — sequentially this is ~5
    # blocking HTTP calls x 24 rounds and takes well over a minute, which is
    # unusable for a cold request. Each round's calls stay sequential (grid
    # depends on nothing else), but rounds run in parallel with each other.
    weekends = []
    for rnd, meeting in enumerate(meetings, start=1):
        weekend = by_meeting.get(meeting.get("meeting_key"), [])
        race_sess = next((s for s in weekend if (s.get("session_name") or "") == "Race"), None)
        if race_sess is not None:
            weekends.append((rnd, meeting, weekend, race_sess))

    fetched: Dict[int, dict] = {}
    with ThreadPoolExecutor(max_workers=min(8, len(weekends) or 1)) as pool:
        futures = {pool.submit(_fetch_weekend, client, weekend, race_sess): rnd for rnd, _, weekend, race_sess in weekends}
        for future in as_completed(futures):
            fetched[futures[future]] = future.result()

    races: List[Race] = []
    with_data = 0
    elapsed = 0
    now = datetime.now(UTC)
    for rnd, meeting, weekend, race_sess in weekends:
        is_sprint = any((s.get("session_name") or "") == "Sprint" for s in weekend)
        data = fetched[rnd]
        results, grid, quali = data["results"], data["grid"], data["quali"]
        has_results, fl, pits = data["has_results"], data["fl"], data["pits"]
        sprint_results, sprint_grid = data["sprint_results"], data["sprint_grid"]
        sprint_quali = data["sprint_quali"]

        # Only score drivers OpenF1 actually reports a result row for this
        # weekend — a missing row means missing data, not a DNS penalty.
        dr: Dict[int, DriverRaceResult] = {}
        for num in drivers:
            if num not in results:
                continue
            dr[num] = build_driver_result(
                num, results.get(num), grid.get(num), quali.get(num),
                is_fastest=(num == fl), is_sprint=False,
            )
        sprint_dr: Dict[int, DriverRaceResult] = {}
        for num in drivers:
            if num not in sprint_results:
                continue
            sprint_dr[num] = build_driver_result(
                num, sprint_results.get(num), sprint_grid.get(num), None,
                is_fastest=False, is_sprint=True,
            )

        start = _parse_dt(race_sess.get("date_start")) or now
        # "Completed" means the calendar date has passed — never whether the
        # results happened to be present, so a data gap on one round (OpenF1
        # occasionally has one) doesn't make a past race look "upcoming".
        status = "completed" if start + timedelta(hours=2, minutes=30) < now else "live" if start <= now else "upcoming"
        if status == "completed":
            elapsed += 1
        if has_results:
            with_data += 1
            dotd_id = None
            for num, result in dr.items():
                mate = _teammate(num, drivers, dr)
                bd = engine.score_driver(result, teammate=mate)
                total = bd.total
                items = list(bd.items)
                if num in sprint_dr:
                    sprint_mate = _teammate(num, drivers, sprint_dr)
                    sbd = engine.score_driver(sprint_dr[num], teammate=sprint_mate)
                    total += sbd.total
                    items += sbd.items
                d = drivers[num]
                d.points += total
                d.round_points[rnd] = total
                d.round_breakdown[rnd] = items
                d.results[rnd] = {
                    "grid": result.grid, "finish": result.finish, "status": result.status,
                    "quali": result.quali_position, "fastest_lap": result.fastest_lap,
                    "dotd": num == dotd_id,
                }
            for cid, c in constructors.items():
                drs = [dr[n] for n in c.driver_ids if n in dr]
                if not drs:
                    continue
                cbd = engine.score_constructor(ConstructorRaceResult(
                    cid, drs, pit_stop_rank=min((pits.get(n) for n in c.driver_ids if pits.get(n)), default=None)))
                c.points += cbd.total
                c.round_points[rnd] = cbd.total
                c.round_breakdown[rnd] = cbd.items

        country_iso2 = meeting.get("country_iso2") or _ISO3_TO_ISO2.get(meeting.get("country_code") or "", "XX")
        circuit_name = race_sess.get("circuit_short_name") or ""
        laps, length_km = _CIRCUIT_INFO.get(circuit_name, (56, 5.20))
        weather = weather_label(data["weather"]) if has_results else "—"
        races.append(Race(
            id=rnd, round=rnd,
            name=meeting.get("meeting_name") or f"{circuit_name} Grand Prix",
            slug=_slugify(meeting.get("meeting_name") or f"round-{rnd}"),
            location=race_sess.get("location") or circuit_name, country=country_iso2,
            circuit=circuit_name, laps=laps, length_km=length_km, is_sprint=is_sprint,
            race_start=start, deadline=start, weather=weather, status=status,
            sessions=[RaceSession({"Race": "RACE", "Qualifying": "QUALI", "Sprint": "SPRINT", "Sprint Qualifying": "SQ", "Practice 1": "FP1", "Practice 2": "FP2", "Practice 3": "FP3"}.get(sess.get("session_name"), "SESSION"), sess.get("session_name", "Session"), _parse_dt(sess["date_start"])) for sess in weekend if _parse_dt(sess.get("date_start"))],
            winner_id=_winner(dr), fastest_lap_id=fl,
            classification=_classification(dr, drivers, constructors) if has_results else [],
            quali=_quali_rows({n:p for n,p in quali.items() if n in drivers}, drivers, constructors) if quali else [],
            sprint_classification=_classification(sprint_dr, drivers, constructors) if sprint_dr and has_results else [],
            sprint_quali=_quali_rows({n:p for n,p in sprint_quali.items() if n in drivers}, drivers, constructors) if sprint_quali else [],
            circuit_image_url=meeting.get("circuit_image") or "",
        ))

    if not races:
        return None
    _finalize_metrics(drivers, constructors, completed_rounds=max(1, elapsed))
    # First race whose date hasn't happened yet — based on the calendar, never
    # on whether results data happens to be present (OpenF1 occasionally has
    # a gap on one past round; that must not make it look "next").
    next_round = next((r.round for r in races if r.status != "completed"), len(races))
    return Season(
        year=year, drivers=drivers, constructors=constructors, races=races,
        next_round=next_round, engine=engine,
    )


def _driver_of_the_day(dr: Dict[int, DriverRaceResult]) -> Optional[int]:
    best_gain, who = -99, None
    for num, r in dr.items():
        if r.finish is None or r.grid is None:
            continue
        gain = r.grid - r.finish
        if gain > best_gain:
            best_gain, who = gain, num
    return who


def _classification(dr, drivers, constructors) -> list:
    rows = []
    for num, r in dr.items():
        d = drivers[num]
        c = constructors[d.constructor_id]
        classified = r.status in CLASSIFIED_STATES and r.finish is not None
        rows.append({
            "driver_id": num, "name": d.name, "short": d.short, "number": d.number,
            "constructor": c.name, "color": c.color,
            "grid": r.grid, "finish": r.finish, "status": r.status,
            "fastest_lap": r.fastest_lap, "dotd": False,
            "delta": (r.grid - r.finish) if classified and r.grid is not None else None,
        })
    rows.sort(key=lambda x: (x["finish"] is None, x["finish"] or 99))
    return rows
