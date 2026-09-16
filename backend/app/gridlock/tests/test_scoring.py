"""Unit tests for the GRIDLOCK V3 scoring engine.

These pin the exact ledger so a rules change can never silently alter scoring.

Note on the §20 spec example (NORRIS = 53): that illustration omits the
`classified +2` reliability bonus defined in §12. We follow the explicit §12
rule, so the rule-consistent total is 55; `classified` is a config value that can
be set to 0 to reproduce the 53 example exactly.
"""
from app.gridlock.scoring import (
    CLASSIFIED, DNF, DNS, DSQ, FINISHED,
    ConstructorRaceResult, DriverRaceResult, FantasyScoringEngine, ScoreState,
    describe_rules, round_display,
)

E = FantasyScoringEngine()


def codes(res):
    return {e.rule_code: e.points for e in res.entries}


# --- qualifying -------------------------------------------------------------

def test_quali_points_and_teammate():
    d = DriverRaceResult(driver_id=1, quali_position=2, grid=2, finish=1, fastest_lap=True)
    mate = DriverRaceResult(driver_id=2, quali_position=5, grid=5, finish=4)
    res = E.score_driver(d, teammate=mate)
    c = codes(res)
    assert c["QUALI_POS"] == 10
    assert c["QUALI_TEAMMATE"] == 3
    assert c["RACE_POS"] == 30
    assert c["REL_CLASSIFIED"] == 2
    assert c["RACE_GAINED"] == 2      # grid2 -> finish1
    assert c["FASTEST_LAP"] == 5
    assert c["RACE_TEAMMATE"] == 3
    assert res.total == 55            # 10+3 + 2+30+2+5+3


def test_no_q2_q3_advancement_rule():
    # A driver 11th in quali gets zero qualifying points (no advancement bonus).
    d = DriverRaceResult(driver_id=1, quali_position=11, grid=11, finish=11)
    assert "QUALI_POS" not in codes(E.score_driver(d))


# --- positions gained / lost caps ------------------------------------------

def test_positions_gained_capped_at_12():
    d = DriverRaceResult(driver_id=1, grid=20, finish=1)
    c = codes(E.score_driver(d))
    assert c["RACE_GAINED"] == 12     # 19 places, capped
    assert c["RACE_POS"] == 30


def test_positions_lost_capped_at_minus6():
    d = DriverRaceResult(driver_id=1, grid=1, finish=10)
    c = codes(E.score_driver(d))
    assert c["RACE_LOST"] == -6       # 9 places lost, capped
    assert c["RACE_POS"] == 6


# --- retirements: no double reward/punishment ------------------------------

def test_dnf_only_quali_and_reliability():
    d = DriverRaceResult(driver_id=1, quali_position=5, grid=5, finish=None, status=DNF)
    c = codes(E.score_driver(d))
    assert c["QUALI_POS"] == 6
    assert c["REL_DNF"] == -8
    assert "RACE_GAINED" not in c and "RACE_POS" not in c and "REL_CLASSIFIED" not in c
    assert d.status == DNF and E.score_driver(d).total == -2


def test_dns_penalty():
    d = DriverRaceResult(driver_id=1, quali_position=5, grid=5, status=DNS)
    c = codes(E.score_driver(d))
    assert c["REL_DNS"] == -5


def test_dsq_penalty():
    d = DriverRaceResult(driver_id=1, quali_position=3, grid=3, status=DSQ)
    assert codes(E.score_driver(d))["REL_DSQ"] == -15


def test_teammate_not_awarded_when_teammate_dns():
    d = DriverRaceResult(driver_id=1, grid=5, finish=5, status=FINISHED)
    mate = DriverRaceResult(driver_id=2, grid=6, status=DNS)
    assert "RACE_TEAMMATE" not in codes(E.score_driver(d, teammate=mate))


def test_teammate_not_awarded_when_both_dnf():
    d = DriverRaceResult(driver_id=1, grid=5, finish=None, status=DNF)
    mate = DriverRaceResult(driver_id=2, grid=6, finish=None, status=DNF)
    assert "RACE_TEAMMATE" not in codes(E.score_driver(d, teammate=mate))


# --- sprint -----------------------------------------------------------------

