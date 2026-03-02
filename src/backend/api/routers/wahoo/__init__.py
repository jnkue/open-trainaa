"""
Wahoo Fitness API integration routers.
"""

from .api import router as api_router
from .auth import router as auth_router
from .webhook import router as webhook_router

__all__ = ["auth_router", "api_router", "webhook_router"]
