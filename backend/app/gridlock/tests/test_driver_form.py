"""Unit test for the driver Form System stats — last-N averages, quali/race
split, consistency and DNF rate, all derived from the real per-round ledger."""
from app.gridlock.router import _driver_stats
from app.gridlock.store import STORE


def test_driver_form_stats_match_manual_computation():
    d = next(iter(STORE.season.drivers.values()))
    stats = _driver_stats(d)

    completed = range(1, STORE.season.next_round)
    season_pts = [d.round_points.get(r, 0) for r in completed]

    if season_pts:
        assert stats["season_avg_pts"] == round(sum(season_pts) / len(season_pts), 1)
        assert stats["last5_avg_pts"] == round(sum(season_pts[-5:]) / len(season_pts[-5:]), 1)
    else:
        assert stats["season_avg_pts"] is None

    assert stats["races"] == len(d.results)
    assert 0.0 <= stats["dnf_rate"] <= 100.0
    assert stats["consistency"] >= 0.0


def test_driver_stats_tolerates_missing_grid():
    """Real OpenF1 data sometimes has no grid position (e.g. a pit-lane
    start) even though the driver finished — must not crash positions_gained."""
    class Stub:
        round_points = {1: 10}
        round_breakdown = {1: []}
        results = {1: {"grid": None, "finish": 8, "quali": None, "status": "finished",
                       "fastest_lap": False}}
    _driver_stats(Stub())
