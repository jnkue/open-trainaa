"""
Strava database helper functions.
All Strava-related database operations and API interactions.
"""

import os
from datetime import datetime, timedelta, timezone

import requests
from api.log import LOGGER
from api.training_status import calculate_training_status
from api.utils import post_processing_of_session, supabase
from pydantic import BaseModel

STRAVA_BASE_URL = "https://www.strava.com/api/v3/"


class SyncResponse(BaseModel):
    success: bool
    message: str
    activities_synced: int


def refresh_token(refresh_token: str, athlete_id) -> str:
    """
    Refresh the strava token using the refresh token. and saves it to the database.

    """
    import requests

    headers = {
        "Content-Type": "application/json",
    }
    data = {
        "client_id": os.environ.get("STRAVA_CLIENT_ID"),
        "client_secret": os.environ.get("STRAVA_CLIENT_SECRET"),
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }

    response = requests.post(
        "https://www.strava.com/api/v3/oauth/token", headers=headers, json=data
    )

    if response.status_code == 200:
        token_data = response.json()
        # Save the new token to the database
        supabase.table("strava_tokens").update(
            {
                "access_token": token_data["access_token"],
                "refresh_token": token_data["refresh_token"],
                "expires_at": str(datetime.fromtimestamp(token_data["expires_at"])),
            }
        ).eq("athlete_id", athlete_id).execute()
        return token_data["access_token"]
    else:
        raise ValueError(f"Failed to refresh token: {response.text}")


def get_token(athlete_id: str) -> str:
    """
    Get the Strava access token for a given athlete ID.
    """
    response = (
        supabase.table("strava_tokens")
        .select("*")
        .eq("athlete_id", athlete_id)
        .execute()
    )
    if response.data:
        # check if the token is still valid for 10 minutes
        token_data = response.data[0]
        # TODO Check for prod
        if datetime.fromisoformat(token_data["expires_at"]) > datetime.now(
            timezone.utc
        ):
            # Token is still valid
            return token_data["access_token"]

        else:
            # Token is expired, refresh it
            return refresh_token(token_data["refresh_token"], athlete_id)

    else:
        raise ValueError(f"No access token found for athlete ID: {athlete_id}")


def make_request(urlsuffix, token, params=None):
    """
    Make a request to the Strava API with the given URL suffix and token.
    """

    headers = {
        "Authorization": f"Bearer {token}",
    }
    url = f"{STRAVA_BASE_URL}{urlsuffix}"
    response = requests.get(url, headers=headers, params=params)
    if response.status_code == 200:
        return response.json()
    else:
        raise ValueError(f"Failed to fetch data from Strava API: {response.text}")


def get_athlete_by_user_id(user_id: str):
    """Get athlete data by user ID."""
    response = (
        supabase.table("strava_tokens").select("*").eq("user_id", user_id).execute()
    )
    return response.data[0] if response.data else None


def get_user_id_by_athlete_id(athlete_id: str):
    """Get user ID by athlete ID."""
    response = (
        supabase.table("strava_tokens")
        .select("user_id")
        .eq("athlete_id", athlete_id)
        .execute()
    )
    return response.data[0]["user_id"] if response.data else None


async def fetch_and_store_strava_activities(
    athlete_id: str, user_id: str, days: int = 30
):
    """
    Step 1: Fetch activities from Strava API and create activities with sessions directly.
    Each Strava activity becomes one activity with one session.
    """
    LOGGER.info(
        f"🎯 Fetching Strava activities for athlete_id: {athlete_id}, days: {days}"
    )

    try:
        token = get_token(athlete_id)
        LOGGER.debug(f"🔑 Got token for athlete {athlete_id}")
    except Exception as e:
        LOGGER.error(f"❌ Error getting token: {e}")
        raise e

    # Fetch activities from Strava API
    urlsuffix = "athlete/activities"
    try:
        response = make_request(
            urlsuffix,
            token,
            params={
                "per_page": 100,
                "after": (
                    datetime.now(timezone.utc) - timedelta(days=days)
                ).timestamp(),
                "page": 1,
            },
        )
        LOGGER.info(f"📡 Got {len(response)} activities from Strava API")
    except Exception as e:
        LOGGER.error(f"❌ Error making API request: {e}")
        raise e

    activities_processed = 0

    for activity_data in response:
        strava_activity_id = str(activity_data["id"])

        try:
            # Check if this activity already exists by looking for strava_response with this ID
            existing_strava_response = (
                supabase.table("strava_responses")
                .select("id")
                .eq("user_id", user_id)
                .eq("strava_id", int(strava_activity_id))
                .execute()
            )

            if not existing_strava_response.data:
                # Create activity and session directly
                activity_id, session_id = await create_activity_and_session_from_strava(
                    activity_data, user_id
                )

                # Fetch and process streams to create records
                await fetch_and_create_records_from_streams(
                    strava_activity_id, token, user_id, activity_id, session_id
                )

                # important now the calculate_training_status() must be called this is not done here because multiple activities might be processed and it is better to call it once at the end

                activities_processed += 1
                LOGGER.info(
                    f"✅ Processed Strava activity {strava_activity_id} -> activity {activity_id}, session {session_id}"
                )

            else:
                LOGGER.debug(f"✅ Activity {strava_activity_id} already exists")

        except Exception as e:
            LOGGER.error(f"❌ Error processing activity {strava_activity_id}: {e}")
            continue

    LOGGER.info(f"✅ Processed {activities_processed} new Strava activities")
    return activities_processed


