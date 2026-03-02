"""
Authentication middleware for FastAPI backend
"""

import os
from typing import Optional
from functools import lru_cache
import ssl
import certifi

import jwt
from jwt import PyJWKClient
from api.log import LOGGER
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from supabase import Client, create_client

# Load environment variables
load_dotenv()

# Initialize Supabase client
SUPABASE_URL = os.getenv("PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv(
    "PRIVATE_SUPABASE_KEY"
)  # Server role key for admin operations


if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("Missing required Supabase environment variables")

assert SUPABASE_URL is not None
assert SUPABASE_SERVICE_KEY is not None

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# JWKS client for ES256/RS256 verification (new signing keys)
@lru_cache(maxsize=1)
def get_jwks_client() -> PyJWKClient:
    """Get JWKS client for fetching public keys from Supabase.

    Uses certifi for SSL certificate verification to avoid macOS SSL issues.
    """
    jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"

    # Set default SSL context to use certifi certificates
    # This fixes "certificate verify failed" errors on macOS
    try:
        import urllib.request

        ssl_context = ssl.create_default_context(cafile=certifi.where())
        urllib.request.install_opener(
            urllib.request.build_opener(
                urllib.request.HTTPSHandler(context=ssl_context)
            )
        )
    except Exception as e:
        LOGGER.warning(f"Failed to set SSL context with certifi: {e}")

    # Cache keys and set a reasonable timeout
    return PyJWKClient(jwks_url, cache_keys=True, timeout=10)


security = HTTPBearer(auto_error=False)


class User:
    def __init__(self, id: str, email: str, user_metadata: Optional[dict] = None):
        self.id = id
        self.email = email
        self.user_metadata = user_metadata or {}


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> User:
    """
    Verify Supabase JWT token and return current user
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header required")

    try:
        token = credentials.credentials
        # Check if token has the expected JWT format (3 parts separated by dots)
        if not token or len(token.split(".")) != 3:
            raise HTTPException(
                status_code=401,
                detail="Invalid token format: JWT must have 3 segments separated by dots",
            )

        # Verify token using JWKS (Supabase signing keys)
        jwks_client = get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
        )

        user_id = payload.get("sub")
        email = payload.get("email")

        if not user_id:
            raise HTTPException(
                status_code=401, detail="Invalid token: missing user ID"
            )

        if not email:
            raise HTTPException(status_code=401, detail="Invalid token: missing email")

        return User(
            id=user_id, email=email, user_metadata=payload.get("user_metadata", {})
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        LOGGER.warning(f"Invalid token: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")
    except HTTPException:
        raise  # Re-raise HTTPExceptions as they are
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


def verify_user_access(user_id: str, current_user: User) -> None:
    """
    Verify that the current user can access resources for the given user_id
    """
    if current_user.id != user_id:
        raise HTTPException(
            status_code=403, detail="Access denied: insufficient permissions"
        )


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[User]:
    """
    Optional authentication - returns None if no valid token provided
    Used for endpoints that can work with or without authentication
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


async def get_authenticated_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    Get authenticated user and return as dict for compatibility
    """
    user = await get_current_user(credentials)
    return {"id": user.id, "email": user.email, "user_metadata": user.user_metadata}
