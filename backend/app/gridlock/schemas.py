"""Request/response models for the GRIDLOCK API."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from ..moderation import contains_blocked_term

USERNAME_RE = r"^[A-Za-z0-9_]+$"


def _clean(value: str, label: str) -> str:
    value = value.strip()
    if contains_blocked_term(value):
        raise ValueError(f"That {label} isn't allowed.")
    return value


class AuthRequest(BaseModel):
    username: str = Field(min_length=3, max_length=20, pattern=USERNAME_RE)
    persona: Optional[str] = None
    favorite_driver_id: Optional[int] = None
    favorite_constructor_id: Optional[int] = None
    team_name: Optional[str] = Field(default=None, max_length=28)
    country: Optional[str] = None

    @field_validator("username")
    @classmethod
    def _v_username(cls, v: str) -> str:
        return _clean(v, "username")

    @field_validator("team_name")
    @classmethod
    def _v_team(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = _clean(v, "team name")
        if len(v) < 2:
            raise ValueError("Team name is too short.")
        return v


class TeamPayload(BaseModel):
    username: str
    driver_ids: List[int]
    constructor_ids: List[int]
    captain_id: Optional[int] = None
    active_boost: Optional[str] = None


class ValidateTeamRequest(BaseModel):
    driver_ids: List[int]
    constructor_ids: List[int]
    captain_id: Optional[int] = None


class CreateLeagueRequest(BaseModel):
    username: str
    name: str = Field(min_length=3, max_length=40)
    description: str = Field(default="", max_length=160)
    privacy: str = "private"
    type: str = "classic"
    start_round: int = 1
    max_members: Optional[int] = None

    @field_validator("name")
    @classmethod
    def _v_name(cls, v: str) -> str:
        return _clean(v, "league name")


class JoinLeagueRequest(BaseModel):
    username: str
    code: str
