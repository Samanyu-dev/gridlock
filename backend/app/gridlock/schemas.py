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


class TeamPayload(BaseModel):
    # Identity comes from the auth token, never this body.
    driver_ids: List[int]
    constructor_ids: List[int]
    captain_id: Optional[int] = None
    active_boost: Optional[str] = None
    boost_driver_id: Optional[int] = None
    boost_constructor_id: Optional[int] = None


class ValidateTeamRequest(BaseModel):
    driver_ids: List[int]
    constructor_ids: List[int]
    captain_id: Optional[int] = None


class CreateLeagueRequest(BaseModel):
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
    code: str
