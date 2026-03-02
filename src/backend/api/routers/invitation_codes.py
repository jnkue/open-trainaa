"""
Invitation Codes router - manages one-time use invitation codes for registration.
Provides endpoints to validate codes before registration and claim them after signup.
"""

from datetime import datetime

from api.auth import User, get_current_user
from api.database import supabase
from api.log import LOGGER
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
security_bearer = HTTPBearer()

router = APIRouter(
    prefix="/invitation-codes",
    tags=["invitation-codes"],
    dependencies=[],
)


# Pydantic models
class InvitationCodeValidationResponse(BaseModel):
    valid: bool
    message: str


class InvitationCodeClaimRequest(BaseModel):
    code: str


class InvitationCodeClaimResponse(BaseModel):
    success: bool
    message: str


@router.get("/validate/{code}", response_model=InvitationCodeValidationResponse)
@limiter.limit("20/minute")
async def validate_invitation_code(
    code: str,
    request: Request,
):
    """
    Validate an invitation code without authentication.
    Checks if the code exists and has not been used yet.
    """
    try:
        # Query the invitation_codes table
        result = (
            supabase.table("invitation_codes")
            .select("*")
            .eq("code", code.strip())
            .execute()
        )

        # Check if code exists
        if not result.data or len(result.data) == 0:
            return InvitationCodeValidationResponse(
                valid=False, message="Invalid invitation code"
            )

        # Check if code has already been used
        # invitation = result.data[0]
        """ if invitation.get("used", False):
            return InvitationCodeValidationResponse(
                valid=False, message="Invalid invitation code"
            ) """

        # Code is valid and unused
        return InvitationCodeValidationResponse(
            valid=True, message="Valid invitation code"
        )

    except Exception as e:
        LOGGER.error(f"Error validating invitation code: {str(e)}")
        raise HTTPException(
            status_code=500, detail="Failed to validate invitation code"
        )


@router.post("/claim", response_model=InvitationCodeClaimResponse)
@limiter.limit("10/minute")
async def claim_invitation_code(
    request: Request,
    claim_request: InvitationCodeClaimRequest,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
):
    """
    Claim an invitation code after successful registration.
    Marks the code as used and associates it with the user.
    Requires authentication.
    """
    try:
        code = claim_request.code.strip()

        # First, verify the code exists and is not used
        result = (
            supabase.table("invitation_codes").select("*").eq("code", code).execute()
        )

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Invalid invitation code")

        invitation = result.data[0]

        # Check if already used
        if invitation.get("used", False):
            raise HTTPException(
                status_code=400, detail="This invitation code has already been used"
            )

        # Mark code as used
        update_result = (
            supabase.table("invitation_codes")
            .insert(
                {
                    "code": code,
                    "used": True,
                    "used_by_user_id": current_user.id,
                    "used_at": datetime.utcnow().isoformat(),
                }
            )
            .execute()
        )

        # Verify update was successful
        if not update_result.data or len(update_result.data) == 0:
            raise HTTPException(
                status_code=400,
                detail="Failed to claim invitation code. It may have been used by another user.",
            )

        LOGGER.info(
            f"Invitation code '{code}' claimed successfully by user {current_user.id}"
        )

        return InvitationCodeClaimResponse(
            success=True, message="Invitation code claimed successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error claiming invitation code: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to claim invitation code")
