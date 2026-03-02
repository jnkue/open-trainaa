#!/usr/bin/env python3
"""
Workout Management Agent

A specialized agent for creating, modifying, and deleting workouts with the exact format required.
Used by the trainer_agent to make concrete workout adjustments.

"""

import asyncio
import json
import os
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

try:
    import dateparser
except ImportError:
    dateparser = None

from agent.log import LOGGER
from agent.utils import write_to_stream
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pacer.src import WORKOUTDEFINITION, WorkoutValidator

from supabase import Client, create_client

# Import workout calculation from router to avoid code duplication
from api.routers.workouts import calculate_workout_estimates


# Initialize Supabase client
supabase_url = os.environ.get("PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("PRIVATE_SUPABASE_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("Missing required Supabase environment variables")

supabase: Client = create_client(supabase_url, supabase_key)


class WorkoutManagementAgent:
    """Specialized agent for managing workouts with exact format requirements."""

    def __init__(
        self,
        llm: Optional[ChatOpenAI] = None,
        model: str = "google/gemini-2.5-flash",
        max_validation_attempts: int = 6,
    ):
        """
        Initialize the Workout Management Agent.

        Args:
            llm: The language model to use
            model: Model to use if llm not provided
            max_validation_attempts: Maximum attempts to fix validation errors
        """
        self.llm = llm or ChatOpenAI(
            model=model,
            temperature=0.0,  # Zero temperature for maximum consistency
            openai_api_key=os.getenv("PRIVATE_OPENROUTER_API_KEY"),
            openai_api_base="https://openrouter.ai/api/v1",
        )
        self.validator = WorkoutValidator()
        self.max_validation_attempts = max_validation_attempts

    async def create_workout(
        self,
        user_id: str,
        workout_request: str,
        scheduled_date: Optional[datetime] = None,
        workout_type: str = "cycling",
    ) -> Dict:
        """
        Create a new workout with specific requirements.

        Args:
            user_id: User UUID as string
            workout_request: Description of the workout to create
            scheduled_date: Optional date when workout should be scheduled
            workout_type: Type of workout (cycling, running, swimming, training, hiking, rowing, walking)

        Returns:
            Dict with workout creation result
        """
        write_to_stream(
            {"type": "status", "content": f"Creating {workout_type} workout..."}
        )

        try:
            # Generate workout content
            workout_content = await self._generate_workout_content(
                workout_request, workout_type, user_id
            )

            # Validate and fix if necessary
            validated_workout, validation_result = await self._validate_and_fix_workout(
                workout_content, workout_type
            )

            if not validation_result["is_valid"]:
                write_to_stream(
                    {
                        "type": "error",
                        "content": "Failed to create valid workout format",
                    }
                )
                return {
                    "success": False,
                    "error": "Failed to create valid workout",
                    "validation_errors": validation_result["errors"],
                }

            # Save workout to database
            saved_workout = await self._save_workout_to_db(
                validated_workout, workout_type, user_id
            )

            # Optionally schedule the workout
            planned_workout = None
            if scheduled_date:
                planned_workout = await self._create_planned_workout(
                    saved_workout["id"], scheduled_date, user_id
                )

            workout_id = saved_workout["id"]
            workout_name = saved_workout.get("name", "Workout")
            # Format scheduled_date for the action if it exists
            scheduled_date_str = scheduled_date.isoformat() if scheduled_date else None
            action_content = {
                "type": "workout_creation",
                "id": workout_id,
                "workout_type": workout_type,
                "workout_name": workout_name,
            }
            if scheduled_date_str:
                action_content["scheduled_date"] = scheduled_date_str

            LOGGER.info(
                f"🎯 Emitting workout_creation action: workout_id={workout_id[:8]}, type={workout_type}, scheduled={scheduled_date_str}"
            )
            write_to_stream(
                {
                    "type": "action",
                    "content": json.dumps(action_content),
                }
            )
            LOGGER.info("✅ Action emitted successfully")

            write_to_stream(
                {
                    "type": "status",
                    "content": f"Workout created successfully (ID: {workout_id[:8]}...)",
                }
            )

            return {
                "success": True,
                "workout": saved_workout,
                "planned_workout": planned_workout,
                "validation_result": validation_result,
                "created_at": datetime.now().isoformat(),
            }

        except Exception as e:
            LOGGER.error(f"Error creating workout for user {user_id}: {e}")
            write_to_stream(
                {"type": "error", "content": f"Error creating workout: {str(e)}"}
            )
            return {
                "success": False,
                "error": str(e),
                "user_id": user_id,
            }

    async def modify_workout(
        self, workout_scheduled_id: str, modification_request: str, user_id: str
    ) -> Dict:
        """
        Modify an existing scheduled workout.

        Args:
            workout_scheduled_id: ID of the scheduled workout to modify
            modification_request: Description of the modifications needed
            user_id: User ID for authorization

        Returns:
            Dict with modification result
        """
        write_to_stream(
            {
                "type": "status",
                "content": f"Modifying scheduled workout {workout_scheduled_id[:8]}...",
            }
        )

        try:
            # Get existing scheduled workout
            existing_scheduled_workout = await self._get_workout_scheduled_by_id(
                workout_scheduled_id, user_id
            )
            if not existing_scheduled_workout:
                return {
                    "success": False,
                    "error": "Scheduled workout not found or access denied",
                }

            # Get the actual workout content
            workout_id = existing_scheduled_workout["workout_id"]
            existing_workout = await self._get_workout_by_id(workout_id, user_id)
            if not existing_workout:
                return {"success": False, "error": "Associated workout not found"}

            # Generate modified workout content
            modified_content = await self._generate_modified_workout(
                existing_workout["workout_text"],
                modification_request,
                existing_workout["sport"],
            )

            # Validate modified workout
            validated_workout, validation_result = await self._validate_and_fix_workout(
                modified_content, existing_workout["sport"]
            )

            if not validation_result["is_valid"]:
                write_to_stream(
                    {
                        "type": "error",
                        "content": "Failed to create valid modified workout",
                    }
                )
                return {
                    "success": False,
                    "error": "Failed to create valid modified workout",
                    "validation_errors": validation_result["errors"],
                }

            # Create a new workout with the modified content
            new_workout = await self._save_workout_to_db(
                validated_workout, existing_workout["sport"], user_id
            )

            # Update the scheduled workout to point to the new workout
            updated_scheduled_workout = await self._update_scheduled_workout_reference(
                workout_scheduled_id, new_workout["id"], user_id
            )

            write_to_stream(
                {
                    "type": "action",
                    "content": f'{{"type":"workout_scheduled_modification","id":"{workout_scheduled_id}","new_workout_id":"{new_workout["id"]}"}}',
                }
            )

            write_to_stream(
                {"type": "status", "content": "Scheduled workout modified successfully"}
            )

            return {
                "success": True,
                "scheduled_workout": updated_scheduled_workout,
                "new_workout": new_workout,
                "validation_result": validation_result,
                "modified_at": datetime.now().isoformat(),
            }

        except Exception as e:
            LOGGER.error(
                f"Error modifying scheduled workout {workout_scheduled_id}: {e}"
            )
            write_to_stream(
                {
                    "type": "error",
                    "content": f"Error modifying scheduled workout: {str(e)}",
                }
            )
            return {
                "success": False,
                "error": str(e),
                "workout_scheduled_id": workout_scheduled_id,
            }

    async def delete_workout_scheduled(
        self, workout_scheduled_id: str, user_id: str
    ) -> Dict:
        """
        Delete a scheduled workout and remove from Wahoo.

        Args:
            workout_scheduled_id: ID of the scheduled workout to delete
            user_id: User ID for authorization

        Returns:
            Dict with deletion result
        """
        write_to_stream(
            {
                "type": "status",
                "content": f"Deleting scheduled workout {workout_scheduled_id[:8]}...",
            }
        )

        try:
            # Check if scheduled workout exists and user has permission
            existing_workout = await self._get_workout_scheduled_by_id(
                workout_scheduled_id, user_id
            )
            if not existing_workout:
                return {
                    "success": False,
                    "error": "Scheduled workout not found or access denied",
                }

            # Enqueue deletion for synced providers
            # Always enqueue delete if provider is enabled - the enqueue_sync method will
            # cancel any pending creates, preventing orphaned workouts on external providers
            try:
                import asyncio
                from api.services.workout_sync import get_sync_service

                sync_service = get_sync_service()

                # Enqueue for Wahoo if enabled (will cancel pending creates if any)
                if sync_service.is_provider_enabled(user_id, "wahoo"):
                    asyncio.create_task(
                        sync_service.enqueue_sync(
                            user_id,
                            "workout_scheduled",
                            workout_scheduled_id,
                            "delete",
                            "wahoo",
                        )
                    )
                    LOGGER.info(
                        f"Enqueued scheduled workout deletion for Wahoo: {workout_scheduled_id[:8]}"
                    )

                # Enqueue for Garmin if enabled
                if sync_service.is_provider_enabled(user_id, "garmin"):
                    asyncio.create_task(
                        sync_service.enqueue_sync(
                            user_id,
                            "workout_scheduled",
                            workout_scheduled_id,
                            "delete",
                            "garmin",
                        )
                    )
                    LOGGER.info(
                        f"Enqueued scheduled workout deletion for Garmin: {workout_scheduled_id[:8]}"
                    )

            except Exception as sync_error:
                LOGGER.warning(
                    f"Failed to enqueue deletion for scheduled workout {workout_scheduled_id[:8]}: {sync_error}"
                )
                # Continue with local deletion even if enqueue fails

            # Delete from workouts_scheduled table
            result = (
                supabase.table("workouts_scheduled")
                .delete()
                .eq("id", workout_scheduled_id)
                .eq("user_id", user_id)
                .execute()
            )

            if not result.data:
                return {"success": False, "error": "Failed to delete scheduled workout"}

            write_to_stream(
                {
                    "type": "action",
                    "content": f'{{"type":"workout_scheduled_deletion","id":"{workout_scheduled_id}"}}',
                }
            )

            write_to_stream(
                {"type": "status", "content": "Scheduled workout deleted successfully"}
            )

            return {
                "success": True,
                "deleted_workout_scheduled_id": workout_scheduled_id,
                "deleted_at": datetime.now().isoformat(),
            }

        except Exception as e:
            LOGGER.error(
                f"Error deleting scheduled workout {workout_scheduled_id}: {e}"
            )
            write_to_stream(
                {
                    "type": "error",
                    "content": f"Error deleting scheduled workout: {str(e)}",
                }
            )
            return {
                "success": False,
                "error": str(e),
                "workout_scheduled_id": workout_scheduled_id,
            }

    async def delete_workouts_by_date(self, user_id: str, target_date: str) -> Dict:
        """
        Delete all workouts scheduled for a specific date.

        Args:
            user_id: User ID for authorization
            target_date: Date string (e.g., "2025-09-21", "tomorrow", "next Tuesday")

        Returns:
            Dict with deletion results
        """
        try:
            # Parse the date string into a datetime object
            parsed_date = self._parse_date_string(target_date)
            if not parsed_date:
                return {
                    "success": False,
                    "error": f"Could not parse date: {target_date}",
                }

            date_str = parsed_date.date().isoformat()
            write_to_stream(
                {
                    "type": "status",
                    "content": f"Finding workouts scheduled for {date_str}...",
                }
            )

            # Find all workouts scheduled for the target date
            workouts_to_delete = (
                supabase.table("workouts_scheduled")
                .select("id, scheduled_time, workouts(name)")
                .eq("user_id", user_id)
                .gte("scheduled_time", f"{date_str}T00:00:00")
                .lt("scheduled_time", f"{date_str}T23:59:59")
                .execute()
            )

            if not workouts_to_delete.data:
                return {
                    "success": True,
                    "message": f"No workouts found for {date_str}",
                    "deleted_count": 0,
                    "deleted_workout_ids": [],
                }

            deleted_ids = []
            deleted_workouts = []

            # Get sync service for enqueueing deletions
            try:
                import asyncio
                from api.services.workout_sync import get_sync_service

                sync_service = get_sync_service()
            except Exception as e:
                LOGGER.warning(f"Could not get sync service: {e}")
                sync_service = None

            # Delete each workout
            for workout in workouts_to_delete.data:
                workout_id = workout["id"]
                workout_name = workout.get("workouts", {}).get("name", "Unknown")

                # Enqueue deletion for synced providers before deleting locally
                # This will also cancel any pending creates
                if sync_service:
                    if sync_service.is_provider_enabled(user_id, "wahoo"):
                        asyncio.create_task(
                            sync_service.enqueue_sync(
                                user_id,
                                "workout_scheduled",
                                workout_id,
                                "delete",
                                "wahoo",
                            )
                        )
                    if sync_service.is_provider_enabled(user_id, "garmin"):
                        asyncio.create_task(
                            sync_service.enqueue_sync(
                                user_id,
                                "workout_scheduled",
                                workout_id,
                                "delete",
                                "garmin",
                            )
                        )

                result = (
                    supabase.table("workouts_scheduled")
                    .delete()
                    .eq("id", workout_id)
                    .eq("user_id", user_id)
                    .execute()
                )

                if result.data:
                    deleted_ids.append(workout_id)
                    deleted_workouts.append(
                        {
                            "id": workout_id,
                            "name": workout_name,
                            "scheduled_time": workout["scheduled_time"],
                        }
                    )

            write_to_stream(
                {
                    "type": "action",
                    "content": f'{{"type":"workouts_deleted_by_date","date":"{date_str}","count":{len(deleted_ids)}}}',
                }
            )

            write_to_stream(
                {
                    "type": "status",
                    "content": f"Successfully deleted {len(deleted_ids)} workouts for {date_str}",
                }
            )

            return {
                "success": True,
                "deleted_count": len(deleted_ids),
                "deleted_workout_ids": deleted_ids,
                "deleted_workouts": deleted_workouts,
                "target_date": date_str,
                "deleted_at": datetime.now().isoformat(),
            }

        except Exception as e:
            LOGGER.error(f"Error deleting workouts for date {target_date}: {e}")
            write_to_stream(
                {
                    "type": "error",
                    "content": f"Error deleting workouts for {target_date}: {str(e)}",
                }
            )
            return {
                "success": False,
                "error": str(e),
                "target_date": target_date,
            }

    async def modify_workouts_by_date(
        self, user_id: str, target_date: str, modification_request: str
    ) -> Dict:
        """
        Modify all workouts for a specific date by deleting existing ones and creating new ones.

        Args:
            user_id: User ID for authorization
            target_date: Date string (e.g., "2025-09-21", "tomorrow", "next Tuesday")
            modification_request: Description of what the new workouts should be

        Returns:
            Dict with modification results
        """
        try:
            # Parse the date string into a datetime object
            parsed_date = self._parse_date_string(target_date)
            if not parsed_date:
                return {
                    "success": False,
                    "error": f"Could not parse date: {target_date}",
                }

            date_str = parsed_date.date().isoformat()
            write_to_stream(
                {
                    "type": "status",
                    "content": f"Modifying workouts for {date_str}...",
                }
            )

            # Step 1: Delete existing workouts for the date
            deletion_result = await self.delete_workouts_by_date(user_id, target_date)

            if not deletion_result["success"]:
                return {
                    "success": False,
                    "error": f"Failed to delete existing workouts: {deletion_result.get('error', 'Unknown error')}",
                }

            # Step 2: Create new workout(s) based on the modification request
            # Determine workout type from the modification request
            workout_type = self._determine_workout_type(modification_request)

            # Create the new workout
            creation_result = await self.create_workout(
                user_id=user_id,
                workout_request=modification_request,
                scheduled_date=parsed_date,
                workout_type=workout_type,
            )

            if not creation_result["success"]:
                return {
                    "success": False,
                    "error": f"Failed to create new workout: {creation_result.get('error', 'Unknown error')}",
                    "deletion_result": deletion_result,
                }

            write_to_stream(
                {
                    "type": "action",
                    "content": f'{{"type":"workouts_modified_by_date","date":"{date_str}","deleted_count":{deletion_result["deleted_count"]},"created_workout_id":"{creation_result["workout"]["id"]}"}}',
                }
            )

            write_to_stream(
                {
                    "type": "status",
                    "content": f"Successfully modified workouts for {date_str}",
                }
            )

            return {
                "success": True,
                "target_date": date_str,
                "deletion_result": deletion_result,
                "creation_result": creation_result,
                "modified_at": datetime.now().isoformat(),
            }

        except Exception as e:
            LOGGER.error(f"Error modifying workouts for date {target_date}: {e}")
            write_to_stream(
                {
                    "type": "error",
                    "content": f"Error modifying workouts for {target_date}: {str(e)}",
                }
            )
            return {
                "success": False,
                "error": str(e),
                "target_date": target_date,
            }

    def _parse_date_string(self, date_string: str) -> Optional[datetime]:
        """
        Parse various date string formats into a datetime object.

        Args:
            date_string: Date in various formats (ISO, "tomorrow", "next Tuesday", etc.)

        Returns:
            Parsed datetime object or None if parsing fails
        """
        try:
            # First try direct ISO format parsing
            if re.match(r"\d{4}-\d{2}-\d{2}", date_string):
                return datetime.strptime(date_string[:10], "%Y-%m-%d")

            # Handle common natural language dates manually if dateparser not available
            date_string_lower = date_string.lower().strip()
            today = datetime.now()

            if date_string_lower in ["today"]:
                return today
            elif date_string_lower in ["tomorrow"]:
                return today + timedelta(days=1)
            elif date_string_lower in ["yesterday"]:
                return today - timedelta(days=1)
            elif "next week" in date_string_lower:
                return today + timedelta(days=7)

            # Use dateparser for more complex natural language dates if available
            if dateparser:
                parsed = dateparser.parse(
                    date_string, settings={"PREFER_DATES_FROM": "future"}
                )
                if parsed:
                    return parsed

            # If dateparser is not available, try basic parsing
            LOGGER.warning(
                f"dateparser not available and couldn't parse '{date_string}' with basic parsing"
            )
            return None

        except Exception as e:
            LOGGER.warning(f"Failed to parse date string '{date_string}': {e}")
            return None

    def _determine_workout_type(self, modification_request: str) -> str:
        """
        Determine the workout type from the modification request.

        Args:
            modification_request: The workout modification description

        Returns:
            Workout type string
        """
        request_lower = modification_request.lower()

        # Check for rest day keywords FIRST (before other sports)
        if any(
            word in request_lower
            for word in ["rest", "recovery", "off", "rest day", "recovery day"]
        ):
            return "rest_day"
        elif any(
            word in request_lower
            for word in ["cycling", "bike", "ride", "ftp", "power"]
        ):
            return "cycling"
        elif any(
            word in request_lower for word in ["running", "run", "pace", "marathon"]
        ):
            return "running"
        elif any(
            word in request_lower for word in ["swimming", "swim", "pool", "stroke"]
        ):
            return "swimming"
        elif any(
            word in request_lower
            for word in ["strength", "weights", "lifting", "gym", "training"]
        ):
            return "training"
        elif any(word in request_lower for word in ["hiking", "hike", "trail"]):
            return "hiking"
        elif any(word in request_lower for word in ["rowing", "row", "erg"]):
            return "rowing"
        elif any(word in request_lower for word in ["walking", "walk"]):
            return "walking"
        else:
            # Default to training if unclear
            return "training"

    async def _generate_workout_content(
        self, workout_request: str, workout_type: str, user_id: str
    ) -> str:
        """Generate workout content based on request."""

        # Handle rest day generation without LLM (simple format)
        if workout_type == "rest_day":
            workout_name = "Rest Day"
            recovery_notes = ""

            # Customize based on request keywords
            if "active" in workout_request.lower():
                workout_name = "Active Recovery Day"
                recovery_notes = "\nLight movement or stretching recommended"
            elif "complete" in workout_request.lower():
                workout_name = "Complete Rest Day"
                recovery_notes = "\nFull rest and recovery"
            elif "stretch" in workout_request.lower():
                workout_name = "Recovery Day"
                recovery_notes = "\nLight stretching recommended"
            elif "mobility" in workout_request.lower():
                workout_name = "Recovery Day"
                recovery_notes = "\nMobility work recommended"

            return f"rest_day\n{workout_name}\n{recovery_notes}"

        system_prompt = f"""You are a specialized sub-agent responsible for creating workout plans.
        Your task is to generate a workout in a precise text format based on a request from the main agent.
        Adhere strictly to the format specification provided below.

        # WORKOUT FORMAT SPECIFICATION
        {WORKOUTDEFINITION}

        # INPUT PARAMETERS
        - WORKOUT_TYPE: "{workout_type}"
        - USER_REQUEST: "{workout_request}"

        # TASK
        Generate the complete workout text based on the user request and workout type.
        The output must be ONLY the workout text and nothing else.
        Ensure your response starts with the sport type on the first line.
        DO NOT wrap the output in markdown code blocks or any other formatting.
        """

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content="Create the workout now using the exact format."),
        ]

        LOGGER.info(f"Generating workout content for: {workout_request}")
        response = await self.llm.ainvoke(messages)
        generated_content = self._strip_markdown_code_blocks(response.content.strip())

        LOGGER.info(f"Generated workout content:\n{generated_content}")
        return generated_content

    async def _generate_modified_workout(
        self, existing_workout: str, modification_request: str, workout_type: str
    ) -> str:
        """Generate modified workout content."""

        system_prompt = f"""You are an expert fitness coach modifying an existing workout.

        EXISTING WORKOUT:
        {existing_workout}

        MODIFICATION REQUEST: "{modification_request}"

        CRITICAL: Follow this EXACT workout format specification:
        {WORKOUTDEFINITION}

        TASK: Modify the existing workout according to the request while maintaining the exact format.
        Keep the same sport type and structure, but adjust according to the modification request.
        DO NOT wrap the output in markdown code blocks or any other formatting.
        """

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(
                content="Modify the workout according to the request using the exact format."
            ),
        ]

        response = await self.llm.ainvoke(messages)
        return self._strip_markdown_code_blocks(response.content.strip())

    async def _validate_and_fix_workout(
        self,
        workout_content: str,
        workout_type: str,
    ) -> Tuple[str, Dict]:
        """Validate workout and fix errors if necessary."""

        current_workout = workout_content
        attempts = 0

        LOGGER.info(f"Starting validation for {workout_type} workout")
        LOGGER.debug(f"Initial workout content:\n{current_workout}")

        # Special handling for rest days - they use a different format
        if workout_type == "rest_day":
            lines = current_workout.strip().split("\n")
            # Basic validation for rest days
            if len(lines) >= 2 and lines[0].strip().lower() == "rest_day":
                # Check for workout steps (which shouldn't exist)
                has_steps = any(line.strip().startswith("-") for line in lines[3:])
                if not has_steps:
                    LOGGER.info("Rest day workout validated successfully")
                    return current_workout, {
                        "is_valid": True,
                        "errors": [],
                        "attempts": 1,
                    }
                else:
                    LOGGER.warning("Rest day contains workout steps, needs fixing")

        while attempts < self.max_validation_attempts:
            attempts += 1

            # Validate current workout
            is_valid, errors = self.validator.validate_text(current_workout)

            if is_valid:
                LOGGER.info(f"Workout validation successful after {attempts} attempts")
                return current_workout, {
                    "is_valid": True,
                    "errors": [],
                    "attempts": attempts,
                }

            error_messages = [e.message for e in errors]
            LOGGER.warning(
                f"Validation attempt {attempts} failed. Errors: {error_messages}"
            )
            LOGGER.error(
                f"Failed workout content (attempt {attempts}):\n{current_workout}"
            )

            # If not valid and we have attempts left, try to fix
            if attempts < self.max_validation_attempts:
                current_workout = await self._fix_validation_errors(
                    current_workout, errors, workout_type
                )
                LOGGER.debug(
                    f"Fixed workout content (attempt {attempts + 1}):\n{current_workout}"
                )

        # If we've exhausted attempts, return the last version with errors
        LOGGER.error(
            f"Workout validation failed after {attempts} attempts. Final content:\n{current_workout}"
        )
        return current_workout, {
            "is_valid": False,
            "errors": [
                {"line": e.line_number, "type": e.error_type, "message": e.message}
                for e in errors
            ],
            "attempts": attempts,
        }

    async def _fix_validation_errors(
        self,
        workout_content: str,
        errors: List,
        workout_type: str,
    ) -> str:
        """Fix validation errors in workout content."""

        error_descriptions = []
        for error in errors:
            error_descriptions.append(
                f"Line {error.line_number}: {error.error_type} - {error.message}"
            )

        LOGGER.info(f"Attempting to fix {len(errors)} validation errors")
        LOGGER.debug(f"Errors to fix: {error_descriptions}")

        system_prompt = f"""You are an expert fitness coach fixing workout format errors.

        CRITICAL: Follow this EXACT workout format specification:
        {WORKOUTDEFINITION}

        CURRENT WORKOUT (WITH ERRORS):
        {workout_content}

        VALIDATION ERRORS TO FIX:
        {chr(10).join(error_descriptions)}

        IMPORTANT FORMAT RULES TO FIX:
        1. Line 1: Sport type MUST be exactly (lowercase): cycling, running, swimming, training, hiking, rowing, walking, or rest_day
        2. Line 2: Workout name/title
        3. Line 3: MUST be completely empty (blank line)
        4. Duration format: 10m, 8m30s, 2h, 0.4km (NOT "5x" or "Easy warm-up")
        5. SPECIAL: If workout_type is "rest_day", DO NOT include any workout steps (lines starting with -)
        5. Intensity format: Z1, Z2, Z3, %FTP 75%, %HR 80%, Power 200W (NOT "at Z1" or "Easy warm-up at Z1")
        6. Steps format: "- 10m Z1 #comment" (NOT "- 10m Easy warm-up at Z1")

        TASK: Fix ONLY the format errors. Keep the same workout structure and training intent.
        Replace invalid formats with correct ones from the specification.
        DO NOT wrap the output in markdown code blocks or any other formatting.
        """

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(
                content="Fix the validation errors in the workout while keeping the training intent intact."
            ),
        ]

        response = await self.llm.ainvoke(messages)
        fixed_content = self._strip_markdown_code_blocks(response.content.strip())

        LOGGER.info(f"Generated fix for validation errors:\n{fixed_content}")
        return fixed_content

    def _strip_markdown_code_blocks(self, content: str) -> str:
        """
        Strip markdown code blocks from LLM-generated content.

        LLMs sometimes wrap workout content in markdown code blocks like:
        ```
        training
        Workout Name
        ...
        ```

        or:

        ```python
        training
        Workout Name
        ...
        ```

        or even:

        ```training
        Workout Name
        ...
        ```

        This method removes those code blocks to get the raw workout content.

        Args:
            content: The potentially markdown-wrapped content

        Returns:
            Content with markdown code blocks removed
        """
        content = content.strip()

        # Check if content starts with ``` and ends with ```
        if content.startswith("```") and content.endswith("```"):
            # Remove the opening ```
            content = content[3:]

            # Check if there's text before the first newline (could be language identifier or empty)
            first_newline = content.find("\n")
            if first_newline != -1:
                line_after_backticks = content[:first_newline].strip()
                # If there's text and it's NOT a valid workout type, it's a language identifier - remove it
                # If it's empty, also remove it (it's just a blank line)
                # If it IS a valid workout type, keep everything as-is (e.g., ```training should keep "training")
                if not line_after_backticks or (
                    line_after_backticks
                    and line_after_backticks not in WorkoutValidator.WORKOUT_TYPES
                ):
                    content = content[first_newline + 1 :]

            # Remove the closing ```
            if content.endswith("```"):
                content = content[:-3]

            content = content.strip()

        return content

    async def _save_workout_to_db(
        self,
        workout_content: str,
        workout_type: str,
        user_id: str,
    ) -> Dict:
        """Save workout to the workouts table and trigger Wahoo sync."""
        try:
            # Extract workout name from content
            lines = workout_content.strip().split("\n")
            workout_name = lines[1] if len(lines) > 1 else f"{workout_type} Workout"

            # Calculate estimated duration from content
            estimated_minutes = self._calculate_workout_duration(workout_content)

            # Save to database
            result = (
                supabase.table("workouts")
                .insert(
                    {
                        "name": workout_name,
                        "description": "",
                        "sport": workout_type,
                        "workout_minutes": estimated_minutes,
                        "workout_text": workout_content,
                        "is_public": False,
                        "user_id": user_id,
                    }
                )
                .execute()
            )

            if not result.data:
                raise Exception("Failed to save workout to database")

            saved_workout = result.data[0]

            # Skip external sync for rest days (devices don't support rest day workouts)
            if workout_type != "rest_day":
                # Enqueue for batch sync to enabled providers
                try:
                    import asyncio
                    from api.services.workout_sync import get_sync_service

                    workout_id = saved_workout["id"]
                    sync_service = get_sync_service()

                    # Enqueue for Wahoo if enabled
                    if sync_service.is_provider_enabled(user_id, "wahoo"):
                        asyncio.create_task(
                            sync_service.enqueue_sync(
                                user_id, "workout", workout_id, "create", "wahoo"
                            )
                        )
                        LOGGER.info(
                            f"Enqueued workout for Wahoo sync: {workout_id[:8]}"
                        )

                    # Enqueue for Garmin if enabled
                    if sync_service.is_provider_enabled(user_id, "garmin"):
                        asyncio.create_task(
                            sync_service.enqueue_sync(
                                user_id, "workout", workout_id, "create", "garmin"
                            )
                        )
                        LOGGER.info(
                            f"Enqueued workout for Garmin sync: {workout_id[:8]}"
                        )

                except Exception as sync_error:
                    LOGGER.warning(
                        f"Error during sync enqueue for {saved_workout['id'][:8]}: {sync_error}",
                        exc_info=True,
                    )
                    # Don't fail the workout creation if enqueue fails

            return saved_workout

        except Exception as e:
            LOGGER.error(f"Error saving workout: {e}")
            raise

    async def _update_workout_in_db(
        self,
        workout_id: str,
        workout_content: str,
        user_id: str,
    ) -> Dict:
        """Update workout in the database and trigger Wahoo re-sync."""
        try:
            # Extract workout name from content
            lines = workout_content.strip().split("\n")
            workout_name = lines[1] if len(lines) > 1 else "Modified Workout"

            # Calculate estimated duration from content
            estimated_minutes = self._calculate_workout_duration(workout_content)

            # Update workout in database
            result = (
                supabase.table("workouts")
                .update(
                    {
                        "name": workout_name,
                        "workout_minutes": estimated_minutes,
                        "workout_text": workout_content,
                        "updated_at": datetime.now().isoformat(),
                    }
                )
                .eq("id", workout_id)
                .eq("user_id", user_id)
                .execute()
            )

            if not result.data:
                raise Exception("Failed to update workout in database")

            updated_workout = result.data[0]

            # Enqueue for batch re-sync to enabled providers
            try:
                import asyncio
                from api.services.workout_sync import get_sync_service

                sync_service = get_sync_service()

                # Enqueue for Wahoo if enabled
                if sync_service.is_provider_enabled(user_id, "wahoo"):
                    asyncio.create_task(
                        sync_service.enqueue_sync(
                            user_id, "workout", workout_id, "update", "wahoo"
                        )
                    )
                    LOGGER.info(
                        f"Enqueued workout update for Wahoo sync: {workout_id[:8]}"
                    )

                # Enqueue for Garmin if enabled
                if sync_service.is_provider_enabled(user_id, "garmin"):
                    asyncio.create_task(
                        sync_service.enqueue_sync(
                            user_id, "workout", workout_id, "update", "garmin"
                        )
                    )
                    LOGGER.info(
                        f"Enqueued workout update for Garmin sync: {workout_id[:8]}"
                    )

            except Exception as sync_error:
                LOGGER.warning(
                    f"Failed to enqueue workout update for sync {workout_id[:8]}: {sync_error}"
                )
                # Don't fail the workout update if enqueue fails

            return updated_workout

        except Exception as e:
            LOGGER.error(f"Error updating workout: {e}")
            raise

    async def _get_workout_by_id(self, workout_id: str, user_id: str) -> Optional[Dict]:
        """Get workout by ID for the specific user."""
        try:
            result = (
                supabase.table("workouts")
                .select("*")
                .eq("id", workout_id)
                .eq("user_id", user_id)
                .execute()
            )

            if result.data:
                return result.data[0]
            return None

        except Exception as e:
            LOGGER.error(f"Error getting workout {workout_id}: {e}")
            return None

    async def _get_workout_scheduled_by_id(
        self, workout_scheduled_id: str, user_id: str
    ) -> Optional[Dict]:
        """Get scheduled workout by ID for the specific user."""
        try:
            result = (
                supabase.table("workouts_scheduled")
                .select("*, workouts(*)")
                .eq("id", workout_scheduled_id)
                .eq("user_id", user_id)
                .execute()
            )

            if result.data:
                return result.data[0]
            return None

        except Exception as e:
            LOGGER.error(f"Error getting scheduled workout {workout_scheduled_id}: {e}")
            return None

    async def _create_planned_workout(
        self,
        workout_id: str,
        scheduled_date: datetime,
        user_id: str,
    ) -> Dict:
        """Create a planned workout entry and trigger Wahoo sync."""
        try:
            result = (
                supabase.table("workouts_scheduled")
                .insert(
                    {
                        "workout_id": workout_id,
                        "scheduled_time": scheduled_date.isoformat(),
                        "user_id": user_id,
                    }
                )
                .execute()
            )

            if not result.data:
                raise Exception("Failed to create planned workout")

            planned_workout = result.data[0]

            # Enqueue for batch sync to enabled providers
            try:
                import asyncio
                from api.services.workout_sync import get_sync_service

                scheduled_id = planned_workout["id"]
                sync_service = get_sync_service()

                # Enqueue for Wahoo if enabled
                if sync_service.is_provider_enabled(user_id, "wahoo"):
                    asyncio.create_task(
                        sync_service.enqueue_sync(
                            user_id,
                            "workout_scheduled",
                            scheduled_id,
                            "create",
                            "wahoo",
                        )
                    )
                    LOGGER.info(
                        f"Enqueued scheduled workout for Wahoo sync: {scheduled_id[:8]}"
                    )

                # Enqueue for Garmin if enabled
                if sync_service.is_provider_enabled(user_id, "garmin"):
                    asyncio.create_task(
                        sync_service.enqueue_sync(
                            user_id,
                            "workout_scheduled",
                            scheduled_id,
                            "create",
                            "garmin",
                        )
                    )
                    LOGGER.info(
                        f"Enqueued scheduled workout for Garmin sync: {scheduled_id[:8]}"
                    )

            except Exception as sync_error:
                LOGGER.warning(
                    f"Failed to enqueue scheduled workout for sync {planned_workout['id'][:8]}: {sync_error}"
                )
                # Don't fail the scheduled workout creation if enqueue fails

            return planned_workout

        except Exception as e:
            LOGGER.error(f"Error creating planned workout: {e}")
            raise

    async def _update_scheduled_workout_reference(
        self,
        workout_scheduled_id: str,
        new_workout_id: str,
        user_id: str,
    ) -> Dict:
        """Update a scheduled workout to reference a new workout and trigger Wahoo re-sync."""
        try:
            result = (
                supabase.table("workouts_scheduled")
                .update(
                    {
                        "workout_id": new_workout_id,
                        "updated_at": datetime.now().isoformat(),
                    }
                )
                .eq("id", workout_scheduled_id)
                .eq("user_id", user_id)
                .execute()
            )

            if not result.data:
                raise Exception("Failed to update scheduled workout reference")

            updated_scheduled = result.data[0]

            # Enqueue for batch re-sync to enabled providers
            try:
                import asyncio
                from api.services.workout_sync import get_sync_service

                sync_service = get_sync_service()

                # Enqueue for Wahoo if enabled
                if sync_service.is_provider_enabled(user_id, "wahoo"):
                    asyncio.create_task(
                        sync_service.enqueue_sync(
                            user_id,
                            "workout_scheduled",
                            workout_scheduled_id,
                            "update",
                            "wahoo",
                        )
                    )
                    LOGGER.info(
                        f"Enqueued scheduled workout update for Wahoo sync: {workout_scheduled_id[:8]}"
                    )

                # Enqueue for Garmin if enabled
                if sync_service.is_provider_enabled(user_id, "garmin"):
                    asyncio.create_task(
                        sync_service.enqueue_sync(
                            user_id,
                            "workout_scheduled",
                            workout_scheduled_id,
                            "update",
                            "garmin",
                        )
                    )
                    LOGGER.info(
                        f"Enqueued scheduled workout update for Garmin sync: {workout_scheduled_id[:8]}"
                    )

            except Exception as sync_error:
                LOGGER.warning(
                    f"Failed to enqueue scheduled workout update for sync {workout_scheduled_id[:8]}: {sync_error}"
                )
                # Don't fail the update if enqueue fails

            return updated_scheduled

        except Exception as e:
            LOGGER.error(f"Error updating scheduled workout reference: {e}")
            raise

    async def _remove_scheduled_workouts(self, workout_id: str, user_id: str):
        """Remove scheduled instances of a workout."""
        try:
            result = (
                supabase.table("workouts_scheduled")
                .delete()
                .eq("workout_id", workout_id)
                .eq("user_id", user_id)
                .execute()
            )
            return result

        except Exception as e:
            LOGGER.error(f"Error removing scheduled workouts: {e}")

    def _calculate_workout_duration(self, workout_content: str) -> int:
        """
        Calculate estimated workout duration in minutes, accounting for repetitions.
        Uses the shared calculation function from api.routers.workouts.
        """
        try:
            LOGGER.info("Calculating workout duration from content")
            # Use the shared calculation function from the router
            # It returns (estimated_time, estimated_hr_load)
            estimated_time, _ = calculate_workout_estimates(workout_content)
            LOGGER.info(f"Estimated workout duration: {estimated_time} minutes")

            # Return the estimated time, or default if None
            return estimated_time if estimated_time is not None else 45

        except Exception as e:
            LOGGER.warning(f"Error calculating workout duration: {e}")
            return 45  # Default to 45 minutes


