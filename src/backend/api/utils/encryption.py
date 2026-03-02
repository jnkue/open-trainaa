"""
Field-level encryption utilities using Fernet symmetric encryption.

Used for encrypting sensitive user data (e.g., BYOK API keys) before
storing in the database.

Requires FIELD_ENCRYPTION_KEY environment variable to be set.
Generate a key with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""

import os

from cryptography.fernet import Fernet, InvalidToken
from api.log import LOGGER

_FIELD_ENCRYPTION_KEY = os.getenv("FIELD_ENCRYPTION_KEY")


def _get_fernet() -> Fernet:
    if not _FIELD_ENCRYPTION_KEY:
        raise ValueError("FIELD_ENCRYPTION_KEY environment variable not configured")
    return Fernet(_FIELD_ENCRYPTION_KEY.encode())


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt an API key for database storage."""
    fernet = _get_fernet()
    return fernet.encrypt(plaintext.encode()).decode()


def decrypt_api_key(ciphertext: str) -> str:
    """Decrypt an API key from database storage."""
    try:
        fernet = _get_fernet()
        return fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        LOGGER.error("Failed to decrypt API key - invalid token or corrupted data")
        raise ValueError("Failed to decrypt API key")
