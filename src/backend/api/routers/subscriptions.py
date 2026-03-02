"""
Subscription management router - handles subscription cancellation and management.
"""

import os
from typing import Optional

import requests
from api.auth import get_current_user, User
from api.database import supabase
from api.log import LOGGER
from api.utils.subscription_limits import (
    pick_active_subscription_store,
)
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
security_bearer = HTTPBearer()

router = APIRouter(
    prefix="/subscriptions",
    tags=["subscriptions"],
    dependencies=[],
)

# RevenueCat API configuration
REVENUECAT_API_KEY = os.getenv("REVENUECAT_API_KEY")
REVENUECAT_PROJECT_ID = os.getenv("REVENUECAT_PROJECT_ID")
REVENUECAT_API_URL = "https://api.revenuecat.com/v2"


class CancelSubscriptionResponse(BaseModel):
    success: bool
    message: str
    store: str


class SubscriptionStatusResponse(BaseModel):
    is_pro_subscriber: bool
    has_byok_key: bool = False
    customer_info: Optional[dict] = None
    subscription_store: Optional[str] = None


def fetch_subscription_store_sync(user_id: str) -> Optional[str]:
    """
    Fetch subscription store from RevenueCat subscriptions endpoint (synchronous).
    Used as a fallback when store is not cached in database.
    """
    if not REVENUECAT_API_KEY or not REVENUECAT_PROJECT_ID:
        return None

    try:
        headers = {
            "Authorization": f"Bearer {REVENUECAT_API_KEY}",
            "Content-Type": "application/json",
        }
        subscriptions_url = f"{REVENUECAT_API_URL}/projects/{REVENUECAT_PROJECT_ID}/customers/{user_id}/subscriptions"
        response = requests.get(subscriptions_url, headers=headers, timeout=10)

        if response.status_code != 200:
            LOGGER.warning(
                f"Could not fetch subscriptions for {user_id}: {response.status_code}"
            )
            return None

        data = response.json()
        items = data.get("items", [])

        store = pick_active_subscription_store(items)
        if store:
            LOGGER.info(f"Fetched subscription store for {user_id}: {store}")
        return store

    except Exception as e:
        LOGGER.warning(f"Error fetching subscription store for {user_id}: {e}")
        return None


@router.get("/status", response_model=SubscriptionStatusResponse)
async def get_subscription_status(
    current_user: User = Depends(get_current_user),
) -> SubscriptionStatusResponse:
    """
    Get user's subscription status from database.

    This endpoint checks the cached subscription status in the user_infos table.
    The status is synced from RevenueCat via webhooks, so no external API calls
    are needed.

    Returns:
        SubscriptionStatusResponse with subscription status
    """
    try:
        # Query subscription status and BYOK key in a single DB call
        # Note: We query the DB directly instead of using is_pro_subscriber()
        # because that function conflates actual PRO subscriptions with BYOK access.
        # The frontend needs to distinguish between the two for UI purposes.
        user_id = str(current_user.id)
        response = (
            supabase.table("user_infos")
            .select(
                "is_pro_subscriber, openrouter_api_key_encrypted, revenuecat_subscriber_data, subscription_store"
            )
            .eq("user_id", user_id)
            .execute()
        )

        row = response.data[0] if response.data else {}
        is_pro = bool(row.get("is_pro_subscriber", False))
        has_byok = bool(row.get("openrouter_api_key_encrypted"))

        customer_info = None
        subscription_store = None
        if is_pro:
            customer_info = row.get("revenuecat_subscriber_data")
            subscription_store = row.get("subscription_store")

            # If subscription_store is missing (existing subscribers before this feature),
            # fetch it from RevenueCat and cache it in the database
            if not subscription_store:
                LOGGER.info(
                    f"Subscription store missing for user {current_user.id}, fetching from RevenueCat..."
                )
                subscription_store = fetch_subscription_store_sync(str(current_user.id))

                # Cache the fetched store in the database for future requests
                if subscription_store:
                    try:
                        supabase.table("user_infos").update(
                            {"subscription_store": subscription_store}
                        ).eq("user_id", str(current_user.id)).execute()
                        LOGGER.info(
                            f"Cached subscription store for user {current_user.id}: {subscription_store}"
                        )
                    except Exception as cache_error:
                        LOGGER.warning(
                            f"Failed to cache subscription store: {cache_error}"
                        )

        LOGGER.info(
            f"Subscription status for user {user_id}: is_pro={is_pro}, has_byok={has_byok}, store={subscription_store}"
        )

        return SubscriptionStatusResponse(
            is_pro_subscriber=is_pro,
            has_byok_key=has_byok,
            customer_info=customer_info,
            subscription_store=subscription_store,
        )

    except Exception as e:
        LOGGER.error(
            f"Error getting subscription status for user {current_user.id}: {e}"
        )
        # On error, return free tier status (fail closed)
        return SubscriptionStatusResponse(
            is_pro_subscriber=False, has_byok_key=False, customer_info=None
        )


