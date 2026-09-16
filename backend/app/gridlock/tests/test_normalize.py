"""Unit tests for OpenF1 normalization — verified with fixture payloads, no
network. Proves the mapping into GRIDLOCK domain objects is correct and tolerant
of missing fields."""
from app.gridlock.normalize import (
    build_driver_result, fastest_lap_driver, group_constructors,
    normalize_season, normalize_status, pit_rank_map,
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


def test_group_constructors():
    rows = [
        {"driver_number": 1, "team_name": "Red Squad", "team_colour": "FF0000"},
        {"driver_number": 11, "team_name": "Red Squad", "team_colour": "FF0000"},
        {"driver_number": 44, "team_name": "Blue Squad", "team_colour": "0000FF"},
    ]
    teams = group_constructors(rows)
    assert set(teams) == {"Red Squad", "Blue Squad"}
    assert teams["Red Squad"]["drivers"] == [1, 11]
    assert teams["Red Squad"]["color"] == "#FF0000"


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
    """Minimal OpenF1 stand-in returning fixture payloads."""
    def sessions(self, **p):
        if p.get("year"):
            return [{"session_key": 100, "meeting_key": 10, "session_type": "Race",
                     "session_name": "Race", "date_start": "2024-03-02T15:00:00+00:00",
                     "country_name": "Bahrain", "country_code": "BH", "circuit_short_name": "Sakhir",
                     "location": "Sakhir"}]
        if p.get("meeting_key"):
            return [{"session_key": 99, "meeting_key": 10, "session_type": "Qualifying"}]
        return []
    def drivers(self, **p):
        return [
            {"driver_number": 1, "full_name": "A Racer", "name_acronym": "RAC", "team_name": "Red Squad", "team_colour": "FF0000", "country_code": "NL"},
            {"driver_number": 11, "full_name": "B Racer", "name_acronym": "BRC", "team_name": "Red Squad", "team_colour": "FF0000", "country_code": "ES"},
            {"driver_number": 44, "full_name": "C Racer", "name_acronym": "CRC", "team_name": "Blue Squad", "team_colour": "0000FF", "country_code": "GB"},
        ]
    def session_result(self, **p):
        if p.get("session_key") == 99:  # qualifying
            return [{"driver_number": 1, "position": 1}, {"driver_number": 11, "position": 3}, {"driver_number": 44, "position": 2}]
        return [{"driver_number": 1, "position": 1}, {"driver_number": 44, "position": 2}, {"driver_number": 11, "position": 3}]
    def starting_grid(self, **p):
        return [{"driver_number": 1, "position": 1}, {"driver_number": 44, "position": 2}, {"driver_number": 11, "position": 3}]
    def laps(self, **p):
        return [{"driver_number": 1, "lap_duration": 95.1}, {"driver_number": 44, "lap_duration": 94.8}]
    def pit(self, **p):
        return [{"driver_number": 1, "pit_duration": 22.0}, {"driver_number": 44, "pit_duration": 21.5}]


def test_normalize_season_end_to_end_with_fixtures():
    season = normalize_season(_FakeClient(), 2024)
    assert season is not None
    assert len(season.drivers) == 3 and len(season.constructors) == 2
    assert len(season.races) == 1 and season.races[0].status == "completed"
    # winner is driver 1 (finished P1); points were scored via the engine
    assert season.races[0].winner_id == 1
    assert season.drivers[1].points > 0
    # driver 1: quali P1(+12) + classified(+2) + race P1(+30) + fastest lap? 44 was faster
    # (44 has lower lap_duration) so driver 1 has no FL; still comfortably positive.
    assert season.drivers[44].round_breakdown[1]  # ledger recorded