# Singleton instance for use by tools
_workout_agent_instance = None


def get_workout_management_agent() -> WorkoutManagementAgent:
    """Get singleton instance of WorkoutManagementAgent."""
    global _workout_agent_instance
    if _workout_agent_instance is None:
        _workout_agent_instance = WorkoutManagementAgent()
    return _workout_agent_instance


# Example usage and testing
async def main():
    """Test the Workout Management Agent."""
    agent = WorkoutManagementAgent()

    # Test create workout
    user_id = "2e04d74c-3d0b-45bc-83a0-bbdd8640b6a5"  # Example UUID

    # Create a workout
    result = await agent.create_workout(
        user_id=user_id,
        workout_request="Create a 3 hour interval training for maximum vo2max ",
        scheduled_date=datetime.now() + timedelta(days=1),
        workout_type="cycling",
    )

    LOGGER.info("Creation Result:")
    LOGGER.info(f"Success: {result['success']}")
    if result["success"]:
        workout_id = result["workout"]["id"]
        scheduled_workout_id = result["planned_workout"]["id"]
        LOGGER.info(f"Workout ID: {workout_id}")
        LOGGER.info(f"Scheduled Workout ID: {scheduled_workout_id}")
        LOGGER.info(f"Workout Content: {result['workout']['workout_text']}")

        # Modify the scheduled workout
        modify_result = await agent.modify_workout(
            workout_scheduled_id=scheduled_workout_id,
            modification_request="Change to a 2 hour endurance ride at Z2",
            user_id=user_id,
        )

        if modify_result["success"]:
            LOGGER.info("\nModification Result:")
            LOGGER.info(f"Success: {modify_result['success']}")
            LOGGER.info(
                f"New Workout Content: {modify_result['new_workout']['workout_text']}"
            )

            # Delete the scheduled workout
            delete_result = await agent.delete_workout_scheduled(
                workout_scheduled_id=scheduled_workout_id,
                user_id=user_id,
            )

            if delete_result["success"]:
                LOGGER.info("\nDeletion Result:")
                LOGGER.info(f"Success: {delete_result['success']}")
                LOGGER.info(
                    f"Deleted Scheduled Workout ID: {delete_result['deleted_workout_scheduled_id']}"
                )
            else:
                LOGGER.error(
                    f"Deletion Error: {delete_result.get('error', 'Unknown error')}"
                )
        else:
            LOGGER.error(
                f"Modification Error: {modify_result.get('error', 'Unknown error')}"
            )
    else:
        LOGGER.error(f"Creation Error: {result.get('error', 'Unknown error')}")


if __name__ == "__main__":
    asyncio.run(main())
