from api.database import supabase


def get_user_id_by_email(email: str) -> str:
    """Get user ID based on email address"""
    response = supabase.auth.admin.list_users()
    for user in response:
        if hasattr(user, "email") and user.email == email:
            return user.id
    raise Exception(f"User with email {email} not found")


# Test configuration - replace with your own email
user_id = get_user_id_by_email("test@example.com")
