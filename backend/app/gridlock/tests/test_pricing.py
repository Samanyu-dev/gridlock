"""Dynamic pricing tests — deterministic, bounded, performance-driven."""
from app.gridlock.pricing import PRICING, price_driver_path
from app.gridlock.store import STORE


def test_price_path_bounded_and_deterministic():
    rounds = list(range(1, 15))
    pts = {r: 30 for r in rounds}   # strong scorer
    a = price_driver_path(20, 0, 40, pts, form=8.0, ownership=50, rounds=rounds)
    b = price_driver_path(20, 0, 40, pts, form=8.0, ownership=50, rounds=rounds)
    assert [x["price"] for x in a] == [x["price"] for x in b]           # deterministic
    for x in a:
        assert PRICING["min"] <= x["price"] <= PRICING["max"]           # bounded
        assert -PRICING["max_fall"] - 1e-9 <= x["change"] <= PRICING["max_rise"] + 1e-9
    assert len(a) == len(rounds) + 1                                    # incl. opening


def test_strong_scorer_rises_weak_falls():
    rounds = list(range(1, 15))
    strong = price_driver_path(20, 0, 40, {r: 40 for r in rounds}, 9.0, 60, rounds)
    weak = price_driver_path(20, 0, 40, {r: 2 for r in rounds}, 2.0, 10, rounds)
    assert strong[-1]["price"] > strong[0]["price"]
    assert weak[-1]["price"] < weak[0]["price"]


def test_season_prices_are_sane():
    s = STORE.season
    for d in s.drivers.values():
        assert 4.0 <= d.price <= 30.0
        assert len(d.price_history) >= 2
    # top scorer should be among the pricier drivers
    top = max(s.drivers.values(), key=lambda d: d.points)
    assert top.price >= 18.0