strava_to_fit_mapping = {
    "AlpineSki": {"sport": "alpine_skiing", "sub_sport": "resort"},
    "BackcountrySki": {"sport": "alpine_skiing", "sub_sport": "backcountry"},
    "Canoeing": {"sport": "paddling", "sub_sport": None},
    "Crossfit": {"sport": "training", "sub_sport": "strength_training"},
    "EBikeRide": {"sport": "cycling", "sub_sport": "e_bike_fitness"},
    "Elliptical": {"sport": "fitness_equipment", "sub_sport": "elliptical"},
    "Golf": {"sport": "golf", "sub_sport": None},
    "Handcycle": {"sport": "cycling", "sub_sport": "hand_cycling"},
    "Hike": {"sport": "hiking", "sub_sport": None},
    "IceSkate": {"sport": "ice_skating", "sub_sport": None},
    "InlineSkate": {"sport": "inline_skating", "sub_sport": None},
    "Kayaking": {"sport": "kayaking", "sub_sport": None},
    "Kitesurf": {"sport": "kitesurfing", "sub_sport": None},
    "NordicSki": {"sport": "cross_country_skiing", "sub_sport": "skate_skiing"},
    "Ride": {"sport": "cycling", "sub_sport": None},
    "RockClimbing": {"sport": "rock_climbing", "sub_sport": None},
    "RollerSki": {"sport": "cross_country_skiing", "sub_sport": None},
    "Rowing": {"sport": "rowing", "sub_sport": None},
    "Run": {"sport": "running", "sub_sport": None},
    "Sail": {"sport": "sailing", "sub_sport": None},
    "Skateboard": {
        "sport": "surfing",  # skateboarding is not supported in fit files, using surfing as closest match
        "sub_sport": None,
    },
    "Snowboard": {"sport": "snowboarding", "sub_sport": None},
    "Snowshoe": {"sport": "snowshoeing", "sub_sport": None},
    "Soccer": {"sport": "soccer", "sub_sport": None},
    "StairStepper": {"sport": "fitness_equipment", "sub_sport": "treadmill"},
    "StandUpPaddling": {"sport": "stand_up_paddleboarding", "sub_sport": None},
    "Surfing": {"sport": "surfing", "sub_sport": None},
    "Swim": {"sport": "swimming", "sub_sport": None},
    "Velomobile": {"sport": "cycling", "sub_sport": None},
    "VirtualRide": {"sport": "cycling", "sub_sport": "indoor_cycling"},
    "VirtualRun": {"sport": "running", "sub_sport": "treadmill"},
    "Walk": {"sport": "walking", "sub_sport": None},
    "WeightTraining": {"sport": "training", "sub_sport": "strength_training"},
    "Wheelchair": {"sport": "wheelchair_push_run", "sub_sport": None},
    "Windsurf": {"sport": "windsurfing", "sub_sport": None},
    "Workout": {"sport": "training", "sub_sport": None},
    "Yoga": {"sport": "training", "sub_sport": "yoga"},
}


def _get_strava_sport_mapping(strava_type: str) -> dict:
    """Get the corresponding sport and sub_sport for a given Strava activity type."""
    return strava_to_fit_mapping.get(
        strava_type, {"sport": "Unknown", "sub_sport": None}
    )


