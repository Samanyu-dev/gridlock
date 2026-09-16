"""GRIDLOCK HTTP API.

Thin transport layer: it validates input, calls the domain (store / scoring /
provider), and serializes. No fantasy rules live here.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..database import get_session
from . import deadlines, snapshots, transfers
from .auth import get_current_user, get_optional_user
from .models import GLLeague, GLLeagueMember, GLProfile, GLTeam
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
    STORE,
    TEAM_NAME_SUGGESTIONS,
    new_league_code,
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


def _driver_brief(d) -> dict:
    s = STORE.season
    c = s.constructors[d.constructor_id]
    last5 = [d.round_points.get(r, 0) for r in range(max(1, s.next_round - 5), s.next_round)]
    return {
        "id": d.id, "name": d.name, "short": d.short, "number": d.number,
        "slug": d.slug, "country": d.country, "country_name": COUNTRY_NAMES.get(d.country, d.country),
        "constructor": {"id": c.id, "name": c.name, "short": c.short, "color": c.color, "slug": c.slug},
        "price": d.price, "price_prev": d.price_prev, "price_delta": round(d.price - d.price_prev, 1),
        "points": d.points, "form": d.form, "ownership": d.ownership, "status": d.status,
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
    gained = sum(max(0, r["grid"] - r["finish"]) for r in d.results.values() if r["finish"])
    return {
        "avg_quali": round(sum(qualis) / len(qualis), 1) if qualis else None,
        "avg_finish": round(sum(finishes) / len(finishes), 1) if finishes else None,
        "podiums": podiums, "wins": wins, "dnfs": dnfs, "fastest_laps": fls,
        "positions_gained": gained, "races": len(d.results),
    }


def _driver_full(d) -> dict:
    s = STORE.season
    brief = _driver_brief(d)
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
        "teammate": _driver_brief(teammate) if teammate else None,
    }


def _constructor_brief(c) -> dict:
    s = STORE.season
    last5 = [c.round_points.get(r, 0) for r in range(max(1, s.next_round - 5), s.next_round)]
    return {
        "id": c.id, "name": c.name, "short": c.short, "slug": c.slug, "color": c.color,
        "price": c.price, "price_prev": c.price_prev, "price_delta": round(c.price - c.price_prev, 1),
        "points": c.points, "form": c.form, "ownership": c.ownership,
        "reliability": round(c.reliability * 100), "last5": last5,
        "value": round(c.points / c.price, 1) if c.price else 0,
        "drivers": [
            {"id": d, "name": s.drivers[d].name, "short": s.drivers[d].short, "number": s.drivers[d].number}
            for d in c.driver_ids
        ],
    }


def _race_brief(r) -> dict:
    s = STORE.season
    winner = s.drivers.get(r.winner_id) if r.winner_id else None
    return {
        "round": r.round, "name": r.name, "slug": r.slug, "location": r.location,
        "country": r.country, "country_name": COUNTRY_NAMES.get(r.country, r.country),
        "circuit": r.circuit, "laps": r.laps, "length_km": r.length_km,
        "is_sprint": r.is_sprint, "race_start": _iso(r.race_start), "deadline": _iso(r.deadline),
        "weather": r.weather, "status": r.status,
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
    return {
        "season": s.year,
        "product": "GRIDLOCK",
        "provider": get_provider().name,
        "next_round": s.next_round,
        "total_rounds": len(s.races),
        "next_race": _race_brief(nr) if nr else None,
        "config": scoring_config(),
        "team_name_suggestions": TEAM_NAME_SUGGESTIONS,
    }


@router.get("/rules")
def rules():
    cfg = scoring_config()
    return {"config": cfg, "rules": describe_rules(), "boosts": BOOSTS}


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
):
    s = STORE.season
    items = [_driver_brief(d) for d in s.drivers.values()]
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
def driver_detail(slug: str):
    s = STORE.season
    d = next((x for x in s.drivers.values() if x.slug == slug), None)
    if not d:
        raise HTTPException(404, "Driver not found")
    return _driver_full(d)


@router.get("/constructors")
def constructors(sort: str = "points", order: str = "desc"):
    s = STORE.season
    items = [_constructor_brief(c) for c in s.constructors.values()]
    keymap = {
        "points": lambda c: c["points"], "price": lambda c: c["price"],
        "form": lambda c: c["form"], "ownership": lambda c: c["ownership"],
        "value": lambda c: c["value"],
    }
    items.sort(key=keymap.get(sort, keymap["points"]), reverse=(order == "desc"))
    return {"constructors": items}


@router.get("/constructors/{slug}")
def constructor_detail(slug: str):
    s = STORE.season
    c = next((x for x in s.constructors.values() if x.slug == slug), None)
    if not c:
        raise HTTPException(404, "Constructor not found")
    brief = _constructor_brief(c)
    history = [
        {"round": rnd, "points": c.round_points.get(rnd, 0)}
        for rnd in range(1, s.next_round)
    ]
    drivers_full = [_driver_brief(s.drivers[d]) for d in c.driver_ids]
    return {**brief, "history": history, "price_history": c.price_history, "drivers_full": drivers_full}


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
        rank, field_size = STORE.rank_for_total(score["total"])
        result["score"] = score
        result["rank"] = rank
        result["field_size"] = field_size
        result["percentile"] = round(100 * rank / field_size, 1)
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
    return {"valid": ok, "errors": errors, "cost": cost, "remaining": round(100.0 - cost, 1), "projected": projected}


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
    rank, field_size = STORE.rank_for_total(score["total"])
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
        return scored
    team = session.exec(select(GLTeam).where(GLTeam.profile_id == profile.id)).first()
    if not team or not team.driver_ids:
        raise HTTPException(404, "No team to score")
    scored = snapshots.score_team_for_round(
        team.driver_ids, team.constructor_ids, team.captain_id,
        team.active_boost, team.boost_driver_id, team.boost_constructor_id, rid,
    )
    scored["from_snapshot"] = False
    return scored


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
    managers = STORE.managers()
    page = managers[offset: offset + limit]
    me_row = None
    if p:
        team = session.exec(select(GLTeam).where(GLTeam.profile_id == p.id)).first()
        if team and team.driver_ids and team.constructor_ids:
            score = STORE.score_team(team.driver_ids, team.constructor_ids, team.captain_id)
            rank, field_size = STORE.rank_for_total(score["total"])
            me_row = {
                "rank": rank, "team_name": p.team_name, "manager": f"@{p.username}",
                "country": p.country, "total": score["total"],
                "last_race": score["last_race_points"], "movement": 0, "is_me": True,
            }
    return {"entries": page, "total": len(managers) + (1 if me_row else 0), "me": me_row}


# --------------------------------------------------------------------------- #
# Leagues.
# --------------------------------------------------------------------------- #


@router.get("/leagues")
def public_leagues(p: Optional[GLProfile] = Depends(get_optional_user), session: Session = Depends(get_session)):
    out = []
    for lg in STORE.public_leagues().values():
        out.append({
            "code": lg["code"], "name": lg["name"], "description": lg["description"],
            "privacy": lg["privacy"], "type": lg["type"], "member_count": lg["member_count"],
        })
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
                "privacy": lg.privacy, "type": lg.type, "member_count": count,
            })
    return {"public": out, "mine": mine}


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
    is_demo = code in STORE.public_leagues()
    if not lg and not is_demo:
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
    # Demo public league?
    demo = STORE.public_leagues().get(code)
    my_row = None
    if p:
        team = session.exec(select(GLTeam).where(GLTeam.profile_id == p.id)).first()
        if team and team.driver_ids and team.constructor_ids:
            sc = STORE.score_team(team.driver_ids, team.constructor_ids, team.captain_id)
            my_row = {
                "team_name": p.team_name, "manager": f"@{p.username}",
                "country": p.country, "total": sc["total"],
                "last_race": sc["last_race_points"], "is_me": True,
            }

    if demo:
        members = list(demo["members"])
        if my_row:
            members = members + [my_row]
        members.sort(key=lambda m: m["total"], reverse=True)
        for i, m in enumerate(members):
            m["league_rank"] = i + 1
        return {
            "code": demo["code"], "name": demo["name"], "description": demo["description"],
            "privacy": demo["privacy"], "type": demo["type"], "creator": demo["creator"],
            "member_count": len(members), "members": members,
        }

    lg = session.exec(select(GLLeague).where(GLLeague.code == code)).first()
    if not lg:
        raise HTTPException(404, "League not found")
    member_rows = session.exec(select(GLLeagueMember).where(GLLeagueMember.league_id == lg.id)).all()
    members = []
    for mr in member_rows:
        prof = session.get(GLProfile, mr.profile_id)
        if not prof:
            continue
        team = session.exec(select(GLTeam).where(GLTeam.profile_id == prof.id)).first()
        total = 0
        last = 0
        if team and team.driver_ids and team.constructor_ids:
            sc = STORE.score_team(team.driver_ids, team.constructor_ids, team.captain_id)
            total, last = sc["total"], sc["last_race_points"]
        members.append({
            "team_name": prof.team_name, "manager": f"@{prof.username}",
            "country": prof.country, "total": total, "last_race": last,
            "is_me": bool(username and prof.username == username),
        })
    members.sort(key=lambda m: m["total"], reverse=True)
    for i, m in enumerate(members):
        m["league_rank"] = i + 1
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
