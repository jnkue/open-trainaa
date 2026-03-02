"""
Error handling and user-facing message generation.

This module provides a clear separation between internal errors (logged and sent to Sentry)
and user-facing messages (friendly, actionable, never exposing internal details).
"""

import traceback
from enum import Enum
from typing import Optional

import sentry_sdk
from agent.log import LOGGER


class ErrorSeverity(Enum):
    """Error severity levels for classification."""

    LOW = "low"  # Minor issues, user can continue
    MEDIUM = "medium"  # Partial functionality impaired
    HIGH = "high"  # Major functionality broken
    CRITICAL = "critical"  # System-wide failure


class ErrorType(Enum):
    """Types of errors that can occur."""

    # Infrastructure
    DATABASE_ERROR = "database_error"
    API_ERROR = "api_error"
    NETWORK_ERROR = "network_error"
    TIMEOUT_ERROR = "timeout_error"

    # Agent/LLM
    LLM_ERROR = "llm_error"
    TOOL_ERROR = "tool_error"
    VALIDATION_ERROR = "validation_error"

    # User Input
    INVALID_INPUT = "invalid_input"
    AUTHENTICATION_ERROR = "authentication_error"
    PERMISSION_ERROR = "permission_error"

    # Unknown
    UNKNOWN_ERROR = "unknown_error"


class AgentError(Exception):
    """
    Base exception for agent errors with user-facing message generation.

    Attributes:
        error_type: Classification of the error
        severity: How critical the error is
        user_message: Friendly message to show to end users
        internal_message: Detailed message for logging/debugging
        recoverable: Whether the operation can be retried
    """

    def __init__(
        self,
        error_type: ErrorType,
        internal_message: str,
        user_message: Optional[str] = None,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        recoverable: bool = True,
        original_exception: Optional[Exception] = None,
    ):
        self.error_type = error_type
        self.severity = severity
        self.internal_message = internal_message
        self.user_message = user_message or self._generate_user_message(error_type)
        self.recoverable = recoverable
        self.original_exception = original_exception

        super().__init__(self.internal_message)

    @staticmethod
    def _generate_user_message(error_type: ErrorType) -> str:
        """Generate a friendly user-facing message based on error type."""
        messages = {
            ErrorType.DATABASE_ERROR: "I'm having trouble accessing the database right now. Please try again in a moment.",
            ErrorType.API_ERROR: "I encountered an issue connecting to external services. Please try again.",
            ErrorType.NETWORK_ERROR: "There seems to be a network connectivity issue. Please check your connection and try again.",
            ErrorType.TIMEOUT_ERROR: "The request is taking longer than expected. Please try again.",
            ErrorType.LLM_ERROR: "I'm having trouble processing your request right now. Please try rephrasing or try again later.",
            ErrorType.TOOL_ERROR: "I encountered an issue while accessing your data. Please try again.",
            ErrorType.VALIDATION_ERROR: "The information provided doesn't match the expected format. Please check and try again.",
            ErrorType.INVALID_INPUT: "I couldn't understand that request. Could you please rephrase it?",
            ErrorType.AUTHENTICATION_ERROR: "Your session has expired. Please log in again.",
            ErrorType.PERMISSION_ERROR: "You don't have permission to perform this action.",
            ErrorType.UNKNOWN_ERROR: "Something unexpected happened. Please try again, and if the issue persists, contact support.",
        }
        return messages.get(error_type, messages[ErrorType.UNKNOWN_ERROR])