async def create_activity_and_session_from_strava(activity_data: dict, user_id: str):
    """
    Create an activity and its associated session from Strava activity data.
    Returns: (activity_id, session_id)
    """
    # Parse start date
    start_date = activity_data.get("start_date")
    if isinstance(start_date, str):
        start_date = datetime.fromisoformat(start_date.replace("Z", "+00:00"))

    # Create strava_response entry first (required for activity constraint)
    strava_response_record = {
        "user_id": user_id,
        "response_type": "activity",
        "strava_id": activity_data.get("id"),
        "response_json": activity_data,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }

    strava_response_result = (
        supabase.table("strava_responses").insert(strava_response_record).execute()
    )
    if not strava_response_result.data:
        raise Exception("Failed to create strava response record")

    strava_response_id = strava_response_result.data[0]["id"]

    # Create activity record
    strava_activity_id = activity_data.get("id")
    activity_record = {
        "user_id": user_id,
        "num_sessions": 1,
        "strava_response_id": strava_response_id,
        "strava_activity_id": strava_activity_id,  # Strava's activity ID
        "external_id": str(strava_activity_id)
        if strava_activity_id
        else None,  # Also store as external_id
        "upload_source": "strava",
        "total_distance": activity_data.get("distance"),  # in meters
        "total_elapsed_time": activity_data.get("elapsed_time"),  # in seconds
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }

    # Remove None values
    activity_record = {k: v for k, v in activity_record.items() if v is not None}

    # Insert activity
    activity_result = supabase.table("activities").insert(activity_record).execute()
    if not activity_result.data:
        raise Exception("Failed to create activity")

    activity_id = activity_result.data[0]["id"]  # UUID

    # Note: session_custom_data will be created/linked during post-processing
    # Title will be set in session_custom_data during post-processing
    sport_type = activity_data.get("sport_type")

    sport_types = _get_strava_sport_mapping(sport_type)

    session_record = {
        "user_id": user_id,
        "activity_id": activity_id,
        "session_number": 0,  # 0-based indexing as per schema
        "sport": sport_types["sport"],
        "sub_sport": sport_types["sub_sport"],
        "start_time": start_date.isoformat() if start_date else None,
        "total_distance": activity_data.get("distance"),  # in meters
        "total_elapsed_time": activity_data.get("elapsed_time"),  # in seconds
        "total_timer_time": activity_data.get("moving_time"),  # in seconds
        "total_calories": int(activity_data["calories"])
        if activity_data.get("calories") is not None
        else None,
        "avg_heart_rate": int(activity_data["average_heartrate"])
        if activity_data.get("average_heartrate") is not None
        else None,
        "max_heart_rate": int(activity_data["max_heartrate"])
        if activity_data.get("max_heartrate") is not None
        else None,
        "avg_speed": activity_data.get("average_speed"),  # in m/s
        "max_speed": activity_data.get("max_speed"),  # in m/s
        "avg_cadence": int(activity_data["average_cadence"])
        if activity_data.get("average_cadence") is not None
        else None,
        "total_elevation_gain": activity_data.get("total_elevation_gain"),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }

    # Remove None values
    session_record = {k: v for k, v in session_record.items() if v is not None}

    # Insert session
    session_result = supabase.table("sessions").insert(session_record).execute()
    if not session_result.data:
        raise Exception("Failed to create session")

    session_id = session_result.data[0]["id"]  # UUID

    return activity_id, session_id


