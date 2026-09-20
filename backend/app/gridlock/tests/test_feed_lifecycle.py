import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from app.gridlock.normalize import normalize_season, _fetch_weekend
from app.gridlock.tests.test_normalize import _FakeClient
from app.gridlock.feed_cache import encode, decode
from app.gridlock.openf1 import OpenF1Provider
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
