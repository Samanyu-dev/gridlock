import json
import os
import tempfile
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException
from sqlmodel import Session, SQLModel, select
from app.gridlock.normalize import (
    normalize_season, _fetch_weekend, _result_ttl,
    _LIVE_TTL, _PROVISIONAL_TTL, _FINALIZED_TTL, _ENRICHMENT_BUDGET,
)
from app.gridlock.tests.test_normalize import _FakeClient
from app.gridlock.feed_cache import encode, decode
from app.gridlock.openf1 import OpenF1Client, OpenF1Provider, SEASON_CACHE_TTL
from app.gridlock.store import GameStore
from app.gridlock import deadlines


def test_snapshot_json_roundtrip_preserves_points_dates_and_keys():
    season = normalize_season(_FakeClient(), 2026)
    payload = json.loads(json.dumps(encode(season), default=lambda v: v.isoformat()))
    restored = decode(payload)
    assert restored.drivers[1].round_breakdown == season.drivers[1].round_breakdown
    assert restored.drivers[1].round_points[1] == season.drivers[1].round_points[1]
    assert restored.races[0].race_start == season.races[0].race_start
    assert restored.races[0].quali == season.races[0].quali


def test_future_weekend_does_not_query_empty_results():
    class NoRequests:
        def __getattr__(self, key):
            raise AssertionError(f'Unexpected request: {key}')
    session = {'date_start': '2099-01-01T12:00:00+00:00'}
    assert not _fetch_weekend(NoRequests(), [session], session)['has_results']


def test_active_race_remains_selected_during_race():
    season = normalize_season(_FakeClient(), 2026)
    start = season.races[0].race_start
    with patch('app.gridlock.store.get_provider') as provider, patch('app.gridlock.store.now', return_value=start + timedelta(minutes=15)):
        provider.return_value.get_season.return_value = season
        current = GameStore().season
    assert current.next_race.round == season.races[0].round
    assert current.next_race.status == 'live'
    assert season.races[0].status == 'completed'  # cached snapshot not mutated


def test_missing_classification_never_marked_final():
    race = normalize_season(_FakeClient(), 2026).races[0]
    race.classification = []
    assert deadlines.round_state(race, race.race_start + timedelta(days=5)) == 'PROVISIONAL'


def test_durable_snapshot_avoids_cold_upstream_sync():
    season = normalize_season(_FakeClient(), 2026)
    provider = OpenF1Provider(2026)
    with patch('app.gridlock.feed_cache.load', return_value=(season, datetime.now(timezone.utc))), patch.object(provider, '_sync') as sync:
        assert provider.get_season() is season
        sync.assert_not_called()


def test_unavailable_feed_returns_503_never_mock_season():
    provider = OpenF1Provider(2026)
    with patch('app.gridlock.feed_cache.load', return_value=None), patch.object(provider, '_sync'):
        with pytest.raises(HTTPException) as error:
            provider.get_season()
        assert error.value.status_code == 503


def test_reads_do_not_wait_for_background_refresh():
    provider = OpenF1Provider(2026)
    provider._season = normalize_season(_FakeClient(), 2026)
    provider._sync_lock.acquire()
    try:
        assert provider.get_season() is provider._season
        provider.refresh_if_stale()  # nonblocking if another worker is refreshing
    finally:
        provider._sync_lock.release()


# --------------------------------------------------------------------------- #
# Raw-endpoint cache freshness: a live/just-finished session's result-bearing
# endpoints must never be trusted for hours, unlike the old flat 6h TTL that
# applied to session_result/starting_grid/laps/pit/weather alike.
# --------------------------------------------------------------------------- #

class _FakeHTTPResponse:
    def __init__(self, payload):
        self._payload = payload

    def read(self):
        return json.dumps(self._payload).encode('utf-8')

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_result_ttl_scales_with_session_age():
    now = datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc)
    assert _result_ttl(now - timedelta(minutes=30), now) == _LIVE_TTL  # session plausibly still running
    assert _result_ttl(now - timedelta(hours=10), now) == _PROVISIONAL_TTL  # just finished; could still change
    assert _result_ttl(now - timedelta(days=10), now) == _FINALIZED_TTL  # long-settled
    assert _result_ttl(None, now) == _LIVE_TTL  # unknown timing — fail toward re-fetching, not freezing


