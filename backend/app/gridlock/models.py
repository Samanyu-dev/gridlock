"""SQLModel persistence for GRIDLOCK.

Two families of tables:

* ``ms_*`` — normalized, *persisted* motorsport data ingested from a provider
  (mock or OpenF1). This is the source of truth for scoring, auditing, historical
  pages, and live state — never the raw provider response shape.
* ``gl_*`` — user-owned fantasy state: accounts, teams, immutable per-round
  snapshots, transfers, boost usage, and an auditable score-event ledger.

Every table carries the indexes, foreign keys and uniqueness constraints needed
for correctness and idempotency. Schema is managed by Alembic migrations, not by
runtime ``create_all`` (which remains only a dev/test convenience).
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlmodel import JSON, Column, Field, SQLModel, UniqueConstraint


# =========================================================================== #
# Accounts / auth.
# =========================================================================== #

class GLProfile(SQLModel, table=True):
    __tablename__ = "gl_profile"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    email: Optional[str] = Field(default=None, index=True, unique=True)
    password_hash: Optional[str] = None
    email_verified: bool = False
    auth_provider: str = "password"        # password / google / apple
    is_admin: bool = False

    display_name: str = ""
    team_name: str = "My Grid"
    persona: Optional[str] = None
    country: Optional[str] = None
    favorite_driver_id: Optional[int] = None
    favorite_constructor_id: Optional[int] = None
    public_profile: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class GLRefreshToken(SQLModel, table=True):
    __tablename__ = "gl_refresh_token"

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(index=True, foreign_key="gl_profile.id")
    token_hash: str = Field(index=True, unique=True)
    expires_at: datetime
    revoked: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


# =========================================================================== #
# Fantasy teams, snapshots, transfers, boosts.
# =========================================================================== #

class GLTeam(SQLModel, table=True):
    __tablename__ = "gl_team"

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(index=True, unique=True, foreign_key="gl_profile.id")
    driver_ids: List[int] = Field(default_factory=list, sa_column=Column(JSON))
    constructor_ids: List[int] = Field(default_factory=list, sa_column=Column(JSON))
    captain_id: Optional[int] = None
    active_boost: Optional[str] = None
    boost_driver_id: Optional[int] = None       # target for Turbo
    boost_constructor_id: Optional[int] = None   # target for Pit Wall
    free_transfers: int = 2                       # rolls over, capped
    team_value: float = 100.0
    bank: float = 0.0
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class GLTeamSnapshot(SQLModel, table=True):
    """Immutable team as it stood at a round's deadline. Historical scores are
    computed from snapshots, never from the user's current team."""
    __tablename__ = "gl_team_snapshot"
    __table_args__ = (UniqueConstraint("profile_id", "round_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(index=True, foreign_key="gl_profile.id")
    round_id: int = Field(index=True)
    driver_ids: List[int] = Field(default_factory=list, sa_column=Column(JSON))
    constructor_ids: List[int] = Field(default_factory=list, sa_column=Column(JSON))
    captain_id: Optional[int] = None
    active_boost: Optional[str] = None
    boost_driver_id: Optional[int] = None
    boost_constructor_id: Optional[int] = None
    prices: dict = Field(default_factory=dict, sa_column=Column(JSON))
    team_value: float = 0.0
    transfers_made: int = 0
    transfer_penalty: int = 0
    points: float = 0.0
    state: str = "provisional"       # live / provisional / final
    locked_at: datetime = Field(default_factory=datetime.utcnow)


class GLTransfer(SQLModel, table=True):
    __tablename__ = "gl_transfer"

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(index=True, foreign_key="gl_profile.id")
    round_id: int = Field(index=True)
    asset_type: str = "driver"          # driver / constructor
    sold_id: Optional[int] = None
    bought_id: Optional[int] = None
    sale_price: float = 0.0
    purchase_price: float = 0.0
    free: bool = True
    penalty: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GLBoostUsage(SQLModel, table=True):
    __tablename__ = "gl_boost_usage"
    __table_args__ = (UniqueConstraint("profile_id", "boost_id", "round_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(index=True, foreign_key="gl_profile.id")
    boost_id: str
    round_id: int
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GLScoreEvent(SQLModel, table=True):
    """Auditable fantasy-score ledger. Every final point is explainable and
    idempotent via ``source_event_id``."""
    __tablename__ = "gl_score_event"
    __table_args__ = (
        UniqueConstraint("profile_id", "round_id", "asset_ref", "rule_code", "source_event_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: Optional[int] = Field(default=None, index=True)   # None = catalog (per-driver) event
    season_id: int = Field(index=True)
    round_id: int = Field(index=True)
    session_id: Optional[int] = Field(default=None, index=True)
    driver_id: Optional[int] = None
    constructor_id: Optional[int] = None
    asset_ref: str = ""                 # e.g. "driver:14" / "constructor:3"
    rule_code: str
    phase: str = ""
    description: str = ""
    base_points: float = 0.0
    multiplier: float = 1.0
    points: float = 0.0
    source_event_id: str = ""           # idempotency key from the source event
    state: str = "provisional"          # live / provisional / final
    created_at: datetime = Field(default_factory=datetime.utcnow)
    finalized_at: Optional[datetime] = None


# =========================================================================== #
# Leagues.
# =========================================================================== #

class GLLeague(SQLModel, table=True):
    __tablename__ = "gl_league"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str
    description: str = ""
    privacy: str = "private"
    type: str = "classic"
    start_round: int = 1
    max_members: Optional[int] = None
    creator_profile_id: int = Field(foreign_key="gl_profile.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GLLeagueMember(SQLModel, table=True):
    __tablename__ = "gl_league_member"
    __table_args__ = (UniqueConstraint("league_id", "profile_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    league_id: int = Field(index=True, foreign_key="gl_league.id")
    profile_id: int = Field(index=True, foreign_key="gl_profile.id")
    joined_at: datetime = Field(default_factory=datetime.utcnow)


# =========================================================================== #
# Persisted motorsport data (ingested + normalized).
# =========================================================================== #

class MSeason(SQLModel, table=True):
    __tablename__ = "ms_season"
    id: Optional[int] = Field(default=None, primary_key=True)
    year: int = Field(index=True, unique=True)
    name: str = ""
    provider: str = "mock"


class MConstructor(SQLModel, table=True):
    __tablename__ = "ms_constructor"
    __table_args__ = (UniqueConstraint("season_id", "ext_id"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    season_id: int = Field(index=True, foreign_key="ms_season.id")
    ext_id: str = Field(index=True)
    name: str
    short: str = ""
    color: str = "#888888"


class MDriver(SQLModel, table=True):
    __tablename__ = "ms_driver"
    __table_args__ = (UniqueConstraint("season_id", "ext_id"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    season_id: int = Field(index=True, foreign_key="ms_season.id")
    ext_id: str = Field(index=True)
    name: str
    abbreviation: str = ""
    number: Optional[int] = None
    country: Optional[str] = None
    constructor_id: Optional[int] = Field(default=None, foreign_key="ms_constructor.id")


class MCircuit(SQLModel, table=True):
    __tablename__ = "ms_circuit"
    id: Optional[int] = Field(default=None, primary_key=True)
    ext_id: str = Field(index=True, unique=True)
    name: str
    country: Optional[str] = None
    location: Optional[str] = None


class MRaceWeekend(SQLModel, table=True):
    __tablename__ = "ms_race_weekend"
    __table_args__ = (UniqueConstraint("season_id", "round"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    season_id: int = Field(index=True, foreign_key="ms_season.id")
    round: int = Field(index=True)
    name: str
    slug: str = Field(index=True)
    circuit_id: Optional[int] = Field(default=None, foreign_key="ms_circuit.id")
    country: Optional[str] = None
    is_sprint: bool = False
    start_time: Optional[datetime] = None
    deadline: Optional[datetime] = None
    status: str = "scheduled"   # scheduled/delayed/suspended/cancelled/completed


class MRaceSession(SQLModel, table=True):
    __tablename__ = "ms_race_session"
    __table_args__ = (UniqueConstraint("weekend_id", "kind"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    weekend_id: int = Field(index=True, foreign_key="ms_race_weekend.id")
    ext_id: Optional[str] = Field(default=None, index=True)
    kind: str          # fp1/fp2/fp3/sq/sprint/quali/race
    label: str = ""
    start_time: Optional[datetime] = None
    status: str = "scheduled"


class MStartingGrid(SQLModel, table=True):
    __tablename__ = "ms_starting_grid"
    __table_args__ = (UniqueConstraint("session_id", "driver_id"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="ms_race_session.id")
    driver_id: int = Field(index=True, foreign_key="ms_driver.id")
    grid_position: int


class MSessionResult(SQLModel, table=True):
    __tablename__ = "ms_session_result"
    __table_args__ = (UniqueConstraint("session_id", "driver_id"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="ms_race_session.id")
    driver_id: int = Field(index=True, foreign_key="ms_driver.id")
    position: Optional[int] = None
    status: str = "finished"   # finished/classified/dnf/dns/dsq
    fastest_lap: bool = False
    state: str = "provisional"  # live/provisional/final


class MLapResult(SQLModel, table=True):
    __tablename__ = "ms_lap_result"
    __table_args__ = (UniqueConstraint("session_id", "driver_id", "lap_number"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="ms_race_session.id")
    driver_id: int = Field(index=True, foreign_key="ms_driver.id")
    lap_number: int
    lap_duration: Optional[float] = None
    sector1: Optional[float] = None
    sector2: Optional[float] = None
    sector3: Optional[float] = None


class MPitStop(SQLModel, table=True):
    __tablename__ = "ms_pit_stop"
    __table_args__ = (UniqueConstraint("session_id", "driver_id", "lap_number"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="ms_race_session.id")
    driver_id: int = Field(index=True, foreign_key="ms_driver.id")
    lap_number: int
    pit_duration: Optional[float] = None
    stop_duration: Optional[float] = None


class MRaceEvent(SQLModel, table=True):
    """Race-control / normalized events, idempotent by ``idempotency_key``."""
    __tablename__ = "ms_race_event"
    __table_args__ = (UniqueConstraint("idempotency_key"),)
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="ms_race_session.id")
    idempotency_key: str = Field(index=True)
    category: str = ""
    message: str = ""
    driver_id: Optional[int] = None
    lap_number: Optional[int] = None
    timestamp: Optional[datetime] = None


class MDataSyncRun(SQLModel, table=True):
    __tablename__ = "ms_data_sync_run"
    id: Optional[int] = Field(default=None, primary_key=True)
    provider: str
    scope: str = ""           # e.g. "season", "session:9999"
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None
    status: str = "running"   # running/ok/failed
    records: int = 0
    error: Optional[str] = None
