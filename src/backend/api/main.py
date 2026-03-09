"""
FastAPI Backend for the Coach Application

"""

import os
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict

import psycopg2
import requests
import sentry_sdk
from api.log import LOGGER
from api.version import APP_VERSION, MIN_SUPPORTED_VERSION
from api.routers import (
    activities_router,
    chat_router,
    invitation_codes_router,
    strava_api_router,
    strava_auth_router,
    wahoo_api_router,
    wahoo_auth_router,
    wahoo_webhook_router,
    garmin_api_router,
    garmin_auth_router,
    garmin_webhook_router,
)
from api.routers.ai_tools import router as ai_tools_router
from api.routers.training_status import router as training_status_router
from api.routers.user_feedback import router as user_feedback_router
from api.routers.user_infos import router as user_infos_router
from api.routers.subscriptions import router as subscriptions_router
from api.routers.revenuecat_webhook import router as revenuecat_webhook_router
from api.routers.push_tokens import router as push_tokens_router
from api.routers.stripe_billing import router as stripe_billing_router
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from api.routers.workouts import router as workouts_router


"""
to run locally:
uv run python3 -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000 --log-config logging_config.yaml

"""

load_dotenv()  # Load environment variables from .env file


# Validate required environment variables
def validate_environment():
    """Validate that all required environment variables are set."""
    required_vars = {
        "ENVIRONMENT": "Must be set to 'production', 'staging', or 'development'",
        "BACKEND_BASE_URL": "Backend URL for API operations",
        "PRIVATE_OPENROUTER_API_KEY": "OpenRouter API key for AI operations",
        "PUBLIC_SUPABASE_URL": "Supabase project URL",
        "PRIVATE_SUPABASE_KEY": "Supabase service role key",
        "CHAT_HISTORY_DB_CONN_STRING": "Database connection string for chat history",
        "ACTIVITY_DB_CONN_STRING": "Database connection string for activities",
    }

    missing_vars = []
    for var, description in required_vars.items():
        if not os.getenv(var):
            missing_vars.append(f"  - {var}: {description}")

    if missing_vars:
        error_msg = "Missing required environment variables:\n" + "\n".join(
            missing_vars
        )
        LOGGER.error(f"❌ {error_msg}")
        sys.exit(1)

    # Validate ENVIRONMENT value
    env = os.getenv("ENVIRONMENT")
    if env not in ["production", "staging", "development"]:
        LOGGER.error(
            f"❌ ENVIRONMENT must be 'production', 'staging', or 'development', got: {env}"
        )
        sys.exit(1)

    LOGGER.info(f"✅ Environment validation passed (ENVIRONMENT={env})")


# Validate on startup
validate_environment()

# Environment variables
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL")
ENVIRONMENT = os.getenv("ENVIRONMENT")
# Support multiple frontend URLs (comma-separated for production mobile apps)
FRONTEND_URLS = os.getenv("FRONTEND_URLS", "http://localhost:8081")
# Scheduler control - set to "true" to run the workout sync scheduler in this process
RUN_SCHEDULER = os.getenv("RUN_SCHEDULER", "false").lower() == "true"

# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)


# Request size limits (in bytes)
MAX_REQUEST_SIZE = 50 * 1024 * 1024  # 50MB for FIT file uploads


