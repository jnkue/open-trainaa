"""
Strava package initialization
"""

from .api import router as api_router
from .auth import router as auth_router

__all__ = ["auth_router", "api_router"]
