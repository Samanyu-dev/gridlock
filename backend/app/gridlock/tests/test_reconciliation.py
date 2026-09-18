"""Unit tests for ledger reconciliation — verifies the durable audit trail
only ever records real, persisted changes, never the first observation."""
import os
import tempfile

import pytest
from sqlmodel import Session, SQLModel, select


@pytest.fixture()
def db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    import importlib
    from app import database
    from app.gridlock import reconciliation
    importlib.reload(database)
    importlib.reload(reconciliation)  # re-bind its `engine` reference too
    SQLModel.metadata.create_all(database.engine)
    yield database
    os.remove(path)


def _season_stub(round_id: int, driver_id: int, points: float, items: list):
    """A minimal stand-in with just the shape reconcile() reads."""
    class Driver:
        id = driver_id
        round_breakdown = {round_id: items}
        round_points = {round_id: points}

    class Season:
        drivers = {driver_id: Driver()}
        constructors: dict = {}

    return Season()


def test_first_observation_creates_no_audit_row(db):
    from app.gridlock.reconciliation import reconcile
    from app.gridlock.models import GLLedgerAudit, GLLedgerState

    season = _season_stub(5, 1, 25.0, [{"label": "Race P1", "points": 25}])
    changes = reconcile(season, run_id=None)
    assert changes == 0
    with Session(db.engine) as session:
        assert len(session.exec(select(GLLedgerState)).all()) == 1
        assert len(session.exec(select(GLLedgerAudit)).all()) == 0


def test_real_change_is_audited_with_correct_delta(db):
    from app.gridlock.reconciliation import reconcile
    from app.gridlock.models import GLLedgerAudit

    first = _season_stub(5, 1, 25.0, [{"label": "Race P1", "points": 25}])
    reconcile(first, run_id=1)

    corrected = _season_stub(5, 1, 18.0, [{"label": "Race P2 (post-penalty)", "points": 18}])
    changes = reconcile(corrected, run_id=2)
    assert changes == 1

    with Session(db.engine) as session:
        rows = session.exec(select(GLLedgerAudit)).all()
        assert len(rows) == 1
        assert rows[0].previous_points == 25.0
        assert rows[0].new_points == 18.0
        assert rows[0].delta == -7.0
        assert rows[0].reason == "points_decreased"
        assert rows[0].run_id == 2


def test_unchanged_ledger_is_not_reaudited(db):
    from app.gridlock.reconciliation import reconcile
    from app.gridlock.models import GLLedgerAudit

    stable = _season_stub(5, 1, 25.0, [{"label": "Race P1", "points": 25}])
    reconcile(stable, run_id=1)
    changes = reconcile(stable, run_id=2)  # same data, synced again
    assert changes == 0
    with Session(db.engine) as session:
        assert len(session.exec(select(GLLedgerAudit)).all()) == 0
