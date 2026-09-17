"""Unit tests for OpenF1 normalization — verified with fixture payloads, no
network. Proves the mapping into GRIDLOCK domain objects is correct and tolerant
of missing fields."""
from app.gridlock.normalize import (
    build_driver_result, fastest_lap_driver, normalize_season,
    normalize_status, pit_rank_map, weather_label,
)
from app.gridlock.scoring import DNF, DNS, DSQ, FINISHED


def test_status_mapping():
    assert normalize_status({"position": 1}) == FINISHED
    assert normalize_status({"dnf": True}) == DNF
    assert normalize_status({"dns": True}) == DNS
    assert normalize_status({"dsq": True}) == DSQ
    assert normalize_status({"position": None}) == DNF   # no position, unflagged
    # DSQ takes precedence over dnf flag
    assert normalize_status({"dnf": True, "dsq": True}) == DSQ


def test_fastest_lap_ignores_pit_out_and_missing():
    laps = [
        {"driver_number": 1, "lap_duration": 91.5},
        {"driver_number": 44, "lap_duration": 90.9, "is_pit_out_lap": True},  # ignored
        {"driver_number": 16, "lap_duration": 91.2},
        {"driver_number": 4, "lap_duration": None},                          # ignored
    ]
    assert fastest_lap_driver(laps) == 16
    assert fastest_lap_driver([]) is None


def test_pit_rank_only_uses_reliable_durations():
    pits = [
        {"driver_number": 1, "pit_duration": 22.1},
        {"driver_number": 44, "pit_duration": 21.4},
        {"driver_number": 16, "pit_duration": None},   # excluded (no duration)
        {"driver_number": 1, "pit_duration": 23.9},    # keep best per driver
    ]
    ranks = pit_rank_map(pits)
    assert ranks == {44: 1, 1: 2}
    assert 16 not in ranks


def test_weather_label_from_last_reading():
    assert weather_label([]) == "—"
    assert weather_label([{"rainfall": 0, "air_temperature": 32}]) == "Dry · Hot"
    assert weather_label([{"rainfall": 0, "air_temperature": 24}]) == "Dry · Warm"
    assert weather_label([{"rainfall": 0, "air_temperature": 15}]) == "Overcast"
    assert weather_label([{"rainfall": 2, "air_temperature": 20}]) == "Wet"


def test_build_driver_result_positions_and_status():
    r = build_driver_result(16, {"position": 3}, grid_position=5, quali_position=4, is_fastest=True)
    assert r.finish == 3 and r.grid == 5 and r.quali_position == 4 and r.fastest_lap
    assert r.status == FINISHED
    # DNF: no finish carried
    dnf = build_driver_result(4, {"dnf": True}, grid_position=8, quali_position=8, is_fastest=False)
    assert dnf.status == DNF and dnf.finish is None
    # missing result row => DNS, tolerant of absence
    dns = build_driver_result(77, None, grid_position=None, quali_position=None, is_fastest=False)
    assert dns.status == DNS


class _FakeClient:
    """Minimal OpenF1 stand-in returning fixture payloads for one completed
    Grand Prix weekend (driver numbers 1=Norris, 44=Hamilton — real 2026 grid
    numbers, since identity now comes from our curated grid, not the API)."""
    def meetings(self, **p):
        return [{
            "meeting_key": 10, "meeting_name": "Fixture Grand Prix",
            "country_code": "BRN", "is_cancelled": False,
            "date_start": "2026-03-02T15:00:00+00:00",
        }]
    def sessions(self, **p):
        return [
            {"session_key": 99, "meeting_key": 10, "session_name": "Qualifying"},
            {"session_key": 100, "meeting_key": 10, "session_name": "Race",
             "date_start": "2026-03-02T15:00:00+00:00",
             "circuit_short_name": "Sakhir", "location": "Sakhir"},
        ]
    def session_result(self, **p):
        if p.get("session_key") == 99:  # qualifying
            return [{"driver_number": 1, "position": 1}, {"driver_number": 44, "position": 2}]
        return [{"driver_number": 1, "position": 1}, {"driver_number": 44, "position": 2}]
    def starting_grid(self, **p):
        return [{"driver_number": 1, "position": 1}, {"driver_number": 44, "position": 2}]
    def laps(self, **p):
        return [{"driver_number": 1, "lap_duration": 95.1}, {"driver_number": 44, "lap_duration": 94.8}]
    def pit(self, **p):
        return [{"driver_number": 1, "pit_duration": 22.0}, {"driver_number": 44, "pit_duration": 21.5}]
    def weather(self, **p):
        return [{"rainfall": 0, "air_temperature": 31}]


def test_normalize_season_end_to_end_with_fixtures():
    season = normalize_season(_FakeClient(), 2026)
    assert season is not None
    # Identity always comes from the full curated 2026 grid, regardless of
    # how few drivers the fixture/API reports results for.
    assert len(season.drivers) == 22 and len(season.constructors) == 11
    assert len(season.races) == 1 and season.races[0].status == "completed"
    assert season.races[0].weather == "Dry · Hot"
    # winner is driver 1 (Norris, finished P1); points were scored via the engine
    assert season.races[0].winner_id == 1
    assert season.drivers[1].points > 0
    # driver 44 (Hamilton) had the faster lap, so gets the fastest-lap bonus
    assert season.races[0].fastest_lap_id == 44
    assert season.drivers[44].round_breakdown[1]  # ledger recorded
    # drivers with no result row this round (everyone else) are simply DNS,
    # never invented — no points, no crash.
    assert season.drivers[16].points == 0


class _FakeSprintClient(_FakeClient):
    """Same fixture weekend, but with a Sprint session too."""
    def sessions(self, **p):
        return super().sessions(**p) + [
            {"session_key": 88, "meeting_key": 10, "session_name": "Sprint"},
        ]
    def session_result(self, **p):
        if p.get("session_key") == 88:  # sprint: driver 44 beats driver 1
            return [{"driver_number": 44, "position": 1}, {"driver_number": 1, "position": 2}]
        return super().session_result(**p)
    def starting_grid(self, **p):
        if p.get("session_key") == 88:
            return [{"driver_number": 1, "position": 1}, {"driver_number": 44, "position": 2}]
        return super().starting_grid(**p)


def test_normalize_season_adds_sprint_points_on_top_of_race():
    race_only = normalize_season(_FakeClient(), 2026)
    with_sprint = normalize_season(_FakeSprintClient(), 2026)
    assert with_sprint is not None and race_only is not None
    # Driver 44 (Hamilton) gained a sprint win (P2 -> P1) on top of the same
    # race result, so their round total goes up.
    assert with_sprint.drivers[44].points > race_only.drivers[44].points
    labels = [e["label"] for e in with_sprint.drivers[44].round_breakdown[1]]
    assert any("Sprint" in label for label in labels)
