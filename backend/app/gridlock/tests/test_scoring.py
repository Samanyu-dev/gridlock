"""Unit tests for the isolated fantasy scoring engine.

These pin down the exact point values for the canonical scenarios so a change
to the rules can never silently alter scoring.
"""
from app.gridlock.scoring import (
    CLASSIFIED,
    DNF,
    DSQ,
    ConstructorRaceResult,
    DriverRaceResult,
    FantasyScoringEngine,
    merge_rules,
    DEFAULT_SCORING_RULES,
)

engine = FantasyScoringEngine()


def test_pole_to_win_with_fastest_lap():
    # Spec scenario: qualifies P2, starts P2, wins, fastest lap, no DNF.
    r = DriverRaceResult(
        driver_id=1, grid=2, finish=1, status="finished",
        fastest_lap=True, reached_q3=True, quali_position=2,
    )
    b = engine.score_driver(r)
    # Q3(3) + P1(25) + classified(1) + gained 1 pos(2) + fastest lap(5) = 36
    assert b.total == 36


def test_pole_position_bonus():
    r = DriverRaceResult(
        driver_id=1, grid=1, finish=1, status="finished",
        reached_q3=True, quali_position=1,
    )
    # Q3(3) + pole(5) + P1(25) + classified(1) + 0 pos = 34
    assert engine.score_driver(r).total == 34


def test_p15_to_p6_comeback():
    r = DriverRaceResult(
        driver_id=2, grid=15, finish=6, status="finished",
        reached_q2=False, quali_position=15,
    )
    # P6(8) + classified(1) + gained 9 pos * 2 (18) = 27
    assert engine.score_driver(r).total == 27


def test_dnf_scoring():
    r = DriverRaceResult(
        driver_id=3, grid=5, finish=None, status=DNF,
        reached_q3=True, quali_position=5,
    )
    # Q3(3) banked, then DNF(-10) => -7
    assert engine.score_driver(r).total == -7


def test_dsq_scoring():
    r = DriverRaceResult(driver_id=3, grid=5, finish=None, status=DSQ)
    assert engine.score_driver(r).total == DEFAULT_SCORING_RULES["dsq"]


def test_positions_lost():
    r = DriverRaceResult(driver_id=4, grid=3, finish=8, status="finished", quali_position=3)
    # P8(4) + classified(1) + lost 5 * -1 (-5) = 0
    assert engine.score_driver(r).total == 0


def test_teammate_battle_bonus():
    a = DriverRaceResult(driver_id=1, grid=4, finish=4, status="finished", quali_position=4)
    b = DriverRaceResult(driver_id=2, grid=6, finish=7, status="finished", quali_position=6)
    sa = engine.score_driver(a, teammate=b)
    # P4(12)+classified(1)+0 pos + beat teammate quali(2) + race(3) = 18
    assert sa.total == 18


def test_captain_multiplier():
    base = 30
    assert engine.apply_captain(base, 2) == 30  # bonus only (2x = +100%)
    assert engine.apply_captain(base, 3) == 60


def test_determinism():
    r = DriverRaceResult(driver_id=1, grid=2, finish=1, status="finished",
                         fastest_lap=True, reached_q3=True, quali_position=2)
    assert engine.score_driver(r).total == engine.score_driver(r).total


def test_config_override():
    eng = FantasyScoringEngine({"dnf": -20})
    r = DriverRaceResult(driver_id=3, grid=5, finish=None, status=DNF, quali_position=5)
    assert eng.score_driver(r).total == -20
    # Default untouched.
    assert merge_rules(None)["dnf"] == -10


def test_constructor_scoring():
    d1 = DriverRaceResult(driver_id=1, grid=2, finish=1, status="finished", quali_position=2)
    d2 = DriverRaceResult(driver_id=2, grid=4, finish=3, status="finished", quali_position=4)
    cr = ConstructorRaceResult(
        constructor_id=1, driver_results=[d1, d2],
        both_finished=True, fastest_pit_stop=True, pit_stop_rank=1,
    )
    b = engine.score_constructor(cr)
    # d1: P1(25)+classified(1)+gain1*2(2)=28 ; d2: P3(15)+classified(1)+gain1*2(2)=18
    # drivers combined = 46 ; both finished +5 ; fastest pit +5 => 56
    assert b.total == 56


def test_sprint_uses_sprint_table():
    r = DriverRaceResult(driver_id=1, grid=2, finish=1, status="finished",
                         is_sprint=True, quali_position=2)
    # Sprint P1 = 8, gained 1 pos * 2 = 2, no classified bonus on sprint => 10
    assert engine.score_driver(r).total == 10


def test_classified_but_not_finished():
    r = DriverRaceResult(driver_id=1, grid=10, finish=12, status=CLASSIFIED, quali_position=10)
    # P12 not in points table; classified(1) + lost 2 * -1 (-2) = -1
    assert engine.score_driver(r).total == -1
