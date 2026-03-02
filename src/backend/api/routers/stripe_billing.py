"""
Stripe billing router - handles direct Stripe checkout and portal sessions for web billing.
"""

import os

import stripe
from api.auth import User, get_current_user
from api.log import LOGGER
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(
    prefix="/stripe",
    tags=["stripe", "billing"],
    dependencies=[],
)

# Stripe API configuration
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_PRODUCT_ID = os.getenv("STRIPE_PRODUCT_ID", "prod_TO3KbDq1yErO8N")
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "price_1SRHDS0xcOuMcpDBHgaEdyq9")

# Initialize Stripe
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY
else:
    LOGGER.warning("STRIPE_SECRET_KEY not configured - Stripe billing will not work")


class CheckoutSessionRequest(BaseModel):
    success_url: str | None = None
    cancel_url: str | None = None


class CheckoutSessionResponse(BaseModel):
    url: str
    session_id: str


class PortalSessionResponse(BaseModel):
    url: str


@router.post("/create-checkout-session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    request: CheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
) -> CheckoutSessionResponse:
    """
    Create a Stripe Checkout Session for subscription purchase.

    This endpoint creates a Stripe Checkout Session for web-based subscription purchases.
    The session includes the user's app_user_id in metadata so RevenueCat can properly
    associate the purchase with the user account.

    Flow:
    1. User clicks subscribe on web
    2. Frontend calls this endpoint
    3. Backend creates Stripe Checkout Session with user metadata
    4. Frontend redirects user to Stripe Checkout
    5. User completes payment
    6. Stripe sends webhook to RevenueCat
    7. RevenueCat forwards webhook to our backend
    8. User entitlement is synced

    Returns:
        CheckoutSessionResponse with checkout URL and session ID

    Raises:
        HTTPException: If Stripe is not configured or session creation fails
    """
    if not STRIPE_SECRET_KEY:
        LOGGER.error("Stripe secret key not configured")
        raise HTTPException(status_code=500, detail="Stripe billing is not configured")

    if not STRIPE_PRICE_ID:
        LOGGER.error("Stripe price ID not configured")
        raise HTTPException(status_code=500, detail="Stripe billing is not configured")

    user_id = str(current_user.id)
    user_email = current_user.email

    # Use provided URLs or fall back to environment variables
    success_url = request.success_url or os.getenv(
        "STRIPE_SUCCESS_URL",
        "exp://localhost:8081/--/subscription-success?session_id={CHECKOUT_SESSION_ID}",
    )
    cancel_url = request.cancel_url or os.getenv(
        "STRIPE_CANCEL_URL", "exp://localhost:8081/--/subscription-cancelled"
    )

    LOGGER.info(
        f"Creating checkout session for user {user_id} ({user_email}) with success_url: {success_url}"
    )

    try:
        # Create Stripe Checkout Session
        # Important: app_user_id in metadata is used by RevenueCat to identify the user
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[
                {
                    "price": STRIPE_PRICE_ID,
                    "quantity": 1,
                }
            ],
            # Prefill customer email for better UX
            customer_email=user_email,
            # Use client_reference_id for tracking the user
            client_reference_id=user_id,
            # Success and cancel URLs - provided by frontend or from environment
            success_url=success_url,
            cancel_url=cancel_url,
            # Allow users to apply promo codes
            allow_promotion_codes=True,
            # Collect billing address
            billing_address_collection="auto",
            # Set subscription metadata - RevenueCat will read app_user_id from here
            metadata={
                "app_user_id": user_id,
            },
            subscription_data={
                "trial_period_days": 7,
                "metadata": {
                    "app_user_id": user_id,
                },
            },
        )

        LOGGER.info(f"Created Stripe Checkout Session for user {user_id}: {session.id}")

        return CheckoutSessionResponse(url=session.url, session_id=session.id)

    except stripe.error.StripeError as e:
        LOGGER.error(f"Stripe error creating checkout session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to create checkout session: {str(e)}"
        )
    except Exception as e:
        LOGGER.error(f"Unexpected error creating checkout session: {str(e)}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred")


@router.post("/create-portal-session", response_model=PortalSessionResponse)
async def create_portal_session(
    current_user: User = Depends(get_current_user),
) -> PortalSessionResponse:
    """
    Get the Stripe Customer Portal URL for subscription management.

    This endpoint returns the static Stripe Customer Portal URL where users can:
    - Cancel their subscription
    - Update payment method
    - View billing history
    - Download invoices

    Returns:
        PortalSessionResponse with portal URL

    Raises:
        HTTPException: If Stripe Customer Portal URL is not configured
    """
    # Get the static customer portal URL from environment variables
    portal_url = os.getenv("STRIPE_CUSTOMER_PORTAL_URL")

    if not portal_url:
        LOGGER.error("Stripe Customer Portal URL not configured")
        raise HTTPException(
            status_code=500, detail="Stripe Customer Portal is not configured"
        )

    user_id = str(current_user.id)
    LOGGER.info(f"Returning Stripe Customer Portal URL for user {user_id}")

    return PortalSessionResponse(url=portal_url)