def test_partial_session_result_is_refetched_once_its_short_ttl_elapses():
    """The regression this guards: an initially empty/partial session_result
    response (session still evolving) must not be served stale for hours —
    it should refresh shortly afterward when the endpoint was given a short,
    session-aware TTL."""
    client = OpenF1Client()
    client._loaded = True  # skip the persistent raw-cache load; no DB needed
    responses = [[], [{'driver_number': 1, 'position': 1}]]

    def fake_urlopen(req, timeout):
        return _FakeHTTPResponse(responses.pop(0))

    with patch('app.gridlock.openf1.urllib.request.urlopen', side_effect=fake_urlopen):
        first = client.get('session_result', ttl=0.05, session_key=123)
        assert first == []
        client._last_request = 0.0  # real time has passed; don't wait out the rate limiter too
        time.sleep(0.08)  # let the short ttl elapse
        second = client.get('session_result', ttl=0.05, session_key=123)
    assert second == [{'driver_number': 1, 'position': 1}]


def test_missing_ttl_falls_back_to_a_short_default_not_the_old_flat_6h():
    """A call site that forgets to pass ttl (the old bug's shape, before
    every result-bearing call in _fetch_weekend computed one) must still
    fail toward re-fetching too often rather than freezing stale data for
    hours — the no-ttl fallback must never regress to the old flat 21600s."""
    client = OpenF1Client()
    client._loaded = True
    responses = [[], [{'driver_number': 1, 'position': 1}]]

    def fake_urlopen(req, timeout):
        return _FakeHTTPResponse(responses.pop(0))

    with patch('app.gridlock.openf1.urllib.request.urlopen', side_effect=fake_urlopen):
        first = client.get('session_result', session_key=1)  # no ttl passed
        assert first == []
        cache_key = next(iter(client._responses))
        # Simulate real time passing well past any sane short default, but
        # nowhere near the old flat 21600s (6h) — if the no-ttl fallback were
        # still 6h, this would incorrectly serve the stale empty response.
        client._responses[cache_key]['at'] -= 60
        client._last_request = 0.0
        second = client.get('session_result', session_key=1)
    assert second == [{'driver_number': 1, 'position': 1}]


# --------------------------------------------------------------------------- #
# Cold-bootstrap vs. warm partial-refresh: a full historical rebuild via
# OpenF1 on every sync serializes ~5-8 calls/round at ~2.1s/call, which can
# take minutes — past a serverless execution window. Cold syncs bootstrap
# from Jolpica instead; warm syncs only re-fetch rounds that can plausibly
# have changed, reusing everything else from the prior snapshot.
# --------------------------------------------------------------------------- #

def test_finalized_round_is_reused_from_base_without_refetching():
    base = normalize_season(_FakeClient(), 2026)
    assert base.races[0].classification  # sanity: the fixture round has real results

    class ExplodingClient:
        def meetings(self, **p):
            return _FakeClient().meetings(**p)

        def sessions(self, **p):
            return _FakeClient().sessions(**p)

        def session_result(self, **p):
            raise AssertionError('a safely-finalized round must not be refetched')

        def starting_grid(self, **p):
            raise AssertionError('a safely-finalized round must not be refetched')

        def laps(self, **p):
            raise AssertionError('a safely-finalized round must not be refetched')

        def pit(self, **p):
            raise AssertionError('a safely-finalized round must not be refetched')

        def weather(self, **p):
            raise AssertionError('a safely-finalized round must not be refetched')

    rebuilt = normalize_season(ExplodingClient(), 2026, base=base)
    assert rebuilt is not None
    assert rebuilt.races[0].classification == base.races[0].classification
    assert rebuilt.drivers[1].round_points == base.drivers[1].round_points


