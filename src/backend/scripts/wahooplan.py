from api.database import supabase
from api.routers.wahoo.helpers import get_valid_access_token


def get_user_id_by_email(email: str) -> str:
    """Get user ID based on email address"""
    response = supabase.auth.admin.list_users()
    for user in response:
        if hasattr(user, "email") and user.email == email:
            return user.id
    raise Exception(f"User with email {email} not found")


# Replace with your own email
user_id = get_user_id_by_email("test@example.com")


access_token = get_valid_access_token(user_id)
print("Access Token:", access_token)
print("Access Token:", access_token)