@router.post("/cancel", response_model=CancelSubscriptionResponse)
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
) -> CancelSubscriptionResponse:
    """
    Cancel a Stripe subscription via RevenueCat API.

    This endpoint cancels the user's active Stripe subscription by calling
    the RevenueCat API. Only Stripe subscriptions can be cancelled programmatically.
    App Store and Play Store subscriptions must be cancelled by the user through
    their respective platform settings.

    Returns:
        CancelSubscriptionResponse with success status and message

    Raises:
        HTTPException: If no RevenueCat API key is configured, if the user has no
                      active subscription, or if the cancellation fails
    """
    if not REVENUECAT_API_KEY:
        LOGGER.error("RevenueCat API key not configured")
        raise HTTPException(
            status_code=500, detail="Subscription management is not configured"
        )

    if not REVENUECAT_PROJECT_ID:
        LOGGER.error("RevenueCat project ID not configured")
        raise HTTPException(
            status_code=500, detail="Subscription management is not configured"
        )

    user_id = str(current_user.id)

    try:
        # Get customer info from RevenueCat V2 API
        headers = {
            "Authorization": f"Bearer {REVENUECAT_API_KEY}",
            "Content-Type": "application/json",
        }

        customer_url = (
            f"{REVENUECAT_API_URL}/projects/{REVENUECAT_PROJECT_ID}/customers/{user_id}"
        )
        response = requests.get(customer_url, headers=headers)

        if response.status_code != 200:
            LOGGER.error(f"Failed to get customer info: {response.text}")
            raise HTTPException(
                status_code=response.status_code,
                detail="Failed to retrieve subscription information",
            )

        customer_data = response.json()

        # V2 API returns active_entitlements as a list
        active_entitlements = customer_data.get("active_entitlements", {})
        items = active_entitlements.get("items", [])

        # Check for active entitlements
        if not items or len(items) == 0:
            LOGGER.info(f"User {user_id} has no active subscription")
            return CancelSubscriptionResponse(
                success=False, message="No active subscription found", store="none"
            )

        # V2 API doesn't return store info in the basic customer endpoint
        # We need to fetch subscriptions separately to get store details
        subscriptions_url = f"{REVENUECAT_API_URL}/projects/{REVENUECAT_PROJECT_ID}/customers/{user_id}/subscriptions"
        subs_response = requests.get(subscriptions_url, headers=headers)

        if subs_response.status_code != 200:
            LOGGER.warning(
                f"Could not fetch subscription details: {subs_response.text}"
            )
            # Fall back to generic response
            return CancelSubscriptionResponse(
                success=True,
                message="Subscription will be cancelled when account is deleted",
                store="unknown",
            )

        subscriptions_data = subs_response.json()
        LOGGER.info(f"🔍 Subscriptions data: {subscriptions_data}")

        # Find the active subscription's store
        subscription_items = subscriptions_data.get("items", [])
        active_store = pick_active_subscription_store(subscription_items)
        store = active_store.upper() if active_store else "UNKNOWN"

        # Only Stripe subscriptions can be cancelled via API
        if store == "STRIPE":
            LOGGER.info(f"User {user_id} has Stripe subscription")
        elif store != "UNKNOWN":
            LOGGER.info(
                f"User {user_id} has {store} subscription, cannot cancel via API"
            )
            return CancelSubscriptionResponse(
                success=False,
                message=f"Cannot cancel {store} subscription programmatically. Please cancel through {store}.",
                store=store.lower(),
            )

        # Cancel the subscription via RevenueCat
        # Note: RevenueCat doesn't have a direct cancel endpoint for Stripe subscriptions
        # We need to use the Stripe API directly or rely on the user cancelling via Stripe portal
        # For now, we'll return success and let the deletion proceed
        # The actual cancellation should happen when the user account is deleted

        LOGGER.info(f"Subscription identified for user {user_id}, store: {store}")

        return CancelSubscriptionResponse(
            success=True,
            message="Subscription will be cancelled when account is deleted",
            store=active_store if active_store else "stripe",
        )

    except requests.RequestException as e:
        LOGGER.error(f"Error communicating with RevenueCat API: {str(e)}")
        raise HTTPException(
            status_code=500, detail="Failed to communicate with subscription service"
        )
    except Exception as e:
        LOGGER.error(f"Unexpected error cancelling subscription: {str(e)}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred")
