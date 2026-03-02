"""
Strava API router.
Handles athlete profile and data synchronization.
"""

import hashlib
import hmac
import os
from typing import Any, Dict, Optional

import requests
from api.auth import User, get_current_user
from api.log import LOGGER
from api.utils import supabase
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from .auth import disconnect_strava_by_user_id
from .helpers import get_athlete_by_user_id, get_user_id_by_athlete_id

router = APIRouter(prefix="/strava/api", tags=["strava-api"])
limiter = Limiter(key_func=get_remote_address)


def verify_strava_webhook_signature(payload: bytes, signature: str) -> bool:
    """
    Verify the webhook signature from Strava.

    Strava signs webhooks using HMAC-SHA256 with the client_secret as the key.
    The signature is sent in the X-Hub-Signature header.

    Args:
        payload: The raw request body bytes
        signature: The signature from the X-Hub-Signature header

    Returns:
        bool: True if signature is valid, False otherwise
    """
    client_secret = os.getenv("STRAVA_CLIENT_SECRET")
    if not client_secret:
        LOGGER.error("STRAVA_CLIENT_SECRET not configured")
        return False

    # Strava uses HMAC-SHA256
    expected_signature = hmac.new(
        client_secret.encode(), payload, hashlib.sha256
    ).hexdigest()

    # Compare signatures (use constant-time comparison to prevent timing attacks)
    return hmac.compare_digest(expected_signature, signature)


class SyncResponse(BaseModel):
    success: bool
    message: str
    activities_synced: int


class WebhookSubscriptionRequest(BaseModel):
    callback_url: str
    verify_token: str


class WebhookSubscriptionResponse(BaseModel):
    id: int
    callback_url: str
    created_at: str
    updated_at: str


class WebhookEvent(BaseModel):
    aspect_type: str  # "create", "update", or "delete"
    event_time: int
    object_id: int
    object_type: str  # "activity" or "athlete"
    owner_id: int
    subscription_id: int
    updates: Optional[Dict[str, Any]] = None


@router.get("/profile")
async def get_athlete_profile(current_user: User = Depends(get_current_user)):
    """Get Strava athlete profile information."""
    try:
        athlete_data = get_athlete_by_user_id(current_user.id)

        if not athlete_data:
            raise HTTPException(status_code=404, detail="Strava connection not found")

        return {
            "athlete": {
                "id": athlete_data["athlete_id"],
                "data": athlete_data.get("athlete_data", {}),
                "connected_at": athlete_data.get("created_at"),
                "expires_at": athlete_data.get("expires_at"),
            }
        }

    except Exception as e:
        LOGGER.error(f"❌ Error fetching Strava athlete: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch athlete data")


# Activities endpoints removed - use central /activities/ endpoints instead
# Activities are synced from Strava to database and accessed via /activities/


# Stream endpoints removed - use central /activities/{id}/streams endpoint instead


@router.post("/webhook/create")
async def create_webhook_subscription():
    """Create a Strava webhook subscription."""
    try:
        # Get Strava credentials from environment
        client_id = os.getenv("STRAVA_CLIENT_ID")
        client_secret = os.getenv("STRAVA_CLIENT_SECRET")

        if not client_id or not client_secret:
            raise HTTPException(
                status_code=500, detail="Strava client credentials not configured"
            )

        callback_url = os.getenv("STRAVA_WEBHOOK_CALLBACK_URL")
        verify_token = os.getenv("STRAVA_WEBHOOK_VERIFY_TOKEN")

        if not callback_url or not verify_token:
            raise HTTPException(
                status_code=500,
                detail="Webhook callback URL and verify token must be configured",
            )

        LOGGER.info(f"Creating webhook subscription with callback URL: {callback_url}")

        # Make request to Strava API to create subscription
        data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "callback_url": callback_url,
            "verify_token": verify_token,
        }

        response = requests.post(
            "https://www.strava.com/api/v3/push_subscriptions",
            data=data,  # Use form data, not JSON
            timeout=10,
        )

        if response.status_code != 201:
            LOGGER.error(f"Failed to create webhook subscription: {response.text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Strava API error: {response.text}",
            )

        subscription_data = response.json()

        LOGGER.info(f"✅ Created webhook subscription {subscription_data.get('id')} ")

        return subscription_data

    except requests.RequestException as e:
        LOGGER.error(f"❌ Network error creating webhook: {e}")
        raise HTTPException(status_code=500, detail="Network error creating webhook")
    except Exception as e:
        LOGGER.error(f"❌ Error creating webhook subscription: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to create webhook subscription"
        )


