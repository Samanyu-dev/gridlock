"""End-to-end API tests: real auth, token-derived identity, transactional team
save with transfer accounting, snapshots, and the auditable weekend ledger."""
import os
import tempfile

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["DATABASE_URL"] = f"sqlite:///{path}"
    os.environ["GRIDLOCK_SECRET_KEY"] = "test-secret-key-that-is-at-least-32-bytes-long"
    # Import after env is set so the engine binds to the temp DB.
    import importlib
    from app import database, main
    importlib.reload(database)
    importlib.reload(main)
    with TestClient(main.app) as c:
        yield c
    os.remove(path)


def _affordable_team(c):
    ds = c.get("/api/drivers?sort=price&order=asc").json()["drivers"]
    cs = c.get("/api/constructors?sort=price&order=asc").json()["constructors"]
    return {
        "driver_ids": [d["id"] for d in ds[:10]],
        "constructor_ids": [cs[0]["id"], cs[1]["id"]],
        "captain_id": ds[0]["id"],
        "active_boost": None,
    }


def _register(c, email="race@example.com", username="racer"):
    r = c.post("/api/auth/register", json={"email": email, "password": "supersecret1", "username": username, "team_name": "Late Brakers"})
    assert r.status_code == 200, r.text
    return r.json()


def test_register_login_and_token_identity(client):
    data = _register(client)
    token = data["access_token"]
    assert data["profile"]["email"] == "race@example.com"

    # /api/me requires a bearer token; no token => 401.
    assert client.get("/api/me").status_code == 401
    me = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["profile"]["username"] == "racer"

    # login returns a working token
    lr = client.post("/api/auth/login", json={"email": "race@example.com", "password": "supersecret1"})
    assert lr.status_code == 200
    assert client.get("/api/me", headers={"Authorization": f"Bearer {lr.json()['access_token']}"}).status_code == 200

    # bad password rejected
    assert client.post("/api/auth/login", json={"email": "race@example.com", "password": "wrong"}).status_code == 401


def test_duplicate_email_and_username_rejected(client):
    _register(client)
    assert client.post("/api/auth/register", json={"email": "race@example.com", "password": "supersecret1", "username": "other"}).status_code == 409
    assert client.post("/api/auth/register", json={"email": "new@example.com", "password": "supersecret1", "username": "racer"}).status_code == 409


def test_team_save_requires_auth_and_scores_from_ledger(client):
    data = _register(client)
    hdr = {"Authorization": f"Bearer {data['access_token']}"}
    team = _affordable_team(client)

    # No token => rejected (never trusts a body id).
    assert client.put("/api/team", json=team).status_code == 401

    save = client.put("/api/team", json=team, headers=hdr)
    assert save.status_code == 200, save.text
    body = save.json()
    assert body["transfers"]["transfers"] == 0        # first pick is free
    assert body["team"]["team_value"] > 0

    # Auditable weekend score comes from the ledger with a score state.
    score = client.get("/api/team/score", headers=hdr).json()
    assert score["state"] in ("live", "provisional", "final")
    assert "assets" in score and len(score["assets"]) == 12
    # captain multiplier reflected on the captain asset
    cap_asset = next(a for a in score["assets"] if a["ref"] == f"driver:{team['captain_id']}")
    assert cap_asset["multiplier"] == 1.5


def test_transfer_penalty_after_free_allowance(client):
    data = _register(client)
    hdr = {"Authorization": f"Bearer {data['access_token']}"}
    team = _affordable_team(client)
    client.put("/api/team", json=team, headers=hdr)

    # Swap 3 drivers -> 2 free, 1 penalized at -5 (default 2 free transfers).
    ds = client.get("/api/drivers?sort=price&order=asc").json()["drivers"]
    spare = [d["id"] for d in ds if d["id"] not in team["driver_ids"]][:3]
    new_team = dict(team)
    new_team["driver_ids"] = spare + team["driver_ids"][3:]
    new_team["captain_id"] = new_team["driver_ids"][0]
    res = client.put("/api/team", json=new_team, headers=hdr)
    assert res.status_code == 200, res.text
    t = res.json()["transfers"]
    assert t["transfers"] == 3 and t["penalized"] == 1 and t["penalty"] == 5


def test_snapshot_created_on_save(client):
    data = _register(client)
    hdr = {"Authorization": f"Bearer {data['access_token']}"}
    client.put("/api/team", json=_affordable_team(client), headers=hdr)
    # The snapshot is scored from the ledger and carries a state.
    score = client.get("/api/team/score", headers=hdr).json()
    assert "total" in score and "round" in score


def test_leagues_use_token_identity(client):
    data = _register(client)
    hdr = {"Authorization": f"Bearer {data['access_token']}"}
    # create requires auth
    assert client.post("/api/leagues", json={"name": "My League"}).status_code == 401
    made = client.post("/api/leagues", json={"name": "My League", "privacy": "private"}, headers=hdr)
    assert made.status_code == 200
    code = made.json()["code"]
    detail = client.get(f"/api/leagues/{code}", headers=hdr).json()
    assert detail["member_count"] == 1


def test_password_reset_flow(client):
    _register(client)
    req = client.post("/api/auth/reset/request", json={"email": "race@example.com"}).json()
    assert req["reset_token"]
    ok = client.post("/api/auth/reset/confirm", json={"token": req["reset_token"], "password": "brandnewpass9"})
    assert ok.status_code == 200
    assert client.post("/api/auth/login", json={"email": "race@example.com", "password": "brandnewpass9"}).status_code == 200


def test_oauth_reports_unconfigured(client):
    r = client.get("/api/auth/oauth/google")
    assert r.status_code == 503
    assert "configured" in r.json()["detail"].lower()
