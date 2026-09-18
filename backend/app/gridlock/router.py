"""GRIDLOCK HTTP API.

Thin transport layer: it validates input, calls the domain (store / scoring /
provider), and serializes. No fantasy rules live here.
"""
from __future__ import annotations

import statistics
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from . import deadlines, snapshots, transfers
from . import h2h as h2h_mod
from . import optimal_team as optimal_mod
from . import ownership as ownership_mod
from . import transfer_trends as trends_mod
from .auth import get_current_user, get_optional_user, require_admin
from .models import GLLeague, GLLeagueMember, GLLedgerAudit, GLProfile, GLTeam, GLTransfer, MDataSyncRun
from .provider import get_provider
from .schemas import (
    CreateLeagueRequest,
    JoinLeagueRequest,
    TeamPayload,
    ValidateTeamRequest,
)
from .scoring import describe_rules
from .season import COUNTRY_NAMES
from .store import (
    BOOSTS,
    BUDGET,
    STORE,
    TEAM_NAME_SUGGESTIONS,
    new_league_code,
    rank_with_ties,
    scoring_config,
)

router = APIRouter(prefix="/api")
UTC = timezone.utc


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).isoformat()


# --------------------------------------------------------------------------- #
# Serialization helpers.
# --------------------------------------------------------------------------- #


def _transfer_trend_for(tmap: Optional[dict], bucket: str, asset_id: int) -> dict:
    trend = tmap["trends"][bucket].get(asset_id, {"in": 0, "out": 0, "net": 0}) if tmap else {"in": 0, "out": 0, "net": 0}
    ownership_delta = tmap["ownership_delta"][bucket].get(asset_id, 0.0) if tmap else 0.0
    return {**trend, "ownership_delta": ownership_delta}


def _driver_brief(d, omap: Optional[dict] = None, tmap: Optional[dict] = None) -> dict:
    s = STORE.season
    c = s.constructors[d.constructor_id]
    last5 = [d.round_points.get(r, 0) for r in range(max(1, s.next_round - 5), s.next_round)]
    real = omap["drivers"].get(d.id) if omap else None
    return {
        "id": d.id, "name": d.name, "short": d.short, "number": d.number,
        "slug": d.slug, "country": d.country, "country_name": COUNTRY_NAMES.get(d.country, d.country),
        "image_url": d.image_url,
        "constructor": {
            "id": c.id, "name": c.name, "short": c.short, "color": c.color,
            "accessible_color": c.accessible_color, "slug": c.slug,
        },
        "price": d.price, "price_prev": d.price_prev, "price_delta": round(d.price - d.price_prev, 1),
        "transfer_trend": _transfer_trend_for(tmap, "drivers", d.id),
        "points": d.points, "form": d.form,
        "ownership": real["owned_pct"] if real else 0.0,
        "captain_pct": real["captain_pct"] if real else 0.0,
        "underdog_pct": real["underdog_pct"] if real else 0.0,
        "status": d.status,
        "value": round(d.points / d.price, 1) if d.price else 0, "last5": last5,
    }


def _driver_stats(d) -> dict:
    s = STORE.season
    finishes = [r["finish"] for r in d.results.values() if r["finish"]]
    qualis = [r["quali"] for r in d.results.values() if r["quali"]]
    podiums = sum(1 for f in finishes if f <= 3)
    wins = sum(1 for f in finishes if f == 1)
    dnfs = sum(1 for r in d.results.values() if r["status"] == "dnf")
    fls = sum(1 for r in d.results.values() if r["fastest_lap"])
    gained = sum(max(0, r["grid"] - r["finish"]) for r in d.results.values() if r["finish"] and r["grid"])
    races = len(d.results)

    def avg(xs: List[float]) -> Optional[float]:
        return round(sum(xs) / len(xs), 1) if xs else None

    completed = list(range(1, s.next_round))
    season_pts = [d.round_points.get(r, 0) for r in completed]
    quali_pts = [sum(i["points"] for i in d.round_breakdown.get(r, []) if i.get("phase") == "quali") for r in completed]
    race_pts = [sum(i["points"] for i in d.round_breakdown.get(r, []) if i.get("phase") in ("race", "sprint")) for r in completed]

    return {
        "avg_quali": round(sum(qualis) / len(qualis), 1) if qualis else None,
        "avg_finish": round(sum(finishes) / len(finishes), 1) if finishes else None,
        "podiums": podiums, "wins": wins, "dnfs": dnfs, "fastest_laps": fls,
        "positions_gained": gained, "races": races,
        "last3_avg_pts": avg(season_pts[-3:]), "last5_avg_pts": avg(season_pts[-5:]),
        "season_avg_pts": avg(season_pts), "quali_avg_pts": avg(quali_pts), "race_avg_pts": avg(race_pts),
        "consistency": round(statistics.pstdev(season_pts), 1) if len(season_pts) > 1 else 0.0,
        "dnf_rate": round(dnfs / races * 100, 1) if races else 0.0,
    }