def test_cold_sync_bootstraps_from_jolpica_and_never_touches_openf1():
    provider = OpenF1Provider(2026)
    exploding = Mock(side_effect=AssertionError('cold sync must not call OpenF1'))
    provider.client.meetings = exploding
    with patch('app.gridlock.jolpica.JolpicaClient', return_value=_FakeClient()):
        provider._sync()
    exploding.assert_not_called()
    assert provider.last_sync_source == 'jolpica'
    assert provider.last_error is None
    assert provider._season is not None


def test_warm_sync_passes_prior_season_as_base_to_avoid_full_rebuild():
    provider = OpenF1Provider(2026)
    provider._season = normalize_season(_FakeClient(), 2026)
    with patch('app.gridlock.normalize.normalize_season', return_value=provider._season) as mock_norm:
        provider._sync()
    assert mock_norm.call_args.kwargs.get('base') is provider._season
    assert provider.last_sync_source == 'openf1'


# --------------------------------------------------------------------------- #
# Freshness must be a provider-level guarantee, not dependent on some
# particular route (e.g. /meta) remembering to trigger a background refresh.
# --------------------------------------------------------------------------- #

def test_get_season_schedules_refresh_even_without_the_meta_route():
    provider = OpenF1Provider(2026)
    provider._season = normalize_season(_FakeClient(), 2026)
    provider._cache_loaded = True
    stale_anchor = datetime.now(timezone.utc) - timedelta(seconds=SEASON_CACHE_TTL + 10)
    provider._last_attempt = stale_anchor
    provider.last_synced_at = stale_anchor

    with patch.object(provider, '_sync') as mock_sync:
        result = provider.get_season()  # no refresh_if_stale()/BackgroundTasks involved
        for _ in range(20):
            if mock_sync.called:
                break
            time.sleep(0.02)

    assert result is provider._season  # never blocks on the refresh
    mock_sync.assert_called_once()


# --------------------------------------------------------------------------- #
# Per-round provenance + bounded incremental enrichment. The Jolpica cold
# bootstrap has no pit-stop data (its per-round pit-stop endpoint isn't
# fetched during the fast bootstrap), so constructor pit-stop bonus points
# (+5/+3/+1 for the top 3 pit ranks) are genuinely missing from those rounds
# — never fabricated, but also never left permanently wrong. A bounded
# number of "jolpica-basic" rounds get upgraded to "openf1-full" per sync.
# --------------------------------------------------------------------------- #

class _MultiRoundFakeClient:
    """Three finalized rounds, all real (dates far in the past relative to
    "now" in this test environment) — enough rounds to prove enrichment is
    bounded per sync rather than catching up on an entire backlog at once."""
    ROUNDS = (1, 2, 3)

    def meetings(self, **p):
        return [
            {"meeting_key": i, "meeting_name": f"Round {i} Grand Prix", "country_code": "BRN",
             "is_cancelled": False, "date_start": f"2026-0{i}-02T15:00:00+00:00"}
            for i in self.ROUNDS
        ]

    def sessions(self, **p):
        return [
            {"session_key": 100 + i, "meeting_key": i, "session_name": "Race",
             "date_start": f"2026-0{i}-02T15:00:00+00:00", "circuit_short_name": "Sakhir", "location": "Sakhir"}
            for i in self.ROUNDS
        ]

    def session_result(self, **p):
        return [{"driver_number": 1, "position": 1}, {"driver_number": 44, "position": 2}]

    def starting_grid(self, **p):
        return [{"driver_number": 1, "position": 1}, {"driver_number": 44, "position": 2}]

    def laps(self, **p):
        return [{"driver_number": 1, "lap_duration": 95.1}, {"driver_number": 44, "lap_duration": 94.8}]

    def pit(self, **p):
        return []

    def weather(self, **p):
        return [{"rainfall": 0, "air_temperature": 31}]


