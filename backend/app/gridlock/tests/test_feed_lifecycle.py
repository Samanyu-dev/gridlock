import json
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

import pytest
from fastapi import HTTPException
from app.gridlock.normalize import normalize_season, _fetch_weekend, _result_ttl, _LIVE_TTL, _PROVISIONAL_TTL, _FINALIZED_TTL
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
