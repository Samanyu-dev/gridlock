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

# A session/round is "live" for roughly this long from its start, and results
# are still liable to change (penalties, reconciliation) for a while after
# that — mirrors deadlines.LIVE_WINDOW/PROVISIONAL_WINDOW's real-world
# reasoning without importing that module's whole GameStore/provider chain
# into this low-level normalizer.
_LIVE_WINDOW = timedelta(hours=2, minutes=30)
_PROVISIONAL_WINDOW = timedelta(hours=24)

# Raw-endpoint cache freshness, scaled to how likely the data is still
# changing. A flat multi-hour TTL here would freeze an in-progress or
# just-finished session's *results* for hours; a flat few-second TTL would
# blow through OpenF1's free-tier rate limit re-fetching settled history.
_LIVE_TTL = 30.0
_PROVISIONAL_TTL = 120.0
_FINALIZED_TTL = 21600.0

# How many "jolpica-basic" historical rounds get upgraded to full OpenF1
# detail (pit stops, weather) per sync — bounded so catching up on a backlog
# of them (e.g. right after the very first cold bootstrap) can't turn a
# routine warm sync back into a many-round rebuild.
_ENRICHMENT_BUDGET = 2


def _result_ttl(session_start: Optional[datetime], now: datetime) -> float:
    """How long a session's *result-bearing* endpoints (session_result,
    starting_grid, laps, pit, weather) can be trusted before refetching.
    Unknown timing (no date_start) is treated as live — better to over-fetch
    an unscheduled/malformed session than freeze it for hours."""
    if session_start is None:
        return _LIVE_TTL
    if session_start.tzinfo is None:
        session_start = session_start.replace(tzinfo=UTC)
    if now < session_start or now - session_start <= _LIVE_WINDOW:
        return _LIVE_TTL
    if now - session_start <= _LIVE_WINDOW + _PROVISIONAL_WINDOW:
        return _PROVISIONAL_TTL
    return _FINALIZED_TTL


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
    across weekends concurrently by the caller. Each session's own result-
    endpoint TTL is scaled to that *session's* timing — a stale qualifying
    result served from cache must never hold up a race session's fresher one,
    and vice versa."""
    now = datetime.now(UTC)
    start = _parse_dt(race_sess.get("date_start"))
    if start and start > now and all(
        (_parse_dt(s.get("date_start")) or start) > now for s in weekend
    ):
        return {"results": {}, "grid": {}, "quali": {}, "has_results": False,
                "fl": None, "pits": {}, "weather": [], "sprint_results": {},
                "sprint_grid": {}, "sprint_quali": {}}

    def ttl_for(sess: Optional[dict]) -> float:
        return _result_ttl(_parse_dt(sess.get("date_start")) if sess else None, now)

    skey = race_sess.get("session_key")
    race_ttl = ttl_for(race_sess)
    results = {r.get("driver_number"): r for r in client.session_result(session_key=skey, ttl=race_ttl)}
    grid = {g.get("driver_number"): g.get("position") for g in client.starting_grid(session_key=skey, ttl=race_ttl)}
    quali_sess = next((s for s in weekend if (s.get("session_name") or "") == "Qualifying"), None)
    quali: Dict[int, int] = {}
    if quali_sess:
        for q in client.session_result(session_key=quali_sess.get("session_key"), ttl=ttl_for(quali_sess)):
            quali[q.get("driver_number")] = q.get("position")
    has_results = any(r.get("position") is not None for r in results.values())
    fl = fastest_lap_driver(client.laps(session_key=skey, ttl=race_ttl)) if has_results else None
    pits = pit_rank_map(client.pit(session_key=skey, ttl=race_ttl)) if has_results else {}
    weather = client.weather(session_key=skey, ttl=race_ttl) if has_results else []

    # Sprint weekend: the sprint race and its own grid score separately.
    sprint_sess = next((s for s in weekend if (s.get("session_name") or "") == "Sprint"), None)
    sprint_results: Dict[int, dict] = {}
    sprint_grid: Dict[int, int] = {}
    if sprint_sess:
        skey2 = sprint_sess.get("session_key")
        sprint_ttl = ttl_for(sprint_sess)
        sprint_results = {r.get("driver_number"): r for r in client.session_result(session_key=skey2, ttl=sprint_ttl)}
        sprint_grid = {g.get("driver_number"): g.get("position") for g in client.starting_grid(session_key=skey2, ttl=sprint_ttl)}

    # Sprint qualifying (aka Sprint Shootout in some seasons) sets the sprint
    # grid — its own session, distinct from both "Sprint" and "Qualifying".
    sprint_quali_sess = next(
        (s for s in weekend if "sprint" in (s.get("session_name") or "").lower()
         and "quali" in (s.get("session_name") or "").lower()), None,
    )
    sprint_quali: Dict[int, int] = {}
    if sprint_quali_sess:
        for q in client.session_result(session_key=sprint_quali_sess.get("session_key"), ttl=ttl_for(sprint_quali_sess)):
            sprint_quali[q.get("driver_number")] = q.get("position")

    return {
        "results": results, "grid": grid, "quali": quali, "has_results": has_results,
        "fl": fl, "pits": pits, "weather": weather,
        "sprint_results": sprint_results, "sprint_grid": sprint_grid, "sprint_quali": sprint_quali,
    }


def _carry_over_round(rnd: int, base: Season, drivers: Dict[int, Driver], constructors: Dict[int, Constructor]) -> None:
    """Reuse a safely-finalized round's real scoring contribution from the
    persisted snapshot instead of re-deriving it. This round wasn't
    re-fetched (see ``normalize_season``'s ``base`` param), so there is
    nothing new to score — only carry forward what was already real."""
    for num, d in drivers.items():
        bd = base.drivers.get(num)
        if bd and rnd in bd.round_points:
            d.points += bd.round_points[rnd]
            d.round_points[rnd] = bd.round_points[rnd]
            d.round_breakdown[rnd] = bd.round_breakdown.get(rnd, [])
            if rnd in bd.results:
                d.results[rnd] = bd.results[rnd]
    for cid, c in constructors.items():
        bc = base.constructors.get(cid)
        if bc and rnd in bc.round_points:
            c.points += bc.round_points[rnd]
            c.round_points[rnd] = bc.round_points[rnd]
            c.round_breakdown[rnd] = bc.round_breakdown.get(rnd, [])


def normalize_season(client, year: int, base: Optional[Season] = None, source: str = "openf1") -> Optional[Season]:
    """Build a full Season from real data for ``year``. Returns None if there
    isn't enough data to be useful (caller falls back to another provider).

    ``base`` is the previously persisted Season, if any. A round that's
    already safely finalized in ``base`` (real classification exists and it's
    well past the point results could still change) is reused verbatim
    instead of re-fetched — only rounds that are new, missing real data, or
    still within their live/provisional window get hit over the network.
    Without this, a full rebuild re-fetches every past round on every sync;
    OpenF1's free-tier rate limit serializes those calls to ~1 every 2.1s, so
    a ~24-round season can take minutes — past any serverless execution
    window. The very first (cold, ``base=None``) build still fetches
    everything, which is why the provider bootstraps a cold cache from
    Jolpica (a handful of paginated calls for the whole season, not
    per-round) rather than calling this with an OpenF1 client cold.

    ``source`` tags every freshly-fetched round's ``Race.data_source``:
    "jolpica-basic" for the cold bootstrap (Jolpica has no pit-stop data, so
    constructor pit-stop bonus points are genuinely absent from those rounds
    — never fabricated, just missing) or "openf1-full" once a round has been
    fetched with OpenF1's fuller per-session detail. A safely-finalized round
    still marked "jolpica-basic" is also eligible for re-fetch (bounded, see
    ``_ENRICHMENT_BUDGET``) when ``source="openf1"``, so those rounds
    eventually converge on full detail a few at a time instead of either
    blocking the cold bootstrap on all of them or never fixing them."""
    meetings = [
        m for m in client.meetings(year=year, ttl=300.0)
        if not m.get("is_cancelled") and "Grand Prix" in (m.get("meeting_name") or "")
    ]
    if not meetings:
        return None
    meetings.sort(key=lambda m: m.get("date_start") or "")

    all_sessions = client.sessions(year=year, ttl=300.0)
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

    now = datetime.now(UTC)
    base_by_round: Dict[int, Race] = {r.round: r for r in base.races} if base else {}

    all_weekends = []
    for rnd, meeting in enumerate(meetings, start=1):
        weekend = by_meeting.get(meeting.get("meeting_key"), [])
        race_sess = next((s for s in weekend if (s.get("session_name") or "") == "Race"), None)
        if race_sess is not None:
            all_weekends.append((rnd, meeting, weekend, race_sess))

    def must_fetch(rnd: int, race_sess: dict) -> bool:
        prior = base_by_round.get(rnd)
        if prior is None or not prior.classification:
            return True  # new round, or no real result carried over yet
        start = _parse_dt(race_sess.get("date_start")) or now
        return now <= start + _LIVE_WINDOW + _PROVISIONAL_WINDOW

    # Fetch only rounds that can plausibly have new data — sequentially this
    # is ~5-8 blocking HTTP calls per round, and OpenF1's free tier
    # serializes all of them to ~1 every 2.1s regardless of how many rounds
    # run "concurrently" here, so re-fetching all ~24 rounds every sync would
    # take minutes. Already-finalized rounds are reused from ``base`` below
    # instead. Each round's own calls stay sequential (grid depends on
    # nothing else), but rounds run in parallel with each other.
    required = [w for w in all_weekends if must_fetch(w[0], w[3])]
    required_rounds = {w[0] for w in required}

    # Historical rounds bootstrapped via Jolpica have no pit-stop data (its
    # per-round pit-stop endpoint isn't fetched during the fast bootstrap —
    # see jolpica.py), so constructor pit-stop bonus points are genuinely
    # missing from them, not just cosmetically less detailed. Rather than
    # leaving that permanently wrong, a small bounded number of them get
    # upgraded to full OpenF1 detail each sync — bounded so a database with
    # many jolpica-basic rounds (e.g. right after the first-ever cold
    # bootstrap) doesn't turn a routine warm sync back into a full rebuild.
    enrichment: List[tuple] = []
    if source == "openf1":
        candidates = [
            w for w in all_weekends
            if w[0] not in required_rounds
            and (prior := base_by_round.get(w[0])) is not None
            and prior.data_source == "jolpica-basic"
        ]
        enrichment = candidates[:_ENRICHMENT_BUDGET]

    weekends = required + enrichment
    fetch_rounds = {w[0] for w in weekends}

    fetched: Dict[int, dict] = {}
    with ThreadPoolExecutor(max_workers=min(8, len(weekends) or 1)) as pool:
        futures = {pool.submit(_fetch_weekend, client, weekend, race_sess): rnd for rnd, _, weekend, race_sess in weekends}
        for future in as_completed(futures):
            fetched[futures[future]] = future.result()

    races: List[Race] = []
    elapsed = 0
    for rnd, meeting, weekend, race_sess in all_weekends:
        if rnd not in fetch_rounds:
            prior = base_by_round[rnd]
            races.append(prior)
            if prior.status == "completed":
                elapsed += 1
            _carry_over_round(rnd, base, drivers, constructors)
            continue

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
        status = "completed" if start + _LIVE_WINDOW < now else "live" if start <= now else "upcoming"
        if status == "completed":
            elapsed += 1
        if has_results:
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
            data_source=(f"{source}-full" if source == "openf1" else f"{source}-basic") if has_results else "unknown",
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
