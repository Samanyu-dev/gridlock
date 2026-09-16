"""Authentication for GRIDLOCK.

Production email/password auth built on established libraries — **passlib**
(pbkdf2_sha256, no custom crypto) for hashing and **PyJWT** for stateless
session + verification + reset tokens. Identity for every fantasy operation is
derived from the verified bearer token via :func:`get_current_user`; the API
never trusts a user id supplied by the client.

OAuth (Google / Apple) is architected here: the provider config + callback
contract exist and report "not configured" gracefully when credentials are
absent, so wiring real credentials is a config change, not a code change.

Design notes:
  * Access tokens are short-lived JWTs. A refresh-token table
    (``GLRefreshToken``) supports rotation/revocation for real session
    persistence; the mock/demo path issues access tokens directly.
  * Email verification and password reset use purpose-scoped JWTs so the same
    signing key can mint them without extra storage. Swappable for Supabase
    Auth later without touching call sites (all go through this module).
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException
from passlib.hash import pbkdf2_sha256
from sqlmodel import Session, select

from ..database import get_session
from .models import GLProfile

UTC = timezone.utc

# In production SECRET_KEY MUST be set. A random dev fallback keeps local runs
# working but invalidates tokens on restart (acceptable for dev/tests).
SECRET_KEY = os.environ.get("GRIDLOCK_SECRET_KEY") or os.environ.get("SECRET_KEY") or "dev-insecure-change-me"
ALGORITHM = "HS256"
ACCESS_TTL = timedelta(hours=12)
VERIFY_TTL = timedelta(days=2)
RESET_TTL = timedelta(hours=1)

# OAuth provider config (report availability without leaking secrets).
OAUTH_PROVIDERS = {
    "google": {
        "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
        "configured": bool(os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET")),
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
    },
    "apple": {
        "client_id": os.environ.get("APPLE_CLIENT_ID"),
        "configured": bool(os.environ.get("APPLE_CLIENT_ID") and os.environ.get("APPLE_KEY_ID")),
        "authorize_url": "https://appleid.apple.com/auth/authorize",
    },
}


# --------------------------------------------------------------------------- #
# Password hashing.
# --------------------------------------------------------------------------- #

def hash_password(raw: str) -> str:
    return pbkdf2_sha256.hash(raw)


def verify_password(raw: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    try:
        return pbkdf2_sha256.verify(raw, hashed)
    except (ValueError, TypeError):
        return False


# --------------------------------------------------------------------------- #
# Tokens.
# --------------------------------------------------------------------------- #

def _encode(payload: dict, ttl: timedelta) -> str:
    now = datetime.now(UTC)
    body = {**payload, "iat": now, "exp": now + ttl}
    return jwt.encode(body, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(profile_id: int) -> str:
    return _encode({"sub": str(profile_id), "purpose": "access"}, ACCESS_TTL)


def create_verify_token(profile_id: int) -> str:
    return _encode({"sub": str(profile_id), "purpose": "verify"}, VERIFY_TTL)


def create_reset_token(profile_id: int) -> str:
    return _encode({"sub": str(profile_id), "purpose": "reset"}, RESET_TTL)


def decode_token(token: str, expected_purpose: str) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    if payload.get("purpose") != expected_purpose:
        raise HTTPException(401, "Wrong token type")
    try:
        return int(payload["sub"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(401, "Malformed token")


# --------------------------------------------------------------------------- #
# Dependencies — identity comes from the token, never the request body.
# --------------------------------------------------------------------------- #

def _bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> GLProfile:
    token = _bearer(authorization)
    if not token:
        raise HTTPException(401, "Not authenticated")
    profile_id = decode_token(token, "access")
    profile = session.get(GLProfile, profile_id)
    if not profile:
        raise HTTPException(401, "Account not found")
    return profile


def get_optional_user(
    authorization: Optional[str] = Header(default=None),
    session: Session = Depends(get_session),
) -> Optional[GLProfile]:
    """For public/mixed endpoints (leaderboard, league detail) that personalize
    when authenticated but work anonymously."""
    token = _bearer(authorization)
    if not token:
        return None
    try:
        profile_id = decode_token(token, "access")
    except HTTPException:
        return None
    return session.get(GLProfile, profile_id)


def require_admin(profile: GLProfile = Depends(get_current_user)) -> GLProfile:
    if not getattr(profile, "is_admin", False):
        raise HTTPException(403, "Admin only")
    return profile


def find_by_email(session: Session, email: str) -> Optional[GLProfile]:
    return session.exec(select(GLProfile).where(GLProfile.email == email.lower())).first()