async def fetch_and_create_records_from_streams(
    strava_activity_id: str, token: str, user_id: str, activity_id: str, session_id: str
):
    """
    Fetch streams from Strava and create array-based record for the session.
    """
    urlsuffix = f"activities/{strava_activity_id}/streams"
    params = {
        "keys": "time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth",
        "key_by_type": "true",
    }

    try:
        streams_data = make_request(urlsuffix, token, params)
        LOGGER.debug(
            f"📊 Got streams data for activity {strava_activity_id}: {list(streams_data.keys())}"
        )

        # Get the time stream - this is essential for creating timestamps
        time_stream = streams_data.get("time")
        if not time_stream or not time_stream.get("data"):
            LOGGER.warning(
                f"⚠️ No time stream data found for activity {strava_activity_id}"
            )
            return

        time_data = time_stream["data"]  # Array of seconds from start
        data_length = len(time_data)

        # Initialize arrays for the record
        record_data = {
            "activity_id": activity_id,
            "session_id": session_id,
            "timestamp": [],
            "latitude": [],
            "longitude": [],
            "altitude": [],
            "heart_rate": [],
            "cadence": [],
            "speed": [],
            "distance": [],
            "power": [],
            "temperature": [],
            "position": [],
        }

        # Process each data point and build arrays
        for i in range(data_length):
            # Timestamp is seconds from start
            seconds_from_start = time_data[i]
            record_data["timestamp"].append(int(seconds_from_start))

            # Distance
            if "distance" in streams_data and i < len(
                streams_data["distance"].get("data", [])
            ):
                record_data["distance"].append(streams_data["distance"]["data"][i])
            else:
                record_data["distance"].append(None)

            # GPS coordinates
            if "latlng" in streams_data and i < len(
                streams_data["latlng"].get("data", [])
            ):
                latlng = streams_data["latlng"]["data"][i]
                if len(latlng) >= 2:
                    record_data["latitude"].append(latlng[0])
                    record_data["longitude"].append(latlng[1])
                    # Create PostGIS point for geospatial queries
                    record_data["position"].append(f"POINT({latlng[1]} {latlng[0]})")
                else:
                    record_data["latitude"].append(None)
                    record_data["longitude"].append(None)
                    record_data["position"].append(None)
            else:
                record_data["latitude"].append(None)
                record_data["longitude"].append(None)
                record_data["position"].append(None)

            # Altitude
            if "altitude" in streams_data and i < len(
                streams_data["altitude"].get("data", [])
            ):
                record_data["altitude"].append(streams_data["altitude"]["data"][i])
            else:
                record_data["altitude"].append(None)

            # Heart rate
            if "heartrate" in streams_data and i < len(
                streams_data["heartrate"].get("data", [])
            ):
                hr_value = streams_data["heartrate"]["data"][i]
                record_data["heart_rate"].append(
                    int(float(hr_value)) if hr_value is not None else None
                )
            else:
                record_data["heart_rate"].append(None)

            # Cadence
            if "cadence" in streams_data and i < len(
                streams_data["cadence"].get("data", [])
            ):
                cadence_value = streams_data["cadence"]["data"][i]
                record_data["cadence"].append(
                    int(float(cadence_value)) if cadence_value is not None else None
                )
            else:
                record_data["cadence"].append(None)

            # Speed
            if "velocity_smooth" in streams_data and i < len(
                streams_data["velocity_smooth"].get("data", [])
            ):
                record_data["speed"].append(streams_data["velocity_smooth"]["data"][i])
            else:
                record_data["speed"].append(None)

            # Power
            if "watts" in streams_data and i < len(
                streams_data["watts"].get("data", [])
            ):
                power_value = streams_data["watts"]["data"][i]
                record_data["power"].append(
                    int(float(power_value)) if power_value is not None else None
                )
            else:
                record_data["power"].append(None)

            # Temperature
            if "temp" in streams_data and i < len(streams_data["temp"].get("data", [])):
                temp_value = streams_data["temp"]["data"][i]
                record_data["temperature"].append(
                    int(float(temp_value)) if temp_value is not None else None
                )
            else:
                record_data["temperature"].append(None)

        # Insert single record row with all arrays
        try:
            result = supabase.table("records").insert(record_data).execute()
            if result.data:
                LOGGER.info(
                    f"✅ Created record for session {session_id} with {data_length} data points from Strava activity {strava_activity_id}"
                )

                # Post-processing of session (e.g., calculate hr_load)
                await post_processing_of_session(session_id)

            else:
                LOGGER.error(f"❌ Failed to create record for session {session_id}")
        except Exception as e:
            LOGGER.error(f"❌ Error inserting record for session {session_id}: {e}")
            raise

    except Exception as e:
        LOGGER.error(
            f"❌ Error fetching streams for activity {strava_activity_id}: {e}"
        )
        raise e