def test_cold_bootstrap_marks_every_round_jolpica_basic():
    season = normalize_season(_FakeClient(), 2026, source='jolpica')
    assert season.races[0].data_source == 'jolpica-basic'


def test_warm_openf1_sync_marks_freshly_fetched_rounds_openf1_full():
    base = normalize_season(_FakeClient(), 2026, source='jolpica')
    # The fixture's one round has no prior classification carried over from
    # nothing, so it's "required" (must-fetch), not merely "enrichment" —
    # either way a fresh OpenF1-sourced fetch should tag it openf1-full.
    base.races[0].classification = []  # force must-fetch, isolate the tag logic
    rebuilt = normalize_season(_FakeClient(), 2026, base=base, source='openf1')
    assert rebuilt.races[0].data_source == 'openf1-full'


def test_enrichment_is_bounded_per_sync_not_a_full_backlog_catchup():
    base = normalize_season(_MultiRoundFakeClient(), 2026, source='jolpica')
    assert len(base.races) == 3
    assert all(r.data_source == 'jolpica-basic' for r in base.races)

    enriched = normalize_season(_MultiRoundFakeClient(), 2026, base=base, source='openf1')
    upgraded = [r for r in enriched.races if r.data_source == 'openf1-full']
    still_basic = [r for r in enriched.races if r.data_source == 'jolpica-basic']
    assert len(upgraded) == _ENRICHMENT_BUDGET  # bounded, not all 3 at once
    assert len(still_basic) == len(base.races) - _ENRICHMENT_BUDGET


def test_openf1_full_round_is_never_reselected_for_enrichment():
    class _FullyEnrichableClient(_MultiRoundFakeClient):
        ROUNDS = tuple(range(1, _ENRICHMENT_BUDGET + 1))  # exactly the budget — one pass covers all of them

    base = normalize_season(_FullyEnrichableClient(), 2026, source='jolpica')
    once = normalize_season(_FullyEnrichableClient(), 2026, base=base, source='openf1')
    assert all(r.data_source == 'openf1-full' for r in once.races)

    class ExplodingClient(_FullyEnrichableClient):
        def session_result(self, **p):
            raise AssertionError('an already openf1-full round must not be refetched again')

    twice = normalize_season(ExplodingClient(), 2026, base=once, source='openf1')
    assert all(r.data_source == 'openf1-full' for r in twice.races)  # unchanged, nothing exploded


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


def test_pit_stop_enrichment_is_recorded_as_a_real_reconciliation_correction(db):
    """The exact scenario from review: a Jolpica-bootstrapped round has no
    pit-stop data, so a constructor's pit-stop bonus is genuinely missing
    (never fabricated) until enriched from OpenF1. The same reconcile()
    every sync already runs must record the resulting point change as a
    real, audited correction, not silently rewrite it."""
    from app.gridlock.reconciliation import reconcile
    from app.gridlock.models import GLLedgerAudit

    base = normalize_season(_FakeClient(), 2026, source='jolpica')
    assert base.races[0].data_source == 'jolpica-basic'
    assert base.constructors[1].round_breakdown.get(1, [])  # sanity: round 1 was scored
    reconcile(base, run_id=1)  # establish the baseline — no pit bonus yet

    class _WithPitData(_FakeClient):
        def pit(self, **p):
            return [{'driver_number': 1, 'pit_duration': 21.0}]  # McLaren's only stop: fastest by default

    enriched = normalize_season(_WithPitData(), 2026, base=base, source='openf1')
    assert enriched.races[0].data_source == 'openf1-full'
    mclaren_items = enriched.constructors[1].round_breakdown.get(1, [])
    assert any(item.get('rule_code') == 'CON_PIT_1' for item in mclaren_items), mclaren_items

    changes = reconcile(enriched, run_id=2)
    assert changes >= 1
    with Session(db.engine) as session:
        rows = session.exec(select(GLLedgerAudit)).all()
    assert any(
        r.entity_type == 'constructor' and r.entity_id == 1 and r.delta > 0
        for r in rows
    ), rows
