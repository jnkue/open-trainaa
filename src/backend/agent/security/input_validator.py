"""
Input validation and sanitization for prompt injection prevention.

Based on OWASP LLM Prompt Injection Prevention Cheat Sheet.
https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
"""

import base64
import re
from typing import Optional

from agent.log import LOGGER

# Maximum input length (characters)
MAX_INPUT_LENGTH = 10000

# Patterns that indicate potential prompt injection attempts
# These are case-insensitive regex patterns
INJECTION_PATTERNS: list[tuple[str, str]] = [
    # Instruction override attempts
    (r"ignore\s+(all\s+)?(previous\s+)?instructions?", "instruction_override"),
    (r"forget\s+(all\s+)?(your\s+)?instructions?", "instruction_override"),
    (r"disregard\s+(all\s+)?(previous\s+)?instructions?", "instruction_override"),
    (r"override\s+(previous\s+)?instructions?", "instruction_override"),
    (r"new\s+instructions?\s*:", "instruction_override"),
    # Role/persona manipulation
    (r"you\s+are\s+now\s+(a|an)\b", "role_manipulation"),
    (r"act\s+as\s+(a|an)\s+(?!coach|trainer)", "role_manipulation"),
    (r"pretend\s+(to\s+be|you\'?re)\s+(a|an)", "role_manipulation"),
    (
        r"(switch|change)\s+(to\s+)?(a\s+)?(new|different)\s+persona",
        "role_manipulation",
    ),
    (r"from\s+now\s+on\s+you\s+(are|will)", "role_manipulation"),
    # Jailbreak attempts
    (r"developer\s*mode", "jailbreak"),
    (r"jailbreak", "jailbreak"),
    (r"DAN\s*mode", "jailbreak"),
    (r"do\s+anything\s+now", "jailbreak"),
    (r"bypass\s+(safety|filter|restriction)", "jailbreak"),
    (r"unlock\s+(your|hidden)\s+(potential|capabilities)", "jailbreak"),
    # System prompt extraction
    (r"reveal\s+(your\s+)?(system\s+)?prompt", "prompt_extraction"),
    (r"show\s+(me\s+)?(your\s+)?(system\s+)?prompt", "prompt_extraction"),
    (r"what\s+(is|are)\s+your\s+(system\s+)?instructions?", "prompt_extraction"),
    (r"repeat\s+(your\s+)?(initial\s+)?instructions?", "prompt_extraction"),
    (r"print\s+(your\s+)?(system\s+)?prompt", "prompt_extraction"),
    (r"output\s+(your\s+)?(system\s+)?prompt", "prompt_extraction"),
    (r"display\s+(your\s+)?(system\s+)?prompt", "prompt_extraction"),
    # Markup/format injection
    (r"\[SYSTEM\]", "markup_injection"),
    (r"\[INST\]", "markup_injection"),
    (r"<\|im_start\|>", "markup_injection"),
    (r"<\|im_end\|>", "markup_injection"),
    (r"<<SYS>>", "markup_injection"),
    (r"<</SYS>>", "markup_injection"),
    (r"###\s*(System|Instruction|Human|Assistant)\s*:", "markup_injection"),
]

# Compile patterns for performance
_COMPILED_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(pattern, re.IGNORECASE), category)
    for pattern, category in INJECTION_PATTERNS
]


def validate_input(user_query: str) -> tuple[bool, Optional[str]]:
    """
    Validate user input for potential prompt injection attempts.

    Args:
        user_query: The user's input text

    Returns:
        Tuple of (is_valid, rejection_reason)
        - is_valid: True if input passes validation
        - rejection_reason: Description of why input was rejected, or None if valid
    """
    if not user_query:
        return True, None

    # Check input length
    if len(user_query) > MAX_INPUT_LENGTH:
        LOGGER.warning(
            f"Input rejected: exceeds max length ({len(user_query)} > {MAX_INPUT_LENGTH})"
        )
        return False, "input_too_long"

    # Check for injection patterns
    for pattern, category in _COMPILED_PATTERNS:
        if pattern.search(user_query):
            LOGGER.warning(
                f"Potential injection detected: category={category}, "
                f"pattern={pattern.pattern[:50]}"
            )
            return False, category

    # Check for encoding obfuscation attempts
    if _detect_encoding_attempts(user_query):
        LOGGER.warning("Potential encoding obfuscation detected")
        return False, "encoding_obfuscation"

    return True, None


def _detect_encoding_attempts(text: str) -> bool:
    """
    Detect potential Base64 or hex encoding used for obfuscation.

    Only flags if the decoded content contains suspicious patterns.

    Args:
        text: Input text to check

    Returns:
        True if suspicious encoded content is detected
    """
    # Look for Base64-like patterns (min 20 chars to avoid false positives)
    base64_pattern = re.compile(r"[A-Za-z0-9+/]{20,}={0,2}")
    matches = base64_pattern.findall(text)

    for match in matches:
        try:
            # Try to decode and check for injection patterns
            decoded = base64.b64decode(match).decode("utf-8", errors="ignore")
            if decoded and len(decoded) > 10:
                # Check if decoded content contains injection patterns
                for pattern, _ in _COMPILED_PATTERNS:
                    if pattern.search(decoded):
                        LOGGER.warning(
                            f"Injection pattern found in Base64: {match[:30]}..."
                        )
                        return True
        except Exception:
            # Not valid Base64, ignore
            pass

    return False


def sanitize_input(user_query: str) -> str:
    """
    Sanitize user input by normalizing whitespace and removing problematic patterns.

    This is a light sanitization that preserves the user's intent while
    removing potential attack vectors.

    Args:
        user_query: The user's input text

    Returns:
        Sanitized input text
    """
    if not user_query:
        return user_query

    # Normalize whitespace (collapse multiple spaces/newlines)
    sanitized = re.sub(r"\s+", " ", user_query)

    # Remove excessive character repetition (e.g., "aaaaaa" -> "aaa")
    sanitized = re.sub(r"(.)\1{10,}", r"\1\1\1", sanitized)

    # Strip leading/trailing whitespace
    sanitized = sanitized.strip()

    return sanitized
