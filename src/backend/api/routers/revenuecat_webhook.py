"""
RevenueCat webhook endpoint for syncing subscription status.

This endpoint receives webhooks from RevenueCat when subscription status changes,
then fetches the latest subscriber data from RevenueCat API and syncs it to our database.

Reference: https://www.revenuecat.com/docs/integrations/webhooks
"""

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Request, HTTPException
from api.database import supabase
from api.log import LOGGER
from api.utils.subscription_limits import pick_active_subscription_store

router = APIRouter(prefix="/webhooks/revenuecat", tags=["webhooks"])

REVENUECAT_API_KEY = os.getenv("REVENUECAT_API_KEY")
REVENUECAT_PROJECT_ID = os.getenv("REVENUECAT_PROJECT_ID")
REVENUECAT_WEBHOOK_SECRET = os.getenv("REVENUECAT_WEBHOOK_SECRET")


async def fetch_subscription_store(app_user_id: str) -> Optional[str]:
    """
    Fetch the subscription store type from RevenueCat subscriptions endpoint.

    Args:
        app_user_id: The user ID (UUID)

    Returns:
        Store type ('stripe', 'app_store', 'play_store') or None if not found
    """
    if not REVENUECAT_API_KEY or not REVENUECAT_PROJECT_ID:
        return None

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.revenuecat.com/v2/projects/{REVENUECAT_PROJECT_ID}/customers/{app_user_id}/subscriptions",
                headers={
                    "Authorization": f"Bearer {REVENUECAT_API_KEY}",
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )

            if response.status_code != 200:
                LOGGER.warning(
                    f"Could not fetch subscriptions for {app_user_id}: {response.status_code}"
                )
                return None

            data = response.json()
            items = data.get("items", [])

            store = pick_active_subscription_store(items)
            if store:
                LOGGER.info(f"Found subscription store for {app_user_id}: {store}")
            return store

    except Exception as e:
        LOGGER.warning(f"Error fetching subscription store for {app_user_id}: {e}")
        return None


async def fetch_subscriber_from_revenuecat(app_user_id: str) -> Dict[str, Any]:
    """
    Fetch the latest subscriber data from RevenueCat REST API V2.

    Args:
        app_user_id: The user ID (UUID)

    Returns:
        Dictionary with subscriber data from RevenueCat

    Raises:
        HTTPException: If API call fails
    """
    if not REVENUECAT_API_KEY:
        raise HTTPException(status_code=500, detail="REVENUECAT_API_KEY not configured")

    if not REVENUECAT_PROJECT_ID:
        raise HTTPException(
            status_code=500, detail="REVENUECAT_PROJECT_ID not configured"
        )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.revenuecat.com/v2/projects/{REVENUECAT_PROJECT_ID}/customers/{app_user_id}",
                headers={
                    "Authorization": f"Bearer {REVENUECAT_API_KEY}",
                    "Content-Type": "application/json",
                },
                timeout=10.0,
            )

            if response.status_code == 404:
                # User not found in RevenueCat
                return {"subscriber": {"entitlements": {}}}

            if response.status_code != 200:
                LOGGER.error(
                    f"RevenueCat API error (status {response.status_code}): {response.text}"
                )
                raise HTTPException(
                    status_code=502,
                    detail=f"RevenueCat API returned status {response.status_code}",
                )

            data = response.json()
            LOGGER.info(f"🔍 RevenueCat V2 API response for {app_user_id}: {data}")
            return data

    except httpx.TimeoutException:
        LOGGER.error(f"RevenueCat API timeout for user {app_user_id}")
        raise HTTPException(status_code=504, detail="RevenueCat API timeout")
    except httpx.HTTPError as e:
        LOGGER.error(f"HTTP error fetching subscriber {app_user_id}: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch from RevenueCat")


def check_pro_status(subscriber_data: Dict[str, Any]) -> bool:
    """
    Check if the user has an active PRO subscription based on RevenueCat V2 API data.

    Args:
        subscriber_data: Raw customer data from RevenueCat V2 API

    Returns:
        True if user has active entitlements, False otherwise
    """
    LOGGER.info("🔍 Checking PRO status from V2 data")

    # V2 API returns active_entitlements as a list object
    active_entitlements = subscriber_data.get("active_entitlements", {})
    items = active_entitlements.get("items", [])

    LOGGER.info(f"🔍 Active entitlements items: {items}")

    # If there are any active entitlements, user is PRO
    if items and len(items) > 0:
        # Check each entitlement's expiration
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        for item in items:
            entitlement_id = item.get("entitlement_id")
            expires_at = item.get("expires_at")  # milliseconds timestamp

            LOGGER.info(
                f"🔍 Entitlement {entitlement_id}: expires_at={expires_at}, now_ms={now_ms}"
            )

            # If expires_at is None or in the future, it's active
            if expires_at is None:
                LOGGER.info(f"✅ Lifetime entitlement detected: {entitlement_id}")
                return True

            if expires_at > now_ms:
                expires_dt = datetime.fromtimestamp(expires_at / 1000, tz=timezone.utc)
                LOGGER.info(
                    f"✅ Active entitlement detected: {entitlement_id}, expires at {expires_dt}"
                )
                return True
            else:
                expires_dt = datetime.fromtimestamp(expires_at / 1000, tz=timezone.utc)
                LOGGER.info(
                    f"⏰ Expired entitlement: {entitlement_id}, expired at {expires_dt}"
                )

    LOGGER.warning("❌ No active entitlements found")
    return False