def _driver_full(d, omap: Optional[dict] = None, tmap: Optional[dict] = None) -> dict:
    s = STORE.season
    brief = _driver_brief(d, omap, tmap)
    history = []
    for rnd in range(1, s.next_round):
        r = d.results.get(rnd)
        if not r:
            continue
        race = next((x for x in s.races if x.round == rnd), None)
        history.append({
            "round": rnd, "race": race.name if race else "", "location": race.location if race else "",
            "country": race.country if race else "", "grid": r["grid"], "finish": r["finish"],
            "status": r["status"], "quali": r["quali"], "points": d.round_points.get(rnd, 0),
            "fastest_lap": r["fastest_lap"], "dotd": r["dotd"],
        })
    teammate = next((x for x in s.drivers.values() if x.constructor_id == d.constructor_id and x.id != d.id), None)
    last_round = s.next_round - 1
    return {
        **brief,
        "stats": _driver_stats(d),
        "history": history,
        "price_history": d.price_history,
        "last_breakdown": d.round_breakdown.get(last_round, []),
        "teammate": _driver_brief(teammate, omap, tmap) if teammate else None,
    }


def _constructor_brief(c, omap: Optional[dict] = None, tmap: Optional[dict] = None) -> dict:
    s = STORE.season
    last5 = [c.round_points.get(r, 0) for r in range(max(1, s.next_round - 5), s.next_round)]
    real = omap["constructors"].get(c.id) if omap else None
    return {
        "id": c.id, "name": c.name, "short": c.short, "slug": c.slug, "color": c.color,
        "accessible_color": c.accessible_color, "logo_url": c.logo_url, "car_url": c.car_url,
        "price": c.price, "price_prev": c.price_prev, "price_delta": round(c.price - c.price_prev, 1),
        "points": c.points, "form": c.form, "ownership": real["owned_pct"] if real else 0.0,
        "reliability": round(c.reliability * 100), "last5": last5,
        "transfer_trend": _transfer_trend_for(tmap, "constructors", c.id),
        "value": round(c.points / c.price, 1) if c.price else 0,
        "drivers": [
            {
                "id": d, "name": s.drivers[d].name, "short": s.drivers[d].short,
                "number": s.drivers[d].number, "image_url": s.drivers[d].image_url,
            }
            for d in c.driver_ids
        ],
    }


def _constructor_stats(c) -> dict:
    """Same form-stat treatment as drivers, but quali/race split and DNF
    impact are aggregated across both cars — a constructor has no ledger
    phase split of its own, only its drivers' contributions."""
    s = STORE.season

    def avg(xs: List[float]) -> Optional[float]:
        return round(sum(xs) / len(xs), 1) if xs else None

    completed = list(range(1, s.next_round))
    season_pts = [c.round_points.get(r, 0) for r in completed]
    car_drivers = [s.drivers[did] for did in c.driver_ids if did in s.drivers]
    quali_pts = [
        sum(sum(i["points"] for i in dr.round_breakdown.get(r, []) if i.get("phase") == "quali") for dr in car_drivers)
        for r in completed
    ]
    race_pts = [
        sum(sum(i["points"] for i in dr.round_breakdown.get(r, []) if i.get("phase") in ("race", "sprint")) for dr in car_drivers)
        for r in completed
    ]
    dnf_count = sum(1 for dr in car_drivers for r in dr.results.values() if r["status"] == "dnf")
    starts = sum(len(dr.results) for dr in car_drivers)

    return {
        "last3_avg_pts": avg(season_pts[-3:]), "last5_avg_pts": avg(season_pts[-5:]),
        "season_avg_pts": avg(season_pts), "quali_avg_pts": avg(quali_pts), "race_avg_pts": avg(race_pts),
        "consistency": round(statistics.pstdev(season_pts), 1) if len(season_pts) > 1 else 0.0,
        "dnf_count": dnf_count, "dnf_rate": round(dnf_count / starts * 100, 1) if starts else 0.0,
    }


# --------------------------------------------------------------------------- #
# Real leaderboard — built from registered users' actual saved teams. No demo
# managers, no padded fields: an empty group of friends means an empty board.
# --------------------------------------------------------------------------- #


def _real_leaderboard_rows(session: Session) -> List[dict]:
    """Real rank movement, computed (not faked): compare each team's rank on
    their current cumulative total against their rank before the last
    completed round's points — same roster, same data, just one round back."""
    s = STORE.season
    last_round = s.next_round - 1
    rows = []
    for t in session.exec(select(GLTeam)).all():
        if not (t.driver_ids and t.constructor_ids):
            continue
        prof = session.get(GLProfile, t.profile_id)
        if not prof:
            continue
        score = STORE.score_team(t.driver_ids, t.constructor_ids, t.captain_id)
        prev_total = score["total"] - score["per_round"].get(last_round, 0)
        rows.append({
            "team_name": prof.team_name, "manager": f"@{prof.username}",
            "country": prof.country, "total": score["total"],
            "last_race": score["last_race_points"], "prev_total": prev_total,
            "profile_id": prof.id,
        })
    rows.sort(key=lambda r: r["total"], reverse=True)
    rank_with_ties(rows, "total")
    prev_order = sorted(rows, key=lambda r: r["prev_total"], reverse=True)
    prev_rank = {id(r): i + 1 for i, r in enumerate(prev_order)}
    for r in rows:
        r["movement"] = prev_rank[id(r)] - r["rank"]
        del r["prev_total"]
    return rows


