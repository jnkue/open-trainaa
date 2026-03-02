"""
Routers package for the Coach FastAPI application.
"""

from .activities import router as activities_router
from .chat import router as chat_router
from .invitation_codes import router as invitation_codes_router
from .strava.api import router as strava_api_router
from .strava.auth import router as strava_auth_router
from .wahoo.api import router as wahoo_api_router
from .wahoo.auth import router as wahoo_auth_router
from .wahoo.webhook import router as wahoo_webhook_router
from .garmin.api import router as garmin_api_router
from .garmin.auth import router as garmin_auth_router
from .garmin.webhook import router as garmin_webhook_router

__all__ = [
    "chat_router",
    "invitation_codes_router",
    "strava_auth_router",
    "strava_api_router",
    "wahoo_auth_router",
    "wahoo_api_router",
    "wahoo_webhook_router",
    "garmin_auth_router",
    "garmin_api_router",
    "garmin_webhook_router",
    "activities_router",
]