async def sync_subscription_status(app_user_id: str) -> None:
    """
    Sync subscription status from RevenueCat to our database.

    Args:
        app_user_id: The user ID (UUID)
    """
    try:
        # Fetch latest subscriber data from RevenueCat
        subscriber_data = await fetch_subscriber_from_revenuecat(app_user_id)

        # Determine if user is PRO
        is_pro = check_pro_status(subscriber_data)

        # Fetch subscription store (stripe, app_store, play_store)
        subscription_store = (
            await fetch_subscription_store(app_user_id) if is_pro else None
        )

        # Update user_infos table
        result = (
            supabase.table("user_infos")
            .update(
                {
                    "is_pro_subscriber": is_pro,
                    "revenuecat_subscriber_data": subscriber_data,
                    "subscription_store": subscription_store,
                    "subscription_last_synced_at": datetime.now(
                        timezone.utc
                    ).isoformat(),
                }
            )
            .eq("user_id", app_user_id)
            .execute()
        )

        # If user_infos doesn't exist, create it
        if not result.data:
            LOGGER.info(f"Creating user_infos record for {app_user_id}")
            supabase.table("user_infos").insert(
                {
                    "user_id": app_user_id,
                    "is_pro_subscriber": is_pro,
                    "revenuecat_subscriber_data": subscriber_data,
                    "subscription_store": subscription_store,
                    "subscription_last_synced_at": datetime.now(
                        timezone.utc
                    ).isoformat(),
                }
            ).execute()

        LOGGER.info(
            f"✅ Synced subscription for user {app_user_id}: is_pro={is_pro}, store={subscription_store}"
        )

    except Exception as e:
        LOGGER.error(f"Failed to sync subscription for user {app_user_id}: {e}")
        raise


@router.post("")
async def revenuecat_webhook(request: Request):
    """
    Handle RevenueCat webhook events.

    RevenueCat sends webhooks for various events (purchase, renewal, cancellation, etc.).
    Instead of handling each event type differently, we simply fetch the latest
    subscriber data from RevenueCat API and sync it to our database.

    This approach is recommended by RevenueCat:
    https://www.revenuecat.com/docs/integrations/webhooks

    Security:
    - Optionally verify webhook signature using REVENUECAT_WEBHOOK_SECRET
    - Rate limiting should be configured at nginx/load balancer level
    """
    try:
        # Parse webhook payload
        payload = await request.json()

        LOGGER.info(
            f"📨 Received RevenueCat webhook: {payload.get('event', {}).get('type')}"
        )

        # Optional: Verify webhook signature
        # RevenueCat sends a signature in the Authorization header
        if REVENUECAT_WEBHOOK_SECRET:
            auth_header = request.headers.get("Authorization")
            if not auth_header:
                LOGGER.warning("⚠️ Webhook missing Authorization header")
                raise HTTPException(status_code=401, detail="Missing authorization")

            token = auth_header.replace("Bearer ", "")
            if token != REVENUECAT_WEBHOOK_SECRET:
                LOGGER.warning("⚠️ Webhook signature verification failed")
                raise HTTPException(status_code=401, detail="Invalid authorization")

        # Extract app_user_id from webhook
        event = payload.get("event", {})
        app_user_id = event.get("app_user_id")

        if not app_user_id:
            LOGGER.error("❌ Webhook missing app_user_id")
            raise HTTPException(status_code=400, detail="Missing app_user_id")

        # Sync subscription status by fetching latest data from RevenueCat
        await sync_subscription_status(app_user_id)

        return {
            "success": True,
            "message": "Subscription status synced",
            "app_user_id": app_user_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"❌ Error processing webhook: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/sync/{user_id}")
async def manual_sync(user_id: str):
    """
    Manual endpoint to sync a specific user's subscription status.

    Useful for testing or manual fixes.

    Args:
        user_id: The user ID (UUID)
    """
    try:
        await sync_subscription_status(user_id)
        return {
            "success": True,
            "message": f"Synced subscription status for user {user_id}",
        }
    except Exception as e:
        LOGGER.error(f"Manual sync failed for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
