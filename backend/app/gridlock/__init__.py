"""GRIDLOCK — fantasy motorsport domain.

Everything specific to the fantasy-motorsport product lives here, isolated
from transport (FastAPI) and UI. The public surface is:

- ``scoring``  — the deterministic, config-driven fantasy scoring engine.
- ``provider`` — the ``MotorsportDataProvider`` adapter + mock implementation.
- ``season``   — the seeded demo season (drivers, constructors, circuits, races).
- ``store``    — cached season + demo managers/leagues + insights.
"""
