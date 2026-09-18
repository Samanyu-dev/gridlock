"""Unit tests for real fantasy ownership — verifies the locked-round gate and
that percentages are tallied from actual squads, never fabricated."""
import os
import tempfile

import pytest
from sqlmodel import Session, SQLModel


@pytest.fixture()
def db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    import importlib
    from app import database
    importlib.reload(database)
    SQLModel.metadata.create_all(database.engine)
    yield database
    os.remove(path)


def test_ownership_round_is_none_before_round_one_locks(db, monkeypatch):
    from app.gridlock import deadlines, ownership
    monkeypatch.setattr(deadlines, "active_round", lambda: 1)
    monkeypatch.setattr(deadlines, "is_locked", lambda rid, at=None: False)
    assert ownership.ownership_round() is None
    with Session(db.engine) as session:
        report = ownership.compute_ownership(session)
    assert report == {"round": None, "total_teams": 0, "drivers": {}, "constructors": {}}


def test_compute_ownership_tallies_real_squads(db, monkeypatch):
    from app.gridlock import deadlines, ownership
    from app.gridlock.models import GLTeam

    monkeypatch.setattr(deadlines, "active_round", lambda: 2)
    monkeypatch.setattr(deadlines, "is_locked", lambda rid, at=None: True)

    with Session(db.engine) as session:
        session.add(GLTeam(profile_id=1, driver_ids=[10, 11], constructor_ids=[100],
                            captain_id=10, active_boost="underdog", boost_driver_id=11))
        session.add(GLTeam(profile_id=2, driver_ids=[10, 12], constructor_ids=[100], captain_id=10))
        session.commit()

        report = ownership.compute_ownership(session, round_id=ownership.ownership_round())

    assert report["round"] == 2
    assert report["total_teams"] == 2
    assert report["drivers"][10] == {"owned_pct": 100.0, "captain_pct": 100.0, "underdog_pct": 0.0}
    assert report["drivers"][11] == {"owned_pct": 50.0, "captain_pct": 0.0, "underdog_pct": 50.0}
    assert report["constructors"][100]["owned_pct"] == 100.0