def _rank_and_field(rows: List[dict], total: float) -> Tuple[int, int]:
    """(rank, field_size) for a points total against real rows that already
    include this team (the row is saved before this is ever called)."""
    rank = 1 + sum(1 for r in rows if r["total"] > total)
    return rank, max(len(rows), rank)


def _race_brief(r) -> dict:
    s = STORE.season
    winner = s.drivers.get(r.winner_id) if r.winner_id else None
    return {
        "round": r.round, "name": r.name, "slug": r.slug, "location": r.location,
        "country": r.country, "country_name": COUNTRY_NAMES.get(r.country, r.country),
        "circuit": r.circuit, "laps": r.laps, "length_km": r.length_km,
        "is_sprint": r.is_sprint, "race_start": _iso(r.race_start), "deadline": _iso(r.deadline),
        "weather": r.weather, "status": r.status, "circuit_image_url": r.circuit_image_url,
        "round_state": deadlines.round_state(r),
        "winner": {"name": winner.name, "short": winner.short} if winner else None,
    }


def _race_full(r) -> dict:
    s = STORE.season
    fl = s.drivers.get(r.fastest_lap_id) if r.fastest_lap_id else None
    dotd = s.drivers.get(r.dotd_id) if r.dotd_id else None
    return {
        **_race_brief(r),
        "sessions": [{"kind": x.kind, "label": x.label, "start": _iso(x.start)} for x in r.sessions],
        "classification": r.classification,
        "quali": r.quali,
        "fastest_lap": {"name": fl.name, "short": fl.short} if fl else None,
        "dotd": {"name": dotd.name, "short": dotd.short} if dotd else None,
    }


# --------------------------------------------------------------------------- #
# Meta / config.
# --------------------------------------------------------------------------- #


@router.get("/meta")
def meta():
    s = STORE.season
    nr = s.next_race
    round_id = deadlines.active_round()
    provider = get_provider()
    ph = provider.health()
    return {
        "season": s.year,
        "product": "GRIDLOCK",
        "provider": provider.name,
        "next_round": s.next_round,
        "total_rounds": len(s.races),
        "next_race": _race_brief(nr) if nr else None,
        "config": scoring_config(),
        "team_name_suggestions": TEAM_NAME_SUGGESTIONS,
        "round_id": round_id,
        "locked": deadlines.is_locked(round_id),
        "deadline": _iso(deadlines.deadline_for_round(round_id)) if deadlines.deadline_for_round(round_id) else None,
        "last_synced_at": ph.get("last_synced_at"),
    }


@router.get("/rules")
def rules():
    cfg = scoring_config()
    return {"config": cfg, "rules": describe_rules(), "boosts": BOOSTS}


# --------------------------------------------------------------------------- #
# Admin — data feed health / manual resync.
# --------------------------------------------------------------------------- #


@router.get("/admin/data-health")
def data_health(_: object = Depends(require_admin)):
    """Provider status, sync recency, and per-round data completeness — the
    control room for "is the real feed actually working right now"."""
    s = STORE.season
    provider = get_provider()
    rounds = [{
        "round": r.round, "name": r.name, "status": r.status,
        "round_state": deadlines.round_state(r),
        "has_winner": bool(r.winner_id), "race_start": _iso(r.race_start),
    } for r in s.races]
    return {**provider.health(), "rounds": rounds}


@router.post("/admin/resync")
def resync(_: object = Depends(require_admin)):
    """Force an immediate, full, deterministic rebuild from the live feed."""
    STORE.resync()
    return get_provider().health()