def handle_error(
    error: Exception,
    context: str,
    user_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    send_to_sentry: bool = True,
) -> AgentError:
    """
    Handle an error by logging, sending to Sentry, and creating a user-facing error.

    Args:
        error: The original exception
        context: Description of what was being done when the error occurred
        user_id: User identifier for context
        thread_id: Thread identifier for context
        send_to_sentry: Whether to send this error to Sentry

    Returns:
        AgentError: A structured error with user-facing message
    """
    # Classify the error
    error_type, severity, recoverable = _classify_error(error)

    # Create internal message with full context
    internal_message = f"Error in {context}: {type(error).__name__}: {str(error)}"

    # Log the error with appropriate level
    log_level_map = {
        ErrorSeverity.LOW: LOGGER.info,
        ErrorSeverity.MEDIUM: LOGGER.warning,
        ErrorSeverity.HIGH: LOGGER.error,
        ErrorSeverity.CRITICAL: LOGGER.critical,
    }
    log_func = log_level_map[severity]
    log_func(f"{internal_message}")
    LOGGER.debug(f"Traceback: {traceback.format_exc()}")

    # Send to Sentry if enabled and severity is high enough
    should_send_to_sentry = send_to_sentry and severity in [
        ErrorSeverity.HIGH,
        ErrorSeverity.CRITICAL,
    ]

    # Check analytics consent for user-specific errors
    if should_send_to_sentry and user_id:
        from api.utils.consent import check_analytics_consent

        if not check_analytics_consent(user_id):
            LOGGER.debug(f"Skipping Sentry for user {user_id} - no analytics consent")
            should_send_to_sentry = False

    if should_send_to_sentry:
        with sentry_sdk.push_scope() as scope:
            scope.set_context(
                "agent_context",
                {
                    "context": context,
                    "error_type": error_type.value,
                    "severity": severity.value,
                    "recoverable": recoverable,
                },
            )
            if user_id:
                scope.set_user({"id": user_id})
            if thread_id:
                scope.set_tag("thread_id", thread_id)

            sentry_sdk.capture_exception(error)

    # Create and return AgentError
    return AgentError(
        error_type=error_type,
        internal_message=internal_message,
        severity=severity,
        recoverable=recoverable,
        original_exception=error,
    )


def _classify_error(error: Exception) -> tuple[ErrorType, ErrorSeverity, bool]:
    """
    Classify an error to determine its type, severity, and recoverability.

    Returns:
        tuple: (ErrorType, ErrorSeverity, recoverable: bool)
    """
    error_type = type(error).__name__
    error_message = str(error).lower()

    # Database errors
    if "psycopg" in error_type.lower() or "database" in error_message:
        return ErrorType.DATABASE_ERROR, ErrorSeverity.HIGH, True

    # Network/timeout errors
    if "timeout" in error_message or "timed out" in error_message:
        return ErrorType.TIMEOUT_ERROR, ErrorSeverity.MEDIUM, True

    if "connection" in error_message or "network" in error_message:
        return ErrorType.NETWORK_ERROR, ErrorSeverity.MEDIUM, True

    # API errors
    if "api" in error_message or "http" in error_type.lower():
        return ErrorType.API_ERROR, ErrorSeverity.MEDIUM, True

    # LLM errors
    if "openai" in error_type.lower() or "anthropic" in error_type.lower():
        return ErrorType.LLM_ERROR, ErrorSeverity.MEDIUM, True

    # Validation errors
    if "validation" in error_message or "invalid" in error_message:
        return ErrorType.VALIDATION_ERROR, ErrorSeverity.LOW, True

    # Authentication/Permission
    if (
        "auth" in error_message
        or "permission" in error_message
        or "unauthorized" in error_message
    ):
        return ErrorType.AUTHENTICATION_ERROR, ErrorSeverity.MEDIUM, False

    # Tool errors
    if "tool" in error_message:
        return ErrorType.TOOL_ERROR, ErrorSeverity.MEDIUM, True

    # Default: unknown error
    return ErrorType.UNKNOWN_ERROR, ErrorSeverity.MEDIUM, True


def get_user_friendly_message(
    error: Exception, context: str = "processing your request"
) -> str:
    """
    Get a user-friendly error message without exposing internal details.

    Args:
        error: The exception that occurred
        context: What the system was doing (e.g., "creating a workout")

    Returns:
        str: A friendly message safe to show to end users
    """
    if isinstance(error, AgentError):
        return error.user_message

    # Classify and generate message for unknown errors
    error_type, _, _ = _classify_error(error)
    base_message = AgentError._generate_user_message(error_type)

    # Add context if appropriate
    if context and context != "processing your request":
        return f"{base_message} I was trying to {context} when this happened."

    return base_message
