"""Normalize OpenF1 responses into GRIDLOCK domain objects.

Everything here is tolerant of missing fields — not every historical session
carries every attribute. The pure helpers (status, fastest lap, positions,
constructor grouping) are unit-tested with fixture payloads so the mapping is
verified without any network access; ``normalize_season`` orchestrates them
against a live client.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

from .scoring import (
    CLASSIFIED_STATES, DNF, DNS, DSQ, FINISHED,
    ConstructorRaceResult, DriverRaceResult, FantasyScoringEngine,
)
from .season import (
    COUNTRY_NAMES, Constructor, Driver, Race, RaceSession, Season,
    _finalize_metrics, _slugify,
)

UTC = timezone.utc


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


def group_constructors(driver_rows: List[dict]) -> Dict[str, dict]:
    """Group OpenF1 driver rows into constructors keyed by team name."""
    teams: Dict[str, dict] = {}
    for d in driver_rows:
        team = d.get("team_name") or "Independent"
        colour = d.get("team_colour") or "888888"
        teams.setdefault(team, {"name": team, "color": f"#{colour.lstrip('#')}", "drivers": []})
        num = d.get("driver_number")
        if num is not None and num not in teams[team]["drivers"]:
            teams[team]["drivers"].append(num)
    return teams


def pit_rank_map(pit_rows: List[dict]) -> Dict[int, int]:
    """Rank each driver's *best* pit stop by duration → {driver_number: rank}.

    Only built when reliable durations exist; drivers without a duration are
    excluded so the scoring engine awards them no pit points (never invented)."""
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


def _parse_dt(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


# --------------------------------------------------------------------------- #
# Orchestrator (live).
# --------------------------------------------------------------------------- #

def normalize_season(client, year: int) -> Optional[Season]:
    """Build a full Season from OpenF1 for ``year``. Returns None if there is not
    enough data to be useful (caller falls back to the seeded season)."""
    race_sessions = [s for s in client.sessions(year=year) if s.get("session_type") == "Race"]
    if not race_sessions:
        return None
    race_sessions.sort(key=lambda s: s.get("date_start") or "")

    engine = FantasyScoringEngine()
    constructors: Dict[int, Constructor] = {}
    drivers: Dict[int, Driver] = {}
    team_id_by_name: Dict[str, int] = {}
    driver_meta: Dict[int, dict] = {}

    # Seed identities from the first session's driver list, extend as we go.
    for sess in race_sessions:
        for d in client.drivers(session_key=sess.get("session_key")):
            num = d.get("driver_number")
            if num is not None and num not in driver_meta:
                driver_meta[num] = d
        if driver_meta:
            break

    teams = group_constructors(list(driver_meta.values()))
    for i, (name, info) in enumerate(sorted(teams.items())):
        cid = i + 1
        team_id_by_name[name] = cid
        constructors[cid] = Constructor(
            id=cid, name=name, slug=_slugify(name), short=name[:3].upper(),
            color=info["color"], pace=0.5, reliability=0.85,
        )
    for num, d in driver_meta.items():
        team = d.get("team_name") or "Independent"
        cid = team_id_by_name.get(team, 1)
        drivers[num] = Driver(
            id=num, name=d.get("full_name") or f"Driver {num}",
            short=(d.get("name_acronym") or str(num))[:3], number=num,
            country=(d.get("country_code") or "")[:2] or "XX",
            skill=70, constructor_id=cid, slug=_slugify(d.get("full_name") or f"driver-{num}"),
        )
        if num not in constructors[cid].driver_ids:
            constructors[cid].driver_ids.append(num)

    races: List[Race] = []
    completed = 0
    for rnd, sess in enumerate(race_sessions, start=1):
        skey = sess.get("session_key")
        mkey = sess.get("meeting_key")
        is_sprint = "sprint" in (sess.get("session_name") or "").lower()
        results = {r.get("driver_number"): r for r in client.session_result(session_key=skey)}
        grid = {g.get("driver_number"): g.get("position") for g in client.starting_grid(session_key=skey)}
        # Qualifying grid for this weekend (best-effort).
        quali_sessions = [q for q in client.sessions(meeting_key=mkey) if q.get("session_type") == "Qualifying"]
        quali = {}
        if quali_sessions:
            for q in client.session_result(session_key=quali_sessions[0].get("session_key")):
                quali[q.get("driver_number")] = q.get("position")
        fl = fastest_lap_driver(client.laps(session_key=skey)) if results else None
        pits = pit_rank_map(client.pit(session_key=skey))

        dr: Dict[int, DriverRaceResult] = {}
        for num in drivers:
            dr[num] = build_driver_result(
                num, results.get(num), grid.get(num), quali.get(num),
                is_fastest=(num == fl), is_sprint=is_sprint,
            )

        has_results = any(r.finish is not None for r in dr.values())
        status = "completed" if has_results else "upcoming"
        if has_results:
            completed += 1
            for num, result in dr.items():
                mate = _teammate(num, drivers, dr)
                bd = engine.score_driver(result, teammate=mate)
                d = drivers[num]
                d.points += bd.total
                d.round_points[rnd] = bd.total
                d.round_breakdown[rnd] = bd.items
                d.results[rnd] = {
                    "grid": result.grid, "finish": result.finish, "status": result.status,
                    "quali": result.quali_position, "fastest_lap": result.fastest_lap, "dotd": False,
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

        start = _parse_dt(sess.get("date_start")) or datetime.now(UTC)
        races.append(Race(
            id=rnd, round=rnd,
            name=(sess.get("circuit_short_name") or sess.get("country_name") or f"Round {rnd}") + " Grand Prix",
            slug=_slugify((sess.get("circuit_short_name") or sess.get("country_name") or f"round-{rnd}")),
            location=sess.get("location") or "", country=(sess.get("country_code") or "")[:2] or "XX",
            circuit=sess.get("circuit_short_name") or "", laps=0, length_km=0.0, is_sprint=is_sprint,
            race_start=start, deadline=start, weather="—", status=status,
            sessions=[RaceSession("RACE", "Grand Prix", start)],
            winner_id=_winner(dr), fastest_lap_id=fl,
        ))

    if completed == 0:
        return None
    _finalize_metrics(drivers, constructors)
    _ = COUNTRY_NAMES  # country display map is shared with serialization
    return Season(
        year=year, drivers=drivers, constructors=constructors, races=races,
        next_round=min(completed + 1, len(races)), engine=engine,
    )


def _teammate(num, drivers, dr):
    d = drivers[num]
    for n in drivers:
        if n != num and drivers[n].constructor_id == d.constructor_id:
            return dr.get(n)
    return None


def _winner(dr: Dict[int, DriverRaceResult]) -> Optional[int]:
    winners = [d for d in dr.values() if d.finish == 1]
    return winners[0].driver_id if winners else None