@router.get("/webhook/subscriptions")
async def list_webhook_subscriptions():
    """List all webhook subscriptions for this application."""
    try:
        client_id = os.getenv("STRAVA_CLIENT_ID")
        client_secret = os.getenv("STRAVA_CLIENT_SECRET")

        if not client_id or not client_secret:
            raise HTTPException(
                status_code=500, detail="Strava client credentials not configured"
            )

        response = requests.get(
            f"https://www.strava.com/api/v3/push_subscriptions?client_id={client_id}&client_secret={client_secret}",
            timeout=10,
        )

        if response.status_code != 200:
            LOGGER.error(f"Failed to list webhook subscriptions: {response.text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Strava API error: {response.text}",
            )

        subscriptions = response.json()
        LOGGER.info(f"Found {len(subscriptions)} webhook subscriptions")
        return {"subscriptions": subscriptions}

    except requests.RequestException as e:
        LOGGER.error(f"❌ Network error listing webhooks: {e}")
        raise HTTPException(status_code=500, detail="Network error listing webhooks")
    except Exception as e:
        LOGGER.error(f"❌ Error listing webhook subscriptions: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to list webhook subscriptions"
        )


""" 
# Will only be activated manually if needed
@router.delete("/webhook/subscriptions/{subscription_id}")
async def delete_webhook_subscription(subscription_id: int):

    try:
        client_id = os.getenv("STRAVA_CLIENT_ID")
        client_secret = os.getenv("STRAVA_CLIENT_SECRET")

        if not client_id or not client_secret:
            raise HTTPException(
                status_code=500, detail="Strava client credentials not configured"
            )

        response = requests.delete(
            f"https://www.strava.com/api/v3/push_subscriptions/{subscription_id}?client_id={client_id}&client_secret={client_secret}",
            timeout=10,
        )

        if response.status_code != 204:
            LOGGER.error(f"Failed to delete webhook subscription: {response.text}")
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Strava API error: {response.text}",
            )

        LOGGER.info(f"✅ Deleted webhook subscription {subscription_id}")
        return {
            "message": f"Webhook subscription {subscription_id} deleted successfully"
        }

    except requests.RequestException as e:
        LOGGER.error(f"❌ Network error deleting webhook: {e}")
        raise HTTPException(status_code=500, detail="Network error deleting webhook")
    except Exception as e:
        LOGGER.error(f"❌ Error deleting webhook subscription: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to delete webhook subscription"
        )
"""


@router.get("/webhook/callback")
async def verify_webhook_subscription(request: Request):
    """Handle Strava webhook verification challenge (GET request)."""
    try:
        # Extract query parameters
        params = dict(request.query_params)

        hub_mode = params.get("hub.mode")
        hub_challenge = params.get("hub.challenge")
        hub_verify_token = params.get("hub.verify_token")

        LOGGER.info(
            f"Webhook verification request: mode={hub_mode}, challenge={hub_challenge}, "
            f"verify_token={hub_verify_token}"
        )

        # Validate the verification request
        if hub_mode != "subscribe":
            raise HTTPException(status_code=400, detail="Invalid hub.mode")

        if not hub_challenge:
            raise HTTPException(status_code=400, detail="Missing hub.challenge")

        # Optionally verify the verify_token matches what we expect
        expected_verify_token = os.getenv("STRAVA_WEBHOOK_VERIFY_TOKEN")
        if expected_verify_token and hub_verify_token != expected_verify_token:
            LOGGER.warning(
                f"Invalid verify token: expected {expected_verify_token}, got {hub_verify_token}"
            )
            raise HTTPException(status_code=400, detail="Invalid verify token")

        # Return the challenge as required by Strava
        LOGGER.info(
            f"✅ Webhook verification successful, returning challenge: {hub_challenge}"
        )
        return {"hub.challenge": hub_challenge}

    except Exception as e:
        LOGGER.error(f"❌ Error in webhook verification: {e}")
        raise HTTPException(status_code=500, detail="Webhook verification failed")