def test_sprint_scoring():
    d = DriverRaceResult(driver_id=1, grid=3, finish=1, is_sprint=True)
    c = codes(E.score_driver(d))
    assert c["SPRINT_POS"] == 12
    assert c["SPRINT_GAINED"] == 2
    assert "REL_CLASSIFIED" not in c and "FASTEST_LAP" not in c
    assert E.score_driver(d).total == 14


def test_sprint_dnf():
    d = DriverRaceResult(driver_id=1, grid=3, finish=None, status=DNF, is_sprint=True)
    assert codes(E.score_driver(d))["SPRINT_DNF"] == -4


# --- constructor ------------------------------------------------------------

def test_constructor_race_fraction_and_tier_not_stacking():
    a = DriverRaceResult(driver_id=1, quali_position=2, grid=2, finish=1)
    b = DriverRaceResult(driver_id=2, quali_position=4, grid=4, finish=3)
    cr = ConstructorRaceResult(constructor_id=1, driver_results=[a, b])
    c = codes(E.score_constructor(cr))
    assert c["CON_RACE_BASE"] == round_display((30 + 21) * 0.5)  # 25.5
    assert c["CON_BOTH_Q3"] == 4
    assert c["CON_TIER_PODIUM"] == 10   # 1 & 3 -> double podium
    assert "CON_TIER_1_2" not in c      # tiers never stack
    assert c["CON_BOTH_CLASSIFIED"] == 3
    assert "CON_PIT_1" not in c          # no pit data -> no pit points


def test_constructor_1_2_is_highest_tier_only():
    a = DriverRaceResult(driver_id=1, grid=1, finish=1)
    b = DriverRaceResult(driver_id=2, grid=2, finish=2)
    c = codes(E.score_constructor(ConstructorRaceResult(1, [a, b])))
    assert c["CON_TIER_1_2"] == 12
    assert "CON_TIER_PODIUM" not in c and "CON_TIER_TOP5" not in c


def test_constructor_front_row_lockout():
    a = DriverRaceResult(driver_id=1, quali_position=1, grid=1, finish=1)
    b = DriverRaceResult(driver_id=2, quali_position=2, grid=2, finish=2)
    c = codes(E.score_constructor(ConstructorRaceResult(1, [a, b])))
    assert c["CON_FRONT_ROW"] == 5


def test_constructor_pit_only_with_data():
    a = DriverRaceResult(driver_id=1, grid=5, finish=5)
    b = DriverRaceResult(driver_id=2, grid=6, finish=6)
    with_pit = codes(E.score_constructor(ConstructorRaceResult(1, [a, b], pit_stop_rank=1)))
    assert with_pit["CON_PIT_1"] == 5
    without = codes(E.score_constructor(ConstructorRaceResult(1, [a, b], pit_stop_rank=None)))
    assert "CON_PIT_1" not in without


# --- captain / boosts (multipliers, incl. negatives) ------------------------

def test_captain_multiplies_whole_score_including_negatives():
    assert E.captain_bonus_entry(53).points == round_display(53 * 0.5)   # +26.5 -> 1.5x
    assert E.captain_bonus_entry(-8).points == round_display(-8 * 0.5)   # -4.0


def test_turbo_and_pit_wall_bonuses():
    assert E.turbo_bonus_entry(20).points == 20.0     # 2x -> +100%
    assert E.pit_wall_bonus_entry(30).points == 15.0  # 1.5x -> +50%


# --- determinism ------------------------------------------------------------

def test_determinism():
    d = DriverRaceResult(driver_id=1, quali_position=2, grid=5, finish=1, fastest_lap=True)
    assert codes(E.score_driver(d)) == codes(E.score_driver(d))
    assert E.score_driver(d).total == E.score_driver(d).total


def test_config_override_isolated():
    eng = FantasyScoringEngine({"dnf": -20})
    d = DriverRaceResult(driver_id=1, grid=5, finish=None, status=DNF)
    assert codes(eng.score_driver(d))["REL_DNF"] == -20
    # default engine untouched
    assert codes(E.score_driver(d))["REL_DNF"] == -8


def test_score_states_exist():
    assert {s.value for s in ScoreState} == {"live", "provisional", "final"}


def test_describe_rules_reports_v3():
    r = describe_rules()
    assert r["race_points"][1] == 30 and r["quali_points"][1] == 12
    assert r["captain_multiplier"] == 1.5
