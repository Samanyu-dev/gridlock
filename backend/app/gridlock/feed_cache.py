"""Durable, JSON-only season snapshots: cold workers don't rebuild F1 history."""
from dataclasses import asdict
from datetime import datetime, timezone
from sqlmodel import Session
from .models import GLFeedCache
from .season import Season, Driver, Constructor, Race, RaceSession
from .scoring import FantasyScoringEngine
from ..database import engine


def encode(season):
    return {
        'year': season.year, 'next_round': season.next_round, 'source': season.source,
        'drivers': [asdict(d) for d in season.drivers.values()],
        'constructors': [asdict(c) for c in season.constructors.values()],
        'races': [asdict(r) for r in season.races],
    }


def decode(payload):
    def entity(cls, row):
        row = dict(row)
        for field in ('round_points', 'round_breakdown', 'results'):
            if field in row:
                row[field] = {int(k): v for k, v in row[field].items()}
        return cls(**row)
    races = []
    for row in payload['races']:
        row = dict(row)
        for field in ('race_start', 'deadline'):
            row[field] = datetime.fromisoformat(row[field])
        row['sessions'] = [RaceSession(**{**s, 'start': datetime.fromisoformat(s['start'])}) for s in row['sessions']]
        races.append(Race(**row))
    return Season(payload['year'], {d['id']: entity(Driver, d) for d in payload['drivers']},
                  {c['id']: entity(Constructor, c) for c in payload['constructors']},
                  races, payload['next_round'], FantasyScoringEngine(), payload.get('source', 'unknown'))


def load(year):
    try:
        with Session(engine) as session:
            row = session.get(GLFeedCache, f'openf1-v1-{year}')
            if row:
                return decode(row.payload), row.updated_at.replace(tzinfo=timezone.utc)
    except Exception:
        pass  # Feed remains usable during a cache/database outage.
    return None


def save(season):
    import json
    payload = json.loads(json.dumps(encode(season), default=lambda v: v.isoformat()))
    try:
        with Session(engine) as session:
            session.merge(GLFeedCache(key=f'openf1-v1-{season.year}', payload=payload, updated_at=datetime.now(timezone.utc)))
            session.commit()
    except Exception:
        pass


def load_raw():
    try:
        with Session(engine) as session:
            row = session.get(GLFeedCache, 'openf1-raw-v1')
            return row.payload if row else {}
    except Exception:
        return {}


def save_raw(payload):
    try:
        with Session(engine) as session:
            session.merge(GLFeedCache(key='openf1-raw-v1', payload=payload, updated_at=datetime.now(timezone.utc)))
            session.commit()
    except Exception:
        pass