sentry_sdk.init(
    dsn="https://2c2ab000f64cc8b18253cc84d48b9b65@o4510143973752832.ingest.de.sentry.io/4510143975981136",
    # Add data like request headers and IP for users,
    # see https://docs.sentry.io/platforms/python/data-management/data-collected/ for more info
    send_default_pii=True,
    # Enable sending logs to Sentry
    enable_logs=True,
    # Set traces_sample_rate to 1.0 to capture 100%
    # of transactions for tracing.
    traces_sample_rate=1.0,
    # Set profile_session_sample_rate to 1.0 to profile 100%
    # of profile sessions.
    profile_session_sample_rate=1.0,
    # Set profile_lifecycle to "trace" to automatically
    # run the profiler on when there is an active transaction
    profile_lifecycle="trace",
    environment=ENVIRONMENT,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager to handle startup and shutdown events."""
    # Startup actions
    LOGGER.info("🚀 Starting up the FastAPI application...")

    # Test Redis connection on startup
    try:
        from api.redis import test_redis_connection

        if test_redis_connection():
            LOGGER.info("✅ Redis connection successful")
        else:
            LOGGER.warning(
                "⚠️ Redis connection failed - PKCE verifier storage may not work"
            )
    except Exception as e:
        LOGGER.error(f"⚠️ Redis connection check failed: {e}")

    # Start unified workout sync scheduler (only if RUN_SCHEDULER is enabled)
    scheduler_started = False
    if RUN_SCHEDULER:
        try:
            from api.workers.workout_sync_worker import (
                start_scheduler,
                SYNC_INTERVAL_MINUTES,
            )

            start_scheduler()
            scheduler_started = True
            LOGGER.info(
                f"✅ Workout sync scheduler started for all providers (interval: {SYNC_INTERVAL_MINUTES} minutes)"
            )
        except Exception as e:
            LOGGER.error(f"⚠️ Failed to start workout sync scheduler: {e}")
    else:
        LOGGER.info("ℹ️ Workout sync scheduler disabled (RUN_SCHEDULER=false)")

    yield

    # Shutdown actions
    LOGGER.info("🛑 Shutting down the FastAPI application...")

    # Stop unified workout sync scheduler (only if it was started)
    if scheduler_started:
        try:
            from api.workers.workout_sync_worker import scheduler

            scheduler.shutdown(wait=False)
            LOGGER.info("✅ Workout sync scheduler stopped")
        except Exception as e:
            LOGGER.error(f"Error stopping workout sync scheduler: {e}")

    # Cleanup agent resources (connection pools, etc.)
    try:
        from agent.core.singletons import cleanup_resources

        await cleanup_resources()
        LOGGER.info("✅ Agent resources cleaned up successfully")
    except Exception as e:
        LOGGER.error(f"Error during resource cleanup: {e}")


# Create FastAPI app with API prefix
app = FastAPI(
    title="trainaa.com",
    description="Endpoints for the TRAINAA application - fitness tracking, AI coaching, and training planning.",
    root_path="/v1",
    version=APP_VERSION,
    lifespan=lifespan,
)


# Request size limit middleware
class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Enforce maximum request size to prevent abuse."""

    async def dispatch(self, request: Request, call_next):
        # Check content length if provided
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_SIZE:
            return JSONResponse(
                status_code=413,
                content={
                    "detail": f"Request body too large. Maximum size is {MAX_REQUEST_SIZE / (1024 * 1024):.0f}MB"
                },
            )
        return await call_next(request)


# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=()"
        )
        return response


# CORS configuration based on environment
def get_cors_origins():
    """Get allowed CORS origins based on environment."""
    # Parse comma-separated URLs
    configured_urls = [url.strip() for url in FRONTEND_URLS.split(",") if url.strip()]
    return configured_urls if configured_urls else []


# Add middlewares (order matters - first added is outermost)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# Add rate limiting
app.state.limiter = limiter


# Custom rate limit exceeded handler
def rate_limit_handler(request, exc):
    """Custom handler for rate limit exceeded exceptions."""
    if isinstance(exc, RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Please try again later."},
        )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

# Include routers
app.include_router(ai_tools_router)  # AI tools: /ai-tools/
app.include_router(chat_router)  # WebSocket endpoints: /ws/, threads: /chat/threads/
app.include_router(invitation_codes_router)  # Invitation codes: /invitation-codes/
app.include_router(strava_auth_router)  # Strava auth: /strava/auth/
app.include_router(strava_api_router)  # Strava API: /strava/api/ (sync only)
app.include_router(wahoo_auth_router)  # Wahoo auth: /wahoo/auth/
app.include_router(wahoo_api_router)  # Wahoo API: /wahoo/api/ (sync and upload)
app.include_router(wahoo_webhook_router)  # Wahoo webhook: /wahoo/webhook/
app.include_router(garmin_auth_router)  # Garmin auth: /garmin/auth/
app.include_router(garmin_api_router)  # Garmin API: /garmin/api/ (sync and upload)
app.include_router(garmin_webhook_router)  # Garmin webhook: /garmin/webhook/
app.include_router(activities_router)  # Central activities: /activities/
app.include_router(training_status_router)  # Training status: /training-status/
app.include_router(user_infos_router)  # User attributes: /user-attributes/
app.include_router(user_feedback_router)  # User feedback: /user-feedback/
app.include_router(workouts_router)  # Workouts and planned workouts: /workouts/
app.include_router(subscriptions_router)  # Subscriptions: /subscriptions/
app.include_router(
    revenuecat_webhook_router
)  # RevenueCat webhooks: /webhooks/revenuecat/
app.include_router(push_tokens_router)  # Push tokens: /push-tokens/
app.include_router(stripe_billing_router)  # Stripe billing: /stripe/


# Root endpoint
@app.get("/")
async def get_root():
    """Root endpoint to verify API is running."""
    return {
        "status": "running",
        "service": "Coach API",
        "version": APP_VERSION,
        "environment": ENVIRONMENT,
    }


# Health check helpers
async def check_database(conn_string: str, name: str) -> Dict[str, Any]:
    """Check database connectivity."""
    try:
        start_time = time.time()
        conn = psycopg2.connect(conn_string)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        conn.close()
        response_time = (time.time() - start_time) * 1000  # ms

        return {
            "status": "healthy",
            "response_time_ms": round(response_time, 2),
            "message": "Database connection successful",
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "message": f"Database connection failed: {name}",
        }