async def sync_specific_activity(athlete_id: str, strava_activity_id: str):
    """
    Sync a specific activity from Strava API.
    Used by webhooks when a new activity is created.

    Args:
        athlete_id: The Strava athlete ID
        strava_activity_id: The specific Strava activity ID to sync

    Returns:
        SyncResponse with success status
    """
    try:
        # Get user_id from athlete_id
        user_id = get_user_id_by_athlete_id(athlete_id)
        if not user_id:
            raise ValueError(f"No user found for athlete ID: {athlete_id}")

        # Get token and fetch the specific activity
        token = get_token(athlete_id)
        urlsuffix = f"activities/{strava_activity_id}"

        activity_data = make_request(urlsuffix, token)
        LOGGER.info(f"📡 Fetched activity {strava_activity_id} from Strava API")

        # Create activity and session
        activity_id, session_id = await create_activity_and_session_from_strava(
            activity_data, user_id
        )

        # Fetch and process streams
        await fetch_and_create_records_from_streams(
            strava_activity_id, token, user_id, activity_id, session_id
        )

        # Recalculate training status
        calculate_training_status()

        LOGGER.info(
            f"✅ Successfully synced activity {strava_activity_id} -> activity {activity_id}, session {session_id}"
        )

        return SyncResponse(
            success=True,
            message=f"Successfully synced activity {strava_activity_id}",
            activities_synced=1,
        )

    except Exception as e:
        LOGGER.error(f"❌ Error syncing specific activity {strava_activity_id}: {e}")
        return SyncResponse(
            success=False,
            message=f"Failed to sync activity: {str(e)}",
            activities_synced=0,
        )


async def sync_activities(days: int, athlete_id: str, user_id: str):
    """Sync activities from Strava API directly to activities and sessions.

    This is called on initial connection to sync the last N days of activities.
    """
    try:
        activities_processed = await fetch_and_store_strava_activities(
            athlete_id, user_id, days
        )

        LOGGER.info(
            f"🔄 Processed {activities_processed} Strava activities for user {user_id}"
        )

        calculate_training_status()
        return SyncResponse(
            success=True,
            message=f"Successfully processed {activities_processed} activities from Strava",
            activities_synced=activities_processed,
        )

    except Exception as e:
        LOGGER.error(f"❌ Error syncing activities: {e}")
        return SyncResponse(
            success=False,
            message=f"Failed to sync activities: {str(e)}",
            activities_synced=0,
        )


async def update_strava_activity_description(
    strava_activity_id: int, athlete_id: str, feedback: str
) -> bool:
    """
    Update a Strava activity's description by appending AI-generated feedback.

    This function:
    1. Fetches the current activity from Strava
    2. Extracts the existing description
    3. Appends feedback in a formatted way
    4. Updates the activity via Strava API

    Args:
        strava_activity_id: The Strava activity ID (integer)
        athlete_id: The athlete's Strava ID
        feedback: The AI-generated feedback to append

    Returns:
        bool: True if successful, False if failed
    """
    try:
        LOGGER.info(
            f"📝 Updating Strava activity {strava_activity_id} with AI feedback"
        )

        # Get access token for this athlete
        try:
            token = get_token(athlete_id)
        except Exception as e:
            LOGGER.error(f"❌ Failed to get token for athlete {athlete_id}: {e}")
            return False

        # Fetch current activity data to get existing description
        urlsuffix = f"activities/{strava_activity_id}"
        try:
            activity_data = make_request(urlsuffix, token)
            existing_description = activity_data.get("description", "") or ""
        except Exception as e:
            LOGGER.error(
                f"❌ Failed to fetch activity {strava_activity_id} from Strava: {e}"
            )
            return False

        # Build the new description with feedback appended
        feedback_header = "\n📉📉📉📉📉📉📉📉\nTRAINER FEEDBACK\n📈📈📈📈📈📈📈📈\npowered by trainaa.com\n"
        # Check if feedback was already added to avoid duplicates
        if "powered by trainaa.com" in existing_description:
            LOGGER.info(
                f"ℹ️ Activity {strava_activity_id} already has trainaa feedback, skipping update"
            )
            return True

        new_description = existing_description + feedback_header + feedback

        # Update the activity description via Strava API
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        url = f"{STRAVA_BASE_URL}activities/{strava_activity_id}"

        response = requests.put(
            url, headers=headers, json={"description": new_description}, timeout=10
        )

        if response.status_code == 200:
            LOGGER.info(
                f"✅ Successfully updated Strava activity {strava_activity_id} description"
            )
            return True
        else:
            LOGGER.error(
                f"❌ Failed to update Strava activity {strava_activity_id}: "
                f"Status {response.status_code}, Response: {response.text}"
            )
            return False

    except Exception as e:
        LOGGER.error(
            f"❌ Unexpected error updating Strava activity {strava_activity_id}: {e}"
        )
        return False
