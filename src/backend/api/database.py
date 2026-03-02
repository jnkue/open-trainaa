"""
Database configuration and initialization.
Provides the Supabase client for the entire application.
"""

import os

from dotenv import load_dotenv

from supabase import Client, create_client

# Load environment variables
load_dotenv()

# Prefer the service role key for server-side operations where RLS needs to be bypassed.
# Make sure PRIVATE_SUPABASE_KEY is set in your server environment (do NOT commit it).
url: str = os.environ.get("PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
key: str | None = os.environ.get("PRIVATE_SUPABASE_KEY")


if not url:
    raise RuntimeError(
        "Supabase URL not configured. Set PUBLIC_SUPABASE_URL or SUPABASE_URL in environment."
    )

if not key:
    raise RuntimeError(
        "Supabase Key not configured. Set PRIVATE_SUPABASE_KEY in environment."
    )


supabase: Client = create_client(url, key)
