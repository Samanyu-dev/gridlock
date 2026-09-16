"""SQLModel persistence for GRIDLOCK user state.

Motorsport data (drivers, races, results) is served from the deterministic
provider and never persisted. Only *user-owned* state lives in the database:
profiles, their one fantasy team, private leagues, and memberships. Tables are
prefixed ``gl_`` so they coexist cleanly with anything else in the schema.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlmodel import JSON, Column, Field, SQLModel, UniqueConstraint


class GLProfile(SQLModel, table=True):
    __tablename__ = "gl_profile"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    display_name: str = ""
    team_name: str = "My Grid"
    persona: Optional[str] = None            # casual / strategist / stats / competitor
    country: Optional[str] = None
    favorite_driver_id: Optional[int] = None
    favorite_constructor_id: Optional[int] = None
    public_profile: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class GLTeam(SQLModel, table=True):
    __tablename__ = "gl_team"

    id: Optional[int] = Field(default=None, primary_key=True)
    profile_id: int = Field(index=True, unique=True, foreign_key="gl_profile.id")
    driver_ids: List[int] = Field(default_factory=list, sa_column=Column(JSON))
    constructor_ids: List[int] = Field(default_factory=list, sa_column=Column(JSON))
    captain_id: Optional[int] = None
    active_boost: Optional[str] = None
    free_transfers: int = 2
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class GLLeague(SQLModel, table=True):
    __tablename__ = "gl_league"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str
    description: str = ""
    privacy: str = "private"     # private / public
    type: str = "classic"        # classic / h2h
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