@router.post("/webhook/callback")
async def handle_webhook_event(request: Request, background_tasks: BackgroundTasks):
    """
    Handle incoming Strava webhook events (POST request).

    Must acknowledge the POST with 200 OK within 2 seconds.
    Actual processing is done asynchronously in the background.
    """
    try:
        # Parse the JSON body
        import json

        body = await request.body()
        event_data = json.loads(body)
        event = WebhookEvent(**event_data)

        LOGGER.info(
            f"📨 Received webhook event: {event.object_type} {event.aspect_type} "
            f"for object {event.object_id} from athlete {event.owner_id}"
        )

        # Schedule background processing - don't block the response
        background_tasks.add_task(_process_webhook_event, event, event_data)

        # Return 200 OK immediately (within 2 seconds as required by Strava)
        return {"status": "received", "message": "Event queued for processing"}

    except json.JSONDecodeError as e:
        LOGGER.error(f"❌ Invalid JSON in webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    except Exception as e:
        LOGGER.error(f"❌ Error receiving webhook event: {e}")
        raise HTTPException(status_code=500, detail="Failed to receive webhook event")


async def _process_webhook_event(event: WebhookEvent, event_data: dict):
    """
    Process the webhook event asynchronously in the background.
    This allows the webhook endpoint to return 200 OK immediately.
    """
    try:
        """ CREATE TABLE strava_responses (
            id SERIAL PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            response_type VARCHAR(50) NOT NULL, -- e.g., 'activity', 'streams'
            strava_id BIGINT UNIQUE, -- Strava's activity ID
            response_json JSONB NOT NULL, -- Full JSON response for reference
            last_processed TIMESTAMP WITH TIME ZONE, -- Updated when processed
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        ); """
        user_id = get_user_id_by_athlete_id(event.owner_id)
        if not user_id:
            LOGGER.error(
                f"No user found for athlete_id {event.owner_id}, skipping event processing"
            )
            return

        # Log the webhook event in the database
        LOGGER.info(f"Logging webhook event {event_data}")

        result = (
            supabase.table("strava_responses")
            .insert(
                {
                    "user_id": user_id,
                    "response_type": "webhook",
                    "strava_id": event.object_id,
                    "response_json": event_data,
                }
            )
            .execute()
        )
        if hasattr(result, "error") and result.error:
            LOGGER.error(f"❌ Failed to log webhook event: {result.error.message}")
        else:
            LOGGER.info(f"Logged webhook event with id {result.data[0]['id']}")

        """
        The following can happen:
        1. Athlete data changed - e.g. authorized = false
           -> If authorized = false, remove their tokens and data
        2. Activity created
           -> Trigger sync for this specific activity
        3. Activity updated - title, type, private status changed
              -> Update the activity in our database if we have it
        4. Activity deleted
              -> Remove the activity from our database if we have it
        5. Maybe more TODO test e.g. scope changed ?
        """

        # Handle different event types
        if event.object_type == "activity":
            await _handle_activity_event(event)
        elif event.object_type == "athlete":
            await _handle_athlete_event(event)
        else:
            LOGGER.warning(f"Unknown object type: {event.object_type}")

        LOGGER.info(
            f"✅ Successfully processed webhook event for {event.object_type} {event.object_id}"
        )

    except Exception as e:
        LOGGER.error(f"❌ Error processing webhook event in background: {e}")
        # Don't raise - this is a background task


async def _handle_activity_event(event: WebhookEvent):
    """Handle activity-related webhook events."""
    athlete_id = str(event.owner_id)
    activity_id = event.object_id

    LOGGER.info(f"Processing {event.aspect_type} event for activity {activity_id}")

    if event.aspect_type == "create":
        # New activity created - trigger sync for this specific activity
        LOGGER.info(f"New activity {activity_id} created by athlete {athlete_id}")
        from .helpers import sync_specific_activity

        await sync_specific_activity(athlete_id, str(activity_id))

    elif event.aspect_type == "update":
        # Activity updated - check what changed
        # only title, type, private status can be changed via webhook
        # private status is not important since we do not share activities

        updates = event.updates or {}
        title = updates.get("title")
        activity_type = updates.get("type")
        LOGGER.info(
            f"Activity {activity_id} updated by athlete {athlete_id}: title={title}, type={activity_type}"
        )

        # Get user_id to find the session
        user_id = get_user_id_by_athlete_id(athlete_id)
        if not user_id:
            LOGGER.error(f"No user found for athlete_id {athlete_id}, skipping update")
            return

        # Update the session via the activity's external_id
        # Activity and session have a one-to-one relationship
        try:
            if not title and not activity_type:
                LOGGER.info(f"No updates to apply for activity {activity_id}")
                return

            # Find the Strava activity to get its UUID
            activity_result = (
                supabase.table("activities")
                .select("id")
                .eq("external_id", str(activity_id))
                .eq("upload_source", "strava")
                .eq("user_id", user_id)
                .execute()
            )

            if not activity_result.data:
                LOGGER.warning(
                    f"No Strava activity found with external_id {activity_id} for user {user_id}"
                )
                return

            activity_uuid = activity_result.data[0]["id"]

            # Handle title update - update session_custom_data (affects ALL duplicates)
            if title:
                # Get the session and its custom_data_id
                session_result = (
                    supabase.table("sessions")
                    .select("id, session_custom_data_id")
                    .eq("activity_id", activity_uuid)
                    .execute()
                )

                if session_result.data and len(session_result.data) > 0:
                    session = session_result.data[0]
                    custom_data_id = session.get("session_custom_data_id")

                    if custom_data_id:
                        # IMPORTANT: Update title in session_custom_data
                        # This automatically updates the title for ALL sessions sharing this custom_data_id
                        # (including duplicates from Wahoo, manual uploads, etc.)
                        from api.utils.general import set_session_title

                        success = set_session_title(custom_data_id, title)
                        if success:
                            LOGGER.info(
                                f"✅ Updated title to '{title}' in session_custom_data {custom_data_id} "
                                f"(affects all duplicate sessions)"
                            )
                        else:
                            LOGGER.warning(
                                f"⚠️ Failed to update title in session_custom_data {custom_data_id}"
                            )
                    else:
                        LOGGER.warning(
                            f"No session_custom_data_id found for session {session['id']}"
                        )
                else:
                    LOGGER.warning(f"No session found for activity {activity_uuid}")

            # Handle sport type update - update session directly (sport is per-session, not shared)
            if activity_type:
                session_update_result = (
                    supabase.table("sessions")
                    .update({"sport": activity_type})
                    .eq("activity_id", activity_uuid)
                    .execute()
                )

                if session_update_result.data:
                    LOGGER.info(
                        f"✅ Updated sport to '{activity_type}' for strava activity {activity_id}"
                    )
                else:
                    LOGGER.warning(f"No session found for activity {activity_uuid}")

        except Exception as e:
            LOGGER.error(f"❌ Error updating activity {activity_id}: {e}")

    elif event.aspect_type == "delete":
        # Activity deleted - remove from our database
        LOGGER.info(f"Activity {activity_id} deleted by athlete {athlete_id}")

        # Get user_id
        user_id = get_user_id_by_athlete_id(athlete_id)
        if not user_id:
            LOGGER.error(f"No user found for athlete_id {athlete_id}, skipping delete")
            return

        try:
            # Delete strava_responses with this strava_id
            # This will cascade delete to activities (via ON DELETE CASCADE)
            # Which will cascade delete to sessions, laps, and records
            strava_response_result = (
                supabase.table("strava_responses")
                .delete()
                .eq("strava_id", int(activity_id))
                .eq("user_id", user_id)
                .execute()
            )

            # Also delete the activity directly if it exists
            # (in case there are orphaned activities)
            activity_result = (
                supabase.table("activities")
                .delete()
                .eq("external_id", str(activity_id))
                .eq("upload_source", "strava")
                .eq("user_id", user_id)
                .execute()
            )

            deleted_responses = (
                len(strava_response_result.data) if strava_response_result.data else 0
            )
            deleted_activities = (
                len(activity_result.data) if activity_result.data else 0
            )

            if deleted_responses > 0 or deleted_activities > 0:
                LOGGER.info(
                    f"✅ Deleted activity {activity_id}: "
                    f"{deleted_responses} strava_responses, {deleted_activities} activities "
                    f"(cascade deleted sessions, laps, records)"
                )
            else:
                LOGGER.warning(
                    f"No activity or strava_response found for strava_id {activity_id}"
                )

        except Exception as e:
            LOGGER.error(f"❌ Error deleting activity {activity_id}: {e}")


async def _handle_athlete_event(event: WebhookEvent):
    """Handle athlete-related webhook events."""
    athlete_id = str(event.owner_id)

    LOGGER.info(f"Processing {event.aspect_type} event for athlete {athlete_id}")

    if event.aspect_type == "update" and event.updates:
        authorized = event.updates.get("authorized")
        if authorized == "false":
            # Athlete revoked access - clean up their data
            LOGGER.info(f"Athlete {athlete_id} revoked access - cleaning up data")

            # Get user_id from athlete_id and disconnect Strava
            user_id = get_user_id_by_athlete_id(int(athlete_id))
            if user_id:
                try:
                    await disconnect_strava_by_user_id(user_id)
                    LOGGER.info(
                        f"Successfully disconnected Strava for user {user_id} after deauthorization"
                    )
                except Exception as e:
                    LOGGER.error(f"Failed to disconnect Strava for user {user_id}: {e}")
            else:
                LOGGER.warning(
                    f"No user found for athlete_id {athlete_id} during deauthorization"
                )
