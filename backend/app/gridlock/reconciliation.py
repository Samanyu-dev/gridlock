"""Persistent ledger reconciliation.

Answers "why did my score change" durably, across cold starts and restarts —
without changing scoring behavior. This module never computes a single fantasy
point; it only *observes* what ``FantasyScoringEngine`` (fed by real provider
data) already produced for a round, compares it against the last persisted
baseline, and — only when something genuinely changed — updates the baseline
and appends an audit row. A fresh round with no prior baseline is a first
observation, not a "change", so it never creates an audit row.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from ..database import engine
from .models import GLLedgerAudit, GLLedgerState, MDataSyncRun
from .season import Season


def _hash_payload(items: list) -> str:
    return hashlib.sha256(json.dumps(items, sort_keys=True, default=str).encode()).hexdigest()


def start_run(provider: str, scope: str = "season") -> Optional[int]:
    """Record a sync attempt starting. Returns its id, or None if the DB is
    unavailable — reconciliation is diagnostic, never load-bearing."""
    try:
        with Session(engine) as session:
            run = MDataSyncRun(provider=provider, scope=scope, status="running")
            session.add(run)
            session.commit()
            session.refresh(run)
            return run.id
    except Exception:
        return None


def finish_run(run_id: Optional[int], status: str, records: int, error: Optional[str] = None) -> None:
    if run_id is None:
        return
    try:
        with Session(engine) as session:
            run = session.get(MDataSyncRun, run_id)
            if run:
                run.finished_at = datetime.utcnow()
                run.status = status
                run.records = records
                run.error = error
                session.add(run)
                session.commit()
    except Exception:
        pass


def reconcile(season: Season, run_id: Optional[int]) -> int:
    """Diff every round's ledger against the persisted baseline. Returns the
    number of real changes detected (0 on a fresh baseline or on DB failure —
    never raises, this must never be able to break the live season)."""
    try:
        changes = 0
        with Session(engine) as session:
            for d in season.drivers.values():
                for rnd, items in d.round_breakdown.items():
                    if not items:
                        continue
                    changes += _reconcile_entity(
                        session, rnd, "driver", d.id, d.round_points.get(rnd, 0), items, run_id,
                    )
            for c in season.constructors.values():
                for rnd, items in c.round_breakdown.items():
                    if not items:
                        continue
                    changes += _reconcile_entity(
                        session, rnd, "constructor", c.id, c.round_points.get(rnd, 0), items, run_id,
                    )
            session.commit()
        return changes
    except Exception:
        return 0


def _reconcile_entity(
    session: Session, round_id: int, entity_type: str, entity_id: int,
    new_points: float, new_items: list, run_id: Optional[int],
) -> int:
    new_hash = _hash_payload(new_items)
    state = session.exec(
        select(GLLedgerState).where(
            GLLedgerState.round_id == round_id,
            GLLedgerState.entity_type == entity_type,
            GLLedgerState.entity_id == entity_id,
        )
    ).first()

    if state is None:
        session.add(GLLedgerState(
            round_id=round_id, entity_type=entity_type, entity_id=entity_id,
            points=new_points, payload_hash=new_hash, payload=new_items,
        ))
        return 0

    if state.payload_hash == new_hash:
        return 0

    delta = round(new_points - state.points, 2)
    reason = "points_increased" if delta > 0 else ("points_decreased" if delta < 0 else "breakdown_changed")
    session.add(GLLedgerAudit(
        round_id=round_id, entity_type=entity_type, entity_id=entity_id,
        previous_points=state.points, new_points=new_points, delta=delta,
        previous_payload_hash=state.payload_hash, new_payload_hash=new_hash,
        previous_payload=state.payload, new_payload=new_items,
        reason=reason, run_id=run_id,
    ))
    state.points = new_points
    state.payload_hash = new_hash
    state.payload = new_items
    state.updated_at = datetime.utcnow()
    session.add(state)
    return 1
