"""Unified workout sync service for all providers (Wahoo, Garmin, etc.)."""

import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any, TYPE_CHECKING
from uuid import UUID

from api.database import supabase
from api.log import LOGGER

# Import base classes and exceptions at module level
from api.providers.base import (
    WorkoutSyncProvider,
    RateLimitError,
    AuthenticationError,
    RecordNotFoundError,
    ProviderError,
)

# Lazy import providers to avoid circular imports
if TYPE_CHECKING:
    pass


class WorkoutSyncService:
    """Unified service for syncing workouts across all providers."""

    def __init__(self):
        """Initialize workout sync service with all providers."""
        # Lazy import providers to avoid circular import issues
        from api.providers.wahoo import WahooProvider
        from api.providers.garmin import GarminProvider

        self.providers: Dict[str, WorkoutSyncProvider] = {
            "wahoo": WahooProvider(),
            "garmin": GarminProvider(),
        }

    def _get_provider(self, provider_name: str) -> Optional[WorkoutSyncProvider]:
        """Get provider by name."""
        return self.providers.get(provider_name)

    def is_provider_enabled(self, user_id: UUID, provider_name: str) -> bool:
        """Check if user has provider enabled for workout sync.

        Args:
            user_id: User UUID
            provider_name: Provider name ('wahoo', 'garmin', etc.)

        Returns:
            True if provider is connected and upload_workouts_enabled is True
        """
        try:
            result = (
                supabase.table(f"{provider_name}_tokens")
                .select("upload_workouts_enabled")
                .eq("user_id", str(user_id))
                .execute()
            )

            if not result.data:
                return False

            return result.data[0].get("upload_workouts_enabled", False)

        except Exception as e:
            LOGGER.error(
                f"Error checking if {provider_name} is enabled for user {user_id}: {e}"
            )
            return False

    async def enqueue_sync(
        self,
        user_id: UUID,
        entity_type: str,
        entity_id: UUID,
        operation: str,
        provider: str,
    ) -> bool:
        """Enqueue a sync operation for processing.

        Args:
            user_id: User UUID
            entity_type: 'workout' or 'workout_scheduled'
            entity_id: UUID of the entity to sync
            operation: 'create', 'update', or 'delete'
            provider: Provider name ('wahoo', 'garmin', etc.)

        Returns:
            True if enqueued successfully
        """
        try:
            # Check if this exact operation is already queued (pending)
            existing = (
                supabase.table("workout_sync_queue")
                .select("id")
                .eq("entity_type", entity_type)
                .eq("entity_id", str(entity_id))
                .eq("provider", provider)
                .eq("operation", operation)
                .is_("processed_at", "null")
                .execute()
            )

            if existing.data:
                LOGGER.info(
                    f"Sync operation already queued: {provider} {entity_type} {entity_id} {operation}"
                )
                return True

            # If this is a delete operation, cancel any pending create/update for this entity
            # This prevents orphaned workouts on external providers when create-then-delete happens quickly
            if operation == "delete":
                cancelled = (
                    supabase.table("workout_sync_queue")
                    .update(
                        {
                            "processed_at": datetime.now(timezone.utc).isoformat(),
                            "error_type": "cancelled_by_delete",
                            "error_message": "Cancelled because entity was deleted before sync completed",
                        }
                    )
                    .eq("entity_type", entity_type)
                    .eq("entity_id", str(entity_id))
                    .eq("provider", provider)
                    .is_("processed_at", "null")
                    .in_("operation", ["create", "update"])
                    .execute()
                )
                if cancelled.data:
                    LOGGER.info(
                        f"Cancelled {len(cancelled.data)} pending sync(s) for deleted {entity_type} {entity_id} on {provider}"
                    )

            # Create queue entry
            queue_data = {
                "user_id": str(user_id),
                "entity_type": entity_type,
                "entity_id": str(entity_id),
                "operation": operation,
                "provider": provider,
                "retry_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            supabase.table("workout_sync_queue").insert(queue_data).execute()
            LOGGER.info(
                f"Enqueued sync: {provider} {entity_type} {entity_id} {operation}"
            )
            return True

        except Exception as e:
            LOGGER.error(f"Error enqueueing sync operation: {e}", exc_info=True)
            return False

    async def process_queue_entry(self, queue_entry: Dict[str, Any]) -> bool:
        """Process a single queue entry.

        Args:
            queue_entry: Queue entry data

        Returns:
            True if processing succeeded, False otherwise
        """
        queue_id = queue_entry["id"]
        user_id = UUID(queue_entry["user_id"])
        entity_type = queue_entry["entity_type"]
        entity_id = UUID(queue_entry["entity_id"])
        operation = queue_entry["operation"]
        provider_name = queue_entry["provider"]
        retry_count = queue_entry.get("retry_count", 0)

        LOGGER.info(
            f"Processing {provider_name} {entity_type} {entity_id} {operation} (attempt {retry_count + 1})"
        )

        # Get provider
        provider = self._get_provider(provider_name)
        if not provider:
            LOGGER.error(f"Unknown provider: {provider_name}")
            self._mark_queue_entry_failed(
                queue_id,
                "unknown_provider",
                f"Unknown provider: {provider_name}",
                max_retries_reached=True,
            )
            return False

        try:
            # Fetch entity data
            entity_data = await self._fetch_entity_data(entity_type, entity_id)

            # Execute operation
            if operation == "delete":
                success = await self._handle_delete(
                    provider, user_id, entity_type, entity_id, entity_data
                )
            else:  # create or update (both handled the same way)
                success = await self._handle_sync(
                    provider, user_id, entity_type, entity_id, entity_data
                )

            if success:
                # Mark as processed
                supabase.table("workout_sync_queue").update(
                    {
                        "processed_at": datetime.now(timezone.utc).isoformat(),
                        "error_type": None,
                        "error_message": None,
                    }
                ).eq("id", queue_id).execute()
                LOGGER.info(f"Successfully processed queue entry {queue_id}")
                return True
            else:
                # Operation failed but didn't raise exception
                self._mark_queue_entry_failed(
                    queue_id, "operation_failed", "Operation returned False"
                )
                return False

        except RecordNotFoundError as e:
            # Record doesn't exist (already deleted or never created)
            LOGGER.info(f"Record not found for queue entry {queue_id}: {e}")
            # Mark as processed (no point retrying)
            supabase.table("workout_sync_queue").update(
                {
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "error_type": "record_not_found",
                    "error_message": str(e),
                }
            ).eq("id", queue_id).execute()
            return True

        except RateLimitError as e:
            # Rate limit exceeded, schedule retry with backoff
            LOGGER.warning(f"Rate limit hit for queue entry {queue_id}: {e}")
            retry_after = (
                e.retry_after if e.retry_after else self._calculate_backoff(retry_count)
            )
            next_retry_at = datetime.fromtimestamp(
                time.time() + retry_after, tz=timezone.utc
            )

            supabase.table("workout_sync_queue").update(
                {
                    "retry_count": retry_count + 1,
                    "next_retry_at": next_retry_at.isoformat(),
                    "error_type": "rate_limit",
                    "error_message": str(e),
                }
            ).eq("id", queue_id).execute()
            return False

        except AuthenticationError as e:
            # Auth failed, don't retry (user needs to reconnect)
            LOGGER.error(f"Authentication error for queue entry {queue_id}: {e}")
            self._mark_queue_entry_failed(
                queue_id, "auth_error", str(e), max_retries_reached=True
            )
            return False

        except ProviderError as e:
            # Provider-specific error, retry with backoff
            LOGGER.error(f"Provider error for queue entry {queue_id}: {e}")
            self._mark_queue_entry_failed(queue_id, "provider_error", str(e))
            return False

        except Exception as e:
            # Unexpected error, retry with backoff
            LOGGER.error(
                f"Unexpected error processing queue entry {queue_id}: {e}",
                exc_info=True,
            )
            self._mark_queue_entry_failed(queue_id, "unexpected_error", str(e))
            return False

    async def _fetch_entity_data(
        self, entity_type: str, entity_id: UUID
    ) -> Optional[Dict[str, Any]]:
        """Fetch entity data from database.

        Args:
            entity_type: 'workout' or 'workout_scheduled'
            entity_id: Entity UUID

        Returns:
            Entity data or None if not found

        Raises:
            RecordNotFoundError: If record doesn't exist
        """
        try:
            if entity_type == "workout":
                result = (
                    supabase.table("workouts")
                    .select("*")
                    .eq("id", str(entity_id))
                    .execute()
                )
            elif entity_type == "workout_scheduled":
                result = (
                    supabase.table("workouts_scheduled")
                    .select("*, workouts(*)")
                    .eq("id", str(entity_id))
                    .execute()
                )
            else:
                raise ValueError(f"Unknown entity type: {entity_type}")

            if not result.data:
                raise RecordNotFoundError(f"{entity_type} {entity_id} not found")

            return result.data[0]

        except RecordNotFoundError:
            raise
        except Exception as e:
            LOGGER.error(f"Error fetching {entity_type} {entity_id}: {e}")
            raise

    async def _handle_sync(
        self,
        provider: WorkoutSyncProvider,
        user_id: UUID,
        entity_type: str,
        entity_id: UUID,
        entity_data: Optional[Dict[str, Any]],
    ) -> bool:
        """Handle create/update sync operation.

        Args:
            provider: Provider instance
            user_id: User UUID
            entity_type: 'workout' or 'workout_scheduled'
            entity_id: Entity UUID
            entity_data: Entity data

        Returns:
            True if sync succeeded
        """
        if not entity_data:
            raise RecordNotFoundError(f"{entity_type} {entity_id} not found")

        if entity_type == "workout":
            return await provider.sync_workout(user_id, entity_id, entity_data)
        elif entity_type == "workout_scheduled":
            return await provider.sync_scheduled_workout(
                user_id, entity_id, entity_data
            )
        else:
            raise ValueError(f"Unknown entity type: {entity_type}")

    async def _handle_delete(
        self,
        provider: WorkoutSyncProvider,
        user_id: UUID,
        entity_type: str,
        entity_id: UUID,
        entity_data: Optional[Dict[str, Any]],
    ) -> bool:
        """Handle delete operation.

        Args:
            provider: Provider instance
            user_id: User UUID
            entity_type: 'workout' or 'workout_scheduled'
            entity_id: Entity UUID
            entity_data: Entity data (may be None if already deleted)

        Returns:
            True if delete succeeded
        """
        # Extract provider-specific ID if available
        provider_id = None
        if entity_data:
            if entity_type == "workout":
                provider_id = entity_data.get(
                    f"{provider.provider_name}_plan_id"
                ) or entity_data.get(f"{provider.provider_name}_workout_id")
            elif entity_type == "workout_scheduled":
                provider_id = entity_data.get(f"{provider.provider_name}_workout_id")

        if entity_type == "workout":
            return await provider.delete_workout(user_id, entity_id, provider_id)
        elif entity_type == "workout_scheduled":
            return await provider.delete_scheduled_workout(
                user_id, entity_id, provider_id
            )
        else:
            raise ValueError(f"Unknown entity type: {entity_type}")

    def _mark_queue_entry_failed(
        self,
        queue_id: str,
        error_type: str,
        error_message: str,
        max_retries_reached: bool = False,
    ) -> None:
        """Mark queue entry as failed and schedule retry if applicable.

        Args:
            queue_id: Queue entry ID
            error_type: Error type classification
            error_message: Error message
            max_retries_reached: If True, mark as processed (give up)
        """
        try:
            # Get current retry count
            result = (
                supabase.table("workout_sync_queue")
                .select("retry_count")
                .eq("id", queue_id)
                .execute()
            )

            if not result.data:
                LOGGER.error(f"Queue entry {queue_id} not found")
                return

            retry_count = result.data[0].get("retry_count", 0)
            max_retries = 3

            update_data = {
                "retry_count": retry_count + 1,
                "error_type": error_type,
                "error_message": error_message,
            }

            # Check if we should give up
            if max_retries_reached or retry_count + 1 >= max_retries:
                # Mark as processed (give up)
                update_data["processed_at"] = datetime.now(timezone.utc).isoformat()
                LOGGER.error(
                    f"Queue entry {queue_id} failed permanently after {retry_count + 1} attempts"
                )
            else:
                # Schedule retry with exponential backoff
                backoff_seconds = self._calculate_backoff(retry_count)
                next_retry_at = datetime.fromtimestamp(
                    time.time() + backoff_seconds, tz=timezone.utc
                )
                update_data["next_retry_at"] = next_retry_at.isoformat()
                LOGGER.info(
                    f"Queue entry {queue_id} will retry in {backoff_seconds}s (attempt {retry_count + 2})"
                )

            supabase.table("workout_sync_queue").update(update_data).eq(
                "id", queue_id
            ).execute()

        except Exception as e:
            LOGGER.error(f"Error marking queue entry as failed: {e}", exc_info=True)

    def _calculate_backoff(self, retry_count: int) -> int:
        """Calculate exponential backoff delay in seconds.

        Args:
            retry_count: Current retry count (0-based)

        Returns:
            Backoff delay in seconds
        """
        # Exponential backoff: 2min, 10min, 60min
        delays = [120, 600, 3600]
        if retry_count >= len(delays):
            return delays[-1]
        return delays[retry_count]

    async def process_all_queues(self) -> Dict[str, int]:
        """Process all pending queue entries across all providers.

        Returns:
            Dictionary with success/failure counts
        """
        stats = {"processed": 0, "failed": 0, "skipped": 0}

        try:
            # Get all pending queue entries, ordered by creation time
            # Include entries ready for retry (next_retry_at <= now or null)
            now = datetime.now(timezone.utc).isoformat()

            result = (
                supabase.table("workout_sync_queue")
                .select("*")
                .is_("processed_at", "null")
                .or_(f"next_retry_at.is.null,next_retry_at.lte.{now}")
                .order("created_at")
                .execute()
            )

            queue_entries = result.data

            if not queue_entries:
                LOGGER.info("No pending queue entries to process")
                return stats

            LOGGER.info(f"Processing {len(queue_entries)} queue entries")

            # Process entries sequentially (to respect rate limits)
            for entry in queue_entries:
                success = await self.process_queue_entry(entry)
                if success:
                    stats["processed"] += 1
                else:
                    stats["failed"] += 1

            LOGGER.info(
                f"Batch processing complete: {stats['processed']} succeeded, {stats['failed']} failed"
            )

        except Exception as e:
            LOGGER.error(f"Error processing queues: {e}", exc_info=True)

        return stats

    def get_sync_status(
        self,
        entity_type: str,
        entity_id: UUID,
        provider: str,
    ) -> Optional[Dict[str, Any]]:
        """Get the latest sync status for an entity with a specific provider.

        Args:
            entity_type: 'workout' or 'workout_scheduled'
            entity_id: Entity UUID
            provider: Provider name ('wahoo', 'garmin', etc.)

        Returns:
            Dictionary with sync status or None if never synced:
            {
                'synced': bool,  # True if successfully synced
                'pending': bool,  # True if queued but not processed
                'failed': bool,  # True if processed with error
                'error_type': str or None,
                'error_message': str or None,
                'last_attempt': str or None,  # ISO timestamp
                'retry_count': int,
            }
        """
        try:
            # Get the most recent queue entry for this entity/provider
            result = (
                supabase.table("workout_sync_queue")
                .select("*")
                .eq("entity_type", entity_type)
                .eq("entity_id", str(entity_id))
                .eq("provider", provider)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )

            if not result.data:
                return None

            entry = result.data[0]

            # Determine status
            is_processed = entry["processed_at"] is not None
            has_error = entry["error_type"] is not None

            return {
                "synced": is_processed and not has_error,
                "pending": not is_processed,
                "failed": is_processed and has_error,
                "error_type": entry.get("error_type"),
                "error_message": entry.get("error_message"),
                "last_attempt": entry.get("processed_at") or entry.get("created_at"),
                "retry_count": entry.get("retry_count", 0),
            }

        except Exception as e:
            LOGGER.error(
                f"Error getting sync status for {entity_type} {entity_id} ({provider}): {e}"
            )
            return None

    def get_all_sync_statuses(
        self,
        entity_type: str,
        entity_id: UUID,
    ) -> Dict[str, Optional[Dict[str, Any]]]:
        """Get sync status for an entity across all providers.

        Args:
            entity_type: 'workout' or 'workout_scheduled'
            entity_id: Entity UUID

        Returns:
            Dictionary mapping provider names to their sync status:
            {
                'wahoo': {...},
                'garmin': {...},
                ...
            }
        """
        statuses = {}
        for provider_name in self.providers.keys():
            statuses[provider_name] = self.get_sync_status(
                entity_type, entity_id, provider_name
            )
        return statuses


# Global service instance (lazy-initialized to avoid circular imports)
_sync_service: Optional[WorkoutSyncService] = None


def get_sync_service() -> WorkoutSyncService:
    """Get the global workout sync service instance (lazy-initialized)."""
    global _sync_service
    if _sync_service is None:
        _sync_service = WorkoutSyncService()
    return _sync_service
