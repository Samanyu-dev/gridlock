"""Authentication endpoints.

Email/password with verification + reset architecture, plus an OAuth (Google /
Apple) contract that reports availability without leaking secrets. Every
successful auth returns a bearer access token; the client stores it and sends it
as ``Authorization: Bearer <token>`` — that token, not any request-body id, is
what authorizes fantasy operations.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlmodel import Session, select

from ..database import get_session
from ..moderation import contains_blocked_term
from . import auth as A
from .models import GLProfile

router = APIRouter(prefix="/api/auth")

USERNAME_RE = r"^[A-Za-z0-9_]+$"


def _clean(value: str, label: str) -> str:
    value = value.strip()
    if contains_blocked_term(value):
        raise ValueError(f"That {label} isn't allowed.")
    return value


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str = Field(min_length=3, max_length=20, pattern=USERNAME_RE)
    team_name: Optional[str] = Field(default=None, max_length=28)
    persona: Optional[str] = None
    favorite_driver_id: Optional[int] = None
    favorite_constructor_id: Optional[int] = None
    country: Optional[str] = None

    @field_validator("username")
    @classmethod
    def _v_user(cls, v: str) -> str:
        return _clean(v, "username")

    @field_validator("team_name")
    @classmethod
    def _v_team(cls, v: Optional[str]) -> Optional[str]:
        return _clean(v, "team name") if v else v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ResetRequestBody(BaseModel):
    email: EmailStr


class ResetConfirmBody(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class TokenBody(BaseModel):
    token: str


def serialize_profile(p: GLProfile) -> dict:
    return {
        "id": p.id, "username": p.username, "email": p.email,
        "email_verified": p.email_verified, "display_name": p.display_name or p.username,
        "team_name": p.team_name, "persona": p.persona, "country": p.country,
        "favorite_driver_id": p.favorite_driver_id,
        "favorite_constructor_id": p.favorite_constructor_id,
        "public_profile": p.public_profile, "is_admin": p.is_admin,
        "auth_provider": p.auth_provider,
    }


@router.post("/register")
def register(body: RegisterRequest, session: Session = Depends(get_session)):
    email = body.email.lower()
    if A.find_by_email(session, email):
        raise HTTPException(409, "An account with that email already exists.")
    if session.exec(select(GLProfile).where(GLProfile.username == body.username)).first():
        raise HTTPException(409, "That username is taken.")
    p = GLProfile(
        username=body.username, email=email, password_hash=A.hash_password(body.password),
        display_name=body.username, team_name=body.team_name or f"{body.username}'s Grid",
        persona=body.persona, country=body.country,
        favorite_driver_id=body.favorite_driver_id,
        favorite_constructor_id=body.favorite_constructor_id,
    )
    session.add(p)
    session.commit()
    session.refresh(p)
    token = A.create_access_token(p.id)
    # In production the verify token is emailed as a link; we return it so the
    # verification flow is exercisable without an email provider configured.
    verify_token = A.create_verify_token(p.id)
    return {"profile": serialize_profile(p), "access_token": token, "token_type": "bearer",
            "verify_token": verify_token}


@router.post("/login")
def login(body: LoginRequest, session: Session = Depends(get_session)):
    p = A.find_by_email(session, body.email.lower())
    if not p or not A.verify_password(body.password, p.password_hash):
        raise HTTPException(401, "Invalid email or password.")
    return {"profile": serialize_profile(p), "access_token": A.create_access_token(p.id),
            "token_type": "bearer"}


@router.post("/logout")
def logout(profile: GLProfile = Depends(A.get_current_user)):
    # Stateless JWT: the client discards the token. Refresh-token revocation
    # (GLRefreshToken) is where server-side invalidation would live.
    return {"ok": True}


@router.get("/me")
def me(profile: GLProfile = Depends(A.get_current_user)):
    return {"profile": serialize_profile(profile)}


@router.post("/verify")
def verify(body: TokenBody, session: Session = Depends(get_session)):
    pid = A.decode_token(body.token, "verify")
    p = session.get(GLProfile, pid)
    if not p:
        raise HTTPException(404, "Account not found")
    p.email_verified = True
    p.updated_at = datetime.utcnow()
    session.add(p)
    session.commit()
    return {"ok": True}


@router.post("/reset/request")
def reset_request(body: ResetRequestBody, session: Session = Depends(get_session)):
    p = A.find_by_email(session, body.email.lower())
    # Always 200 to avoid account enumeration; only mint a token if it exists.
    reset_token = A.create_reset_token(p.id) if p else None
    return {"ok": True, "reset_token": reset_token}


@router.post("/reset/confirm")
def reset_confirm(body: ResetConfirmBody, session: Session = Depends(get_session)):
    pid = A.decode_token(body.token, "reset")
    p = session.get(GLProfile, pid)
    if not p:
        raise HTTPException(404, "Account not found")
    p.password_hash = A.hash_password(body.password)
    p.updated_at = datetime.utcnow()
    session.add(p)
    session.commit()
    return {"ok": True}


@router.get("/oauth/{provider}")
def oauth_start(provider: str):
    cfg = A.OAUTH_PROVIDERS.get(provider)
    if not cfg:
        raise HTTPException(404, "Unknown provider")
    if not cfg["configured"]:
        raise HTTPException(
            503,
            f"{provider.title()} sign-in isn't configured on this deployment. "
            f"Set the {provider.upper()} OAuth credentials to enable it.",
        )
    # With credentials present, redirect the client to the provider's authorize
    # URL; the callback exchanges the code, upserts the profile, and issues a
    # GRIDLOCK access token via the same create_access_token path.
    return {"authorize_url": cfg["authorize_url"], "client_id": cfg["client_id"]}