async def check_openrouter() -> Dict[str, Any]:
    """Check OpenRouter API connectivity."""
    try:
        api_key = os.getenv("PRIVATE_OPENROUTER_API_KEY")
        if not api_key:
            return {
                "status": "unhealthy",
                "error": "API key not configured",
                "message": "PRIVATE_OPENROUTER_API_KEY not set",
            }

        start_time = time.time()
        response = requests.get(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=5,
        )
        response_time = (time.time() - start_time) * 1000  # ms

        if response.status_code == 200:
            return {
                "status": "healthy",
                "response_time_ms": round(response_time, 2),
                "message": "OpenRouter API accessible",
            }
        else:
            return {
                "status": "unhealthy",
                "status_code": response.status_code,
                "message": "OpenRouter API returned non-200 status",
            }
    except requests.RequestException as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "message": "OpenRouter API connection failed",
        }


async def check_supabase() -> Dict[str, Any]:
    """Check Supabase API connectivity."""
    try:
        supabase_url = os.getenv("PUBLIC_SUPABASE_URL")
        supabase_key = os.getenv("PRIVATE_SUPABASE_KEY")

        if not supabase_url or not supabase_key:
            return {
                "status": "unhealthy",
                "error": "Configuration missing",
                "message": "Supabase credentials not configured",
            }

        start_time = time.time()
        response = requests.get(
            f"{supabase_url}/rest/v1/",
            headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
            timeout=5,
        )
        response_time = (time.time() - start_time) * 1000  # ms

        if response.status_code in [200, 404]:  # 404 is OK, means API is up
            return {
                "status": "healthy",
                "response_time_ms": round(response_time, 2),
                "message": "Supabase API accessible",
            }
        else:
            return {
                "status": "unhealthy",
                "status_code": response.status_code,
                "message": "Supabase API returned unexpected status",
            }
    except requests.RequestException as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "message": "Supabase API connection failed",
        }


async def check_redis() -> Dict[str, Any]:
    """Check Redis connectivity."""
    try:
        from api.redis import test_redis_connection, redis_client

        if redis_client is None:
            return {
                "status": "unhealthy",
                "error": "Redis client not initialized",
                "message": "Redis connection pool failed to initialize",
            }

        start_time = time.time()
        is_connected = test_redis_connection()
        response_time = (time.time() - start_time) * 1000  # ms

        if is_connected:
            return {
                "status": "healthy",
                "response_time_ms": round(response_time, 2),
                "message": "Redis connection successful",
            }
        else:
            return {
                "status": "unhealthy",
                "message": "Redis ping failed",
            }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "message": "Redis health check failed",
        }


# Health check endpoint
@app.get("/health")
async def health_check():
    """
    Comprehensive health check endpoint for monitoring.
    Checks all external dependencies: databases, APIs, etc.
    """
    start_time = time.time()

    # Get connection strings
    chat_db_conn = os.getenv("CHAT_HISTORY_DB_CONN_STRING")
    activity_db_conn = os.getenv("ACTIVITY_DB_CONN_STRING")

    # Check all dependencies
    checks = {
        "chat_database": await check_database(chat_db_conn, "chat_history")
        if chat_db_conn
        else {"status": "unhealthy", "error": "Not configured"},
        "activity_database": await check_database(activity_db_conn, "activity")
        if activity_db_conn
        else {"status": "unhealthy", "error": "Not configured"},
        "openrouter": await check_openrouter(),
        "supabase": await check_supabase(),
        "redis": await check_redis(),
    }

    # Determine overall status
    all_healthy = all(check["status"] == "healthy" for check in checks.values())
    any_unhealthy = any(check["status"] == "unhealthy" for check in checks.values())

    if all_healthy:
        overall_status = "healthy"
        http_status = 200
    elif any_unhealthy:
        overall_status = "unhealthy"
        http_status = 503  # Service Unavailable
    else:
        overall_status = "degraded"
        http_status = 200  # Still operational but degraded

    total_time = (time.time() - start_time) * 1000

    response_data = {
        "status": overall_status,
        "timestamp": datetime.utcnow().isoformat(),
        "environment": ENVIRONMENT,
        "version": APP_VERSION,
        "checks": checks,
        "response_time_ms": round(total_time, 2),
    }

    return JSONResponse(status_code=http_status, content=response_data)


@app.get("/versioncheck")
async def version_check(version: str):
    """Check if the provided version is still supported. if not returns false and user should update."""
    from packaging.version import Version, InvalidVersion

    try:
        client_version = Version(version)
        min_version = Version(MIN_SUPPORTED_VERSION)
    except InvalidVersion:
        LOGGER.warning(f"Invalid version format: {version}")
        return {
            "version": version,
            "is_supported": False,
            "latest_version": APP_VERSION,
            "message": "Invalid version format. Please update to the latest version.",
        }

    is_supported = client_version >= min_version

    if not is_supported:
        LOGGER.warning(f"Unsupported version detected: {version}")
        return {
            "version": version,
            "is_supported": False,
            "latest_version": APP_VERSION,
            "message": "Please update to the latest version.",
        }
    return {
        "version": version,
        "is_supported": True,
        "latest_version": APP_VERSION,
        "message": "Your version is supported.",
    }