@router.get("/admin/ledger-audit")
def ledger_audit(
    limit: int = Query(default=100, le=500),
    _: object = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Every correction the scoring pipeline has ever detected, grouped by
    the sync run that found it — "why did my score change from X to Y"."""
    s = STORE.season
    rows = session.exec(
        select(GLLedgerAudit).order_by(GLLedgerAudit.detected_at.desc()).limit(limit)
    ).all()
    run_ids = {r.run_id for r in rows if r.run_id is not None}
    runs = {r.id: r for r in session.exec(select(MDataSyncRun).where(MDataSyncRun.id.in_(run_ids))).all()} if run_ids else {}

    def _entity_name(kind: str, eid: int) -> str:
        pool = s.drivers if kind == "driver" else s.constructors
        a = pool.get(eid)
        return a.name if a else f"{kind} #{eid}"

    entries = []
    for r in rows:
        run = runs.get(r.run_id)
        entries.append({
            "id": r.id, "round": r.round_id, "entity_type": r.entity_type, "entity_id": r.entity_id,
            "entity_name": _entity_name(r.entity_type, r.entity_id),
            "previous_points": r.previous_points, "new_points": r.new_points, "delta": r.delta,
            "reason": r.reason, "detected_at": _iso(r.detected_at),
            "run_id": r.run_id, "run_started_at": _iso(run.started_at) if run else None,
        })
    # Group by run for the admin page's "corrections by sync" view.
    by_run: dict = {}
    for e in entries:
        by_run.setdefault(e["run_id"], []).append(e)
    groups = [{"run_id": rid, "run_started_at": items[0]["run_started_at"], "corrections": items} for rid, items in by_run.items()]
    return {"total": len(entries), "groups": groups}


@router.get("/insights")
def insights():
    return {"insights": STORE.insights()}


# --------------------------------------------------------------------------- #
# Drivers / constructors.
# --------------------------------------------------------------------------- #


@router.get("/drivers")
def drivers(
    search: Optional[str] = None,
    constructor: Optional[int] = None,
    sort: str = "points",
    order: str = "desc",
    session: Session = Depends(get_session),
):
    s = STORE.season
    omap = ownership_mod.compute_ownership(session)
    tmap = _transfer_map(session)
    items = [_driver_brief(d, omap, tmap) for d in s.drivers.values()]
    if search:
        q = search.lower()
        items = [d for d in items if q in d["name"].lower() or q in d["short"].lower()]
    if constructor:
        items = [d for d in items if d["constructor"]["id"] == constructor]
    keymap = {
        "points": lambda d: d["points"], "price": lambda d: d["price"],
        "form": lambda d: d["form"], "ownership": lambda d: d["ownership"],
        "value": lambda d: d["value"], "name": lambda d: d["name"],
    }
    keyfn = keymap.get(sort, keymap["points"])
    items.sort(key=keyfn, reverse=(order == "desc"))
    return {"drivers": items}


@router.get("/drivers/{slug}")
def driver_detail(slug: str, session: Session = Depends(get_session)):
    s = STORE.season
    d = next((x for x in s.drivers.values() if x.slug == slug), None)
    if not d:
        raise HTTPException(404, "Driver not found")
    return _driver_full(d, ownership_mod.compute_ownership(session), _transfer_map(session))


@router.get("/constructors")
def constructors(sort: str = "points", order: str = "desc", session: Session = Depends(get_session)):
    s = STORE.season
    omap = ownership_mod.compute_ownership(session)
    tmap = _transfer_map(session)
    items = [_constructor_brief(c, omap, tmap) for c in s.constructors.values()]
    keymap = {
        "points": lambda c: c["points"], "price": lambda c: c["price"],
        "form": lambda c: c["form"], "ownership": lambda c: c["ownership"],
        "value": lambda c: c["value"],
    }
    items.sort(key=keymap.get(sort, keymap["points"]), reverse=(order == "desc"))
    return {"constructors": items}


@router.get("/constructors/{slug}")
def constructor_detail(slug: str, session: Session = Depends(get_session)):
    s = STORE.season
    c = next((x for x in s.constructors.values() if x.slug == slug), None)
    if not c:
        raise HTTPException(404, "Constructor not found")
    omap = ownership_mod.compute_ownership(session)
    tmap = _transfer_map(session)
    brief = _constructor_brief(c, omap, tmap)
    history = [
        {"round": rnd, "points": c.round_points.get(rnd, 0)}
        for rnd in range(1, s.next_round)
    ]
    drivers_full = [_driver_brief(s.drivers[d], omap, tmap) for d in c.driver_ids]
    return {
        **brief, "history": history, "price_history": c.price_history, "drivers_full": drivers_full,
        "stats": _constructor_stats(c),
    }


@router.get("/ownership")
def ownership_endpoint(
    league: Optional[str] = None,
    profile: Optional[GLProfile] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """Global or per-league ownership — driver/constructor/captain/Underdog %,
    pinned to the latest locked round so nobody's unlocked future picks leak."""
    profile_ids = None
    league_row = None
    if league:
        league_row = session.exec(select(GLLeague).where(GLLeague.code == league)).first()
        if not league_row:
            raise HTTPException(404, "League not found")
        member_ids = [
            m.profile_id for m in
            session.exec(select(GLLeagueMember).where(GLLeagueMember.league_id == league_row.id))
        ]
        if not profile or profile.id not in member_ids:
            raise HTTPException(403, "You must be a member of this league to see its ownership breakdown.")
        profile_ids = member_ids
    data = ownership_mod.compute_ownership(session, profile_ids=profile_ids)
    s = STORE.season
    drivers_out = [
        {"id": d.id, "name": d.name, "short": d.short, "color": s.constructors[d.constructor_id].color, **stats}
        for d in s.drivers.values() if (stats := data["drivers"].get(d.id))
    ]
    constructors_out = [
        {"id": c.id, "name": c.name, "short": c.short, "color": c.color, **stats}
        for c in s.constructors.values() if (stats := data["constructors"].get(c.id))
    ]
    drivers_out.sort(key=lambda d: d["owned_pct"], reverse=True)
    constructors_out.sort(key=lambda c: c["owned_pct"], reverse=True)
    return {
        "round": data["round"], "total_teams": data["total_teams"],
        "league": league_row.name if league_row else None,
        "drivers": drivers_out, "constructors": constructors_out,
    }


def _transfer_map(session: Session) -> dict:
    return {
        "trends": trends_mod.compute_transfer_trends(session),
        "ownership_delta": trends_mod.ownership_delta(session),
    }


@router.get("/transfers/trends")
def transfer_trends_endpoint(
    league: Optional[str] = None,
    profile: Optional[GLProfile] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """Most transferred in/out, net, and ownership change since the previous
    lock — global or scoped to a league. Same service layer driver/constructor
    pages and the transfer centre already read."""
    profile_ids = None
    league_row = None
    if league:
        league_row = session.exec(select(GLLeague).where(GLLeague.code == league)).first()
        if not league_row:
            raise HTTPException(404, "League not found")
        member_ids = [
            m.profile_id for m in
            session.exec(select(GLLeagueMember).where(GLLeagueMember.league_id == league_row.id))
        ]
        if not profile or profile.id not in member_ids:
            raise HTTPException(403, "You must be a member of this league to see its transfer trends.")
        profile_ids = member_ids

    trends = trends_mod.compute_transfer_trends(session, profile_ids=profile_ids)
    odelta = trends_mod.ownership_delta(session, profile_ids=profile_ids)
    s = STORE.season

    def _rows(bucket: str, ref_fn) -> list:
        out = []
        for aid, t in trends[bucket].items():
            ref = ref_fn(aid)
            if not ref:
                continue
            out.append({**ref, **t, "ownership_delta": odelta[bucket].get(aid, 0.0)})
        return out

    drivers_out = _rows("drivers", _driver_ref)
    constructors_out = _rows("constructors", _constructor_ref)
    drivers_out.sort(key=lambda r: r["net"], reverse=True)
    constructors_out.sort(key=lambda r: r["net"], reverse=True)
    return {
        "round": odelta["round"], "league": league_row.name if league_row else None,
        "drivers": drivers_out, "constructors": constructors_out,
    }


def _driver_ref(did: Optional[int]) -> Optional[dict]:
    s = STORE.season
    d = s.drivers.get(did) if did is not None else None
    if not d:
        return None
    return {"id": d.id, "name": d.name, "short": d.short, "color": s.constructors[d.constructor_id].color}


def _constructor_ref(cid: Optional[int]) -> Optional[dict]:
    s = STORE.season
    c = s.constructors.get(cid) if cid is not None else None
    if not c:
        return None
    return {"id": c.id, "name": c.name, "short": c.short, "color": c.color}


def _find_rival(session: Session, username: str, exclude_profile_id: int) -> GLProfile:
    other = session.exec(select(GLProfile).where(GLProfile.username == username.lstrip("@"))).first()
    if not other:
        raise HTTPException(404, "Manager not found")
    if other.id == exclude_profile_id:
        raise HTTPException(400, "Pick a rival, not yourself")
    return other


@router.get("/h2h/{username}")
def h2h_endpoint(
    username: str,
    profile: GLProfile = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    other = _find_rival(session, username, profile.id)
    data = h2h_mod.compare_season(session, profile.id, other.id)
    if not data:
        raise HTTPException(404, "One of you doesn't have a team yet")

    def _side(side: dict, who: GLProfile) -> dict:
        return {
            "profile_id": side["profile_id"], "username": who.username, "team_name": who.team_name,
            "total": side["total"], "last_race_points": side["last_race_points"],
            "captain": _driver_ref(side["captain_id"]),
            "drivers": [_driver_ref(d) for d in side["driver_ids"]],
            "constructors": [_constructor_ref(c) for c in side["constructor_ids"]],
            "differentials": [_driver_ref(d) for d in side["differentials"]],
        }

    return {
        "a": _side(data["a"], profile), "b": _side(data["b"], other),
        "shared_drivers": [_driver_ref(d) for d in data["shared_drivers"]],
        "shared_constructors": [_constructor_ref(c) for c in data["shared_constructors"]],
        "gap": data["gap"], "rounds_record": data["rounds_record"],
    }


@router.get("/live/battle")
def live_battle_endpoint(
    rival: str,
    profile: GLProfile = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    other = _find_rival(session, rival, profile.id)
    round_id = deadlines.active_round()
    data = h2h_mod.live_battle(session, profile.id, other.id, round_id)
    if not data:
        raise HTTPException(404, "Battle not ready yet — it unlocks once this round's picks are locked in, or once both of you have a team.")
    data["rival_username"] = other.username
    data["rival_team_name"] = other.team_name
    return data


@router.get("/optimal-team/{round_id}")
def optimal_team_endpoint(
    round_id: int,
    profile: GLProfile = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Mathematically optimal $300M squad for a FINAL round vs the user's
    actual result. Unavailable until the round is FINAL — there's nothing
    honest to compare against while results are still provisional."""
    data = optimal_mod.compare_to_actual(session, profile.id, round_id)
    if not data:
        raise HTTPException(404, "Not available — this round isn't FINAL yet, or doesn't exist.")
    return data


@router.get("/market")
def market():
    """Price movers this round — biggest risers and fallers (drivers)."""
    s = STORE.season
    rows = []
    for d in s.drivers.values():
        rows.append({
            "id": d.id, "name": d.name, "short": d.short, "slug": d.slug,
            "color": s.constructors[d.constructor_id].color,
            "price": d.price, "delta": round(d.price - d.price_prev, 1),
            "ownership": d.ownership,
        })
    risers = sorted([r for r in rows if r["delta"] > 0], key=lambda r: r["delta"], reverse=True)[:5]
    fallers = sorted([r for r in rows if r["delta"] < 0], key=lambda r: r["delta"])[:5]
    return {"risers": risers, "fallers": fallers}


# --------------------------------------------------------------------------- #
# Races / live.
# --------------------------------------------------------------------------- #


@router.get("/races")
def races():
    s = STORE.season
    return {"races": [_race_brief(r) for r in s.races]}


@router.get("/races/{slug}")
def race_detail(slug: str):
    s = STORE.season
    r = next((x for x in s.races if x.slug == slug), None)
    if not r:
        raise HTTPException(404, "Race not found")
    return _race_full(r)


@router.get("/live")
def live():
    return STORE.live_snapshot()


# --------------------------------------------------------------------------- #
# Auth / profile / team.
# --------------------------------------------------------------------------- #


def _profile_by_username(session: Session, username: str) -> Optional[GLProfile]:
    return session.exec(select(GLProfile).where(GLProfile.username == username)).first()


def _serialize_profile(p: GLProfile) -> dict:
    return {
        "id": p.id, "username": p.username, "email": p.email,
        "email_verified": p.email_verified, "is_admin": p.is_admin,
        "display_name": p.display_name or p.username,
        "team_name": p.team_name, "persona": p.persona, "country": p.country,
        "favorite_driver_id": p.favorite_driver_id,
        "favorite_constructor_id": p.favorite_constructor_id,
        "public_profile": p.public_profile,
    }


def _serialize_team(t: Optional[GLTeam]) -> Optional[dict]:
    if not t:
        return None
    return {
        "driver_ids": t.driver_ids, "constructor_ids": t.constructor_ids,
        "captain_id": t.captain_id, "active_boost": t.active_boost,
        "boost_driver_id": t.boost_driver_id, "boost_constructor_id": t.boost_constructor_id,
        "free_transfers": t.free_transfers, "team_value": t.team_value, "bank": t.bank,
    }


@router.get("/me")
def me(profile: GLProfile = Depends(get_current_user), session: Session = Depends(get_session)):
    team = session.exec(select(GLTeam).where(GLTeam.profile_id == profile.id)).first()
    result = {"profile": _serialize_profile(profile), "team": _serialize_team(team)}
    if team and team.driver_ids and team.constructor_ids:
        score = STORE.score_team(team.driver_ids, team.constructor_ids, team.captain_id)
        rows = _real_leaderboard_rows(session)
        rank, field_size = _rank_and_field(rows, score["total"])
        result["score"] = score
        result["rank"] = rank
        result["field_size"] = field_size
        result["percentile"] = round(100 * rank / field_size, 1)
        result["gap_to_leader"] = max(0, rows[0]["total"] - score["total"]) if rows else 0
        # Live/provisional/final ledger for the most recently completed round.
        last_round = STORE.season.next_round - 1
        result["weekend"] = snapshots.score_team_for_round(
            team.driver_ids, team.constructor_ids, team.captain_id,
            team.active_boost, team.boost_driver_id, team.boost_constructor_id, last_round,
        )
    return result


@router.post("/team/validate")
def validate_team(body: ValidateTeamRequest):
    ok, errors = STORE.validate_team(body.driver_ids, body.constructor_ids, body.captain_id)
    cost = STORE.team_cost(body.driver_ids, body.constructor_ids)
    projected = None
    if ok:
        projected = STORE.score_team(body.driver_ids, body.constructor_ids, body.captain_id)
    return {"valid": ok, "errors": errors, "cost": cost, "remaining": round(BUDGET - cost, 1), "projected": projected}


@router.put("/team")
def save_team(
    body: TeamPayload,
    profile: GLProfile = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Deadline + validation + transfer accounting, transactional.
    outcome = transfers.save_team(
        session, profile.id, body.driver_ids, body.constructor_ids,
        body.captain_id, body.active_boost, body.boost_driver_id, body.boost_constructor_id,
    )
    # Snapshot the team for the active round (provisional until results finalize).
    snapshots.build_snapshot(session, profile.id, deadlines.active_round(), state="provisional")
    team = session.exec(select(GLTeam).where(GLTeam.profile_id == profile.id)).first()
    score = STORE.score_team(team.driver_ids, team.constructor_ids, team.captain_id)
    rank, field_size = _rank_and_field(_real_leaderboard_rows(session), score["total"])
    return {
        "team": _serialize_team(team), "score": score, "rank": rank, "field_size": field_size,
        "transfers": outcome.as_dict(),
    }


@router.get("/team/score")
def team_score(
    round_id: Optional[int] = None,
    profile: GLProfile = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Auditable weekend score for the authenticated user, from the ledger.

    Historical rounds are read from the immutable snapshot; the current round is
    scored from the live team. Response carries LIVE/PROVISIONAL/FINAL state."""
    rid = round_id if round_id is not None else STORE.season.next_round - 1
    snap = session.exec(
        select(snapshots.GLTeamSnapshot).where(
            snapshots.GLTeamSnapshot.profile_id == profile.id,
            snapshots.GLTeamSnapshot.round_id == rid,
        )
    ).first()
    if snap:
        scored = snapshots.score_team_for_round(
            snap.driver_ids, snap.constructor_ids, snap.captain_id,
            snap.active_boost, snap.boost_driver_id, snap.boost_constructor_id, rid,
        )
        scored["from_snapshot"] = True
        scored["correction_notice"] = _correction_notice(session, rid, snap.driver_ids, snap.constructor_ids)
        return scored
    team = session.exec(select(GLTeam).where(GLTeam.profile_id == profile.id)).first()
    if not team or not team.driver_ids:
        raise HTTPException(404, "No team to score")
    scored = snapshots.score_team_for_round(
        team.driver_ids, team.constructor_ids, team.captain_id,
        team.active_boost, team.boost_driver_id, team.boost_constructor_id, rid,
    )
    scored["from_snapshot"] = False
    scored["correction_notice"] = _correction_notice(session, rid, team.driver_ids, team.constructor_ids)
    return scored


def _correction_notice(session: Session, round_id: int, driver_ids: List[int], constructor_ids: List[int]) -> Optional[str]:
    """"Points adjusted after official result update" — only when a real,
    persisted correction touched one of this team's assets for this round."""
    hit = session.exec(
        select(GLLedgerAudit).where(
            GLLedgerAudit.round_id == round_id,
            ((GLLedgerAudit.entity_type == "driver") & (GLLedgerAudit.entity_id.in_(driver_ids)))
            | ((GLLedgerAudit.entity_type == "constructor") & (GLLedgerAudit.entity_id.in_(constructor_ids))),
        ).order_by(GLLedgerAudit.detected_at.desc())
    ).first()
    if not hit:
        return None
    return "Points adjusted after an official result update."


@router.get("/team/transfers")
def transfer_history(
    profile: GLProfile = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Every transfer this manager has ever made — a real, immutable audit
    trail (GLTransfer rows), not a derived guess."""
    s = STORE.season
    rows = session.exec(
        select(GLTransfer).where(GLTransfer.profile_id == profile.id).order_by(GLTransfer.created_at.desc())
    ).all()

    def _asset_name(kind: str, asset_id: Optional[int]) -> Optional[str]:
        if asset_id is None:
            return None
        pool = s.drivers if kind == "driver" else s.constructors
        a = pool.get(asset_id)
        return a.name if a else None

    out = []
    for t in rows:
        out.append({
            "round": t.round_id, "asset_type": t.asset_type,
            "sold": _asset_name(t.asset_type, t.sold_id), "bought": _asset_name(t.asset_type, t.bought_id),
            "sale_price": t.sale_price, "purchase_price": t.purchase_price,
            "free": t.free, "penalty": t.penalty, "created_at": _iso(t.created_at),
        })
    return {"transfers": out}


# --------------------------------------------------------------------------- #
# Leaderboard.
# --------------------------------------------------------------------------- #


@router.get("/leaderboard")
def leaderboard(
    offset: int = 0,
    limit: int = Query(default=25, le=100),
    p: Optional[GLProfile] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """Real registered managers only — no demo padding. A quiet group shows a
    quiet board; it fills in as friends actually build teams."""
    rows = _real_leaderboard_rows(session)
    for r in rows:
        r["is_me"] = bool(p and r["profile_id"] == p.id)
    page = rows[offset: offset + limit]
    me_row = next((r for r in rows if r["is_me"]), None)
    return {"entries": page, "total": len(rows), "me": me_row}


@router.get("/leaderboard/round/{round_id}")
def round_leaderboard(
    round_id: int,
    offset: int = 0,
    limit: int = Query(default=25, le=100),
    p: Optional[GLProfile] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """This-round-only ranking (RACE LEADERBOARD). LIVE while the round is in
    progress, PROVISIONAL once the session ends, FINAL once results are
    reconciled — mirrors the state on the individual weekend ledger. Real
    registered managers only."""
    rows = []
    for t in session.exec(select(GLTeam)).all():
        if not (t.driver_ids and t.constructor_ids):
            continue
        prof = session.get(GLProfile, t.profile_id)
        if not prof:
            continue
        scored = snapshots.score_team_for_round(
            t.driver_ids, t.constructor_ids, t.captain_id,
            t.active_boost, t.boost_driver_id, t.boost_constructor_id, round_id,
        )
        prev = snapshots.score_team_for_round(
            t.driver_ids, t.constructor_ids, t.captain_id,
            t.active_boost, t.boost_driver_id, t.boost_constructor_id, round_id - 1,
        ) if round_id > 1 else None
        rows.append({
            "team_name": prof.team_name, "manager": f"@{prof.username}", "country": prof.country,
            "total": scored["total"], "last_race": scored["total"], "prev_total": prev["total"] if prev else 0,
            "state": scored["state"], "is_me": bool(p and prof.id == p.id),
        })
    rows.sort(key=lambda r: r["total"], reverse=True)
    rank_with_ties(rows, "total")
    prev_order = sorted(rows, key=lambda r: r["prev_total"], reverse=True)
    prev_rank = {id(r): i + 1 for i, r in enumerate(prev_order)}
    for r in rows:
        r["movement"] = prev_rank[id(r)] - r["rank"]
        del r["prev_total"]
    page = rows[offset: offset + limit]
    me_row = next((r for r in rows if r["is_me"]), None)
    return {"round": round_id, "entries": page, "me": me_row, "total": len(rows)}


# --------------------------------------------------------------------------- #
# Leagues.
# --------------------------------------------------------------------------- #


@router.get("/leagues")
def my_leagues(p: Optional[GLProfile] = Depends(get_optional_user), session: Session = Depends(get_session)):
    """Leagues are invite-only (create or join with a code) — there is no
    public/browsable list, this is a private group of friends."""
    mine = []
    if p:
        memberships = session.exec(
            select(GLLeague).join(GLLeagueMember, GLLeagueMember.league_id == GLLeague.id)
            .where(GLLeagueMember.profile_id == p.id)
        ).all()
        for lg in memberships:
            count = len(session.exec(select(GLLeagueMember).where(GLLeagueMember.league_id == lg.id)).all())
            mine.append({
                "code": lg.code, "name": lg.name, "description": lg.description,
                "type": lg.type, "member_count": count,
            })
    return {"mine": mine}


@router.post("/leagues")
def create_league(
    body: CreateLeagueRequest,
    p: GLProfile = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Ensure unique code.
    for _ in range(6):
        code = new_league_code()
        if not session.exec(select(GLLeague).where(GLLeague.code == code)).first():
            break
    else:
        raise HTTPException(500, "Could not allocate league code")
    lg = GLLeague(
        code=code, name=body.name, description=body.description,
        privacy=body.privacy, type=body.type, start_round=body.start_round,
        max_members=body.max_members, creator_profile_id=p.id,
    )
    session.add(lg)
    session.commit()
    session.refresh(lg)
    session.add(GLLeagueMember(league_id=lg.id, profile_id=p.id))
    session.commit()
    return {"code": lg.code, "name": lg.name}


@router.post("/leagues/join")
def join_league(
    body: JoinLeagueRequest,
    p: GLProfile = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    code = body.code.strip().upper()
    if not code.startswith("GRID-"):
        code = "GRID-" + code
    lg = session.exec(select(GLLeague).where(GLLeague.code == code)).first()
    if not lg:
        raise HTTPException(404, "No league with that code")
    if lg:
        existing = session.exec(
            select(GLLeagueMember).where(
                GLLeagueMember.league_id == lg.id, GLLeagueMember.profile_id == p.id
            )
        ).first()
        if not existing:
            session.add(GLLeagueMember(league_id=lg.id, profile_id=p.id))
            session.commit()
    return {"code": code, "joined": True}


@router.get("/leagues/{code}")
def league_detail(code: str, p: Optional[GLProfile] = Depends(get_optional_user), session: Session = Depends(get_session)):
    code = code.strip().upper()
    if not code.startswith("GRID-"):
        code = "GRID-" + code

    username = p.username if p else None
    lg = session.exec(select(GLLeague).where(GLLeague.code == code)).first()
    if not lg:
        raise HTTPException(404, "League not found")
    member_rows = session.exec(select(GLLeagueMember).where(GLLeagueMember.league_id == lg.id)).all()
    last_round = STORE.season.next_round - 1
    members = []
    for mr in member_rows:
        prof = session.get(GLProfile, mr.profile_id)
        if not prof:
            continue
        team = session.exec(select(GLTeam).where(GLTeam.profile_id == prof.id)).first()
        total = 0
        last = 0
        prev_total = 0
        if team and team.driver_ids and team.constructor_ids:
            sc = STORE.score_team(team.driver_ids, team.constructor_ids, team.captain_id)
            total, last = sc["total"], sc["last_race_points"]
            prev_total = total - sc["per_round"].get(last_round, 0)
        members.append({
            "team_name": prof.team_name, "manager": f"@{prof.username}",
            "country": prof.country, "total": total, "last_race": last, "prev_total": prev_total,
            "is_me": bool(username and prof.username == username),
        })
    members.sort(key=lambda m: m["total"], reverse=True)
    rank_with_ties(members, "total")
    for m in members:
        m["league_rank"] = m.pop("rank")
    prev_order = sorted(members, key=lambda m: m["prev_total"], reverse=True)
    prev_rank = {id(m): i + 1 for i, m in enumerate(prev_order)}
    leader_total = members[0]["total"] if members else 0
    for m in members:
        m["movement"] = prev_rank[id(m)] - m["league_rank"]
        m["gap_to_leader"] = leader_total - m["total"]
        del m["prev_total"]
    return {
        "code": lg.code, "name": lg.name, "description": lg.description,
        "privacy": lg.privacy, "type": lg.type,
        "creator": next((m["team_name"] for m in members), "—"),
        "member_count": len(members), "members": members,
    }


# --------------------------------------------------------------------------- #
# Global command search.
# --------------------------------------------------------------------------- #


@router.get("/search")
def search(q: str):
    s = STORE.season
    ql = q.lower().strip()
    results = []
    if ql:
        for d in s.drivers.values():
            if ql in d.name.lower() or ql in d.short.lower():
                results.append({"type": "driver", "label": d.name, "slug": d.slug, "meta": s.constructors[d.constructor_id].name})
        for c in s.constructors.values():
            if ql in c.name.lower():
                results.append({"type": "constructor", "label": c.name, "slug": c.slug, "meta": "Constructor"})
        for r in s.races:
            if ql in r.name.lower() or ql in r.location.lower():
                results.append({"type": "race", "label": r.name, "slug": r.slug, "meta": f"Round {r.round}"})
    return {"results": results[:12]}
