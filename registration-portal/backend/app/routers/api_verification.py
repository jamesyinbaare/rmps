"""API verification endpoints (requires API key)."""
import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials

from app.dependencies.api_key_auth import api_key_security, get_api_key_user
from app.dependencies.database import DBSessionDep
from app.models import ApiKey, ApiRequestSource, ApiRequestType, PortalUser
from app.routers.dashboard_verification import verify_dashboard_candidate
from app.schemas.result import PublicResultCheckRequest, PublicResultResponse
from app.schemas.verification import (
    BulkVerificationRequest,
    BulkVerificationResponse,
    VerificationItemResponse,
)
from app.services.api_usage_tracker import record_api_usage
from app.services.credit_service import check_credit_balance
from app.services.rate_limiter import rate_limiter
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/verify", tags=["verification"])


async def verify_single_candidate(
    request_data: PublicResultCheckRequest,
    session: DBSessionDep,
) -> PublicResultResponse:
    """Helper function to verify a single candidate (uses dashboard verification logic)."""
    # Use the dashboard verification logic which supports index_number-only lookup
    return await verify_dashboard_candidate(request_data, session)


@router.post("")
async def verify_candidates(
    request: Request,
    session: DBSessionDep,
    authorization: HTTPAuthorizationCredentials | None = Depends(api_key_security),
    x_api_key: str | None = Header(None, alias="X-API-Key"),
) -> PublicResultResponse | BulkVerificationResponse:
    """
    Unified verification endpoint that handles both single and bulk requests.

    Request body can be:
    - Single: {"index_number": "...", "exam_type": "...", "exam_series": "...", "year": ...}
      or {"registration_number": "...", "exam_type": "...", "exam_series": "...", "year": ...}
    - Bulk: {"items": [{"index_number": "...", ...}, ...]}

    Note: Either index_number or registration_number must be provided.
    exam_series is required only for Certificate II Examinations.
    """
    start_time = datetime.utcnow()

    # Authenticate API key
    user, api_key = await get_api_key_user(session, authorization, x_api_key)

    # Check credit balance
    from decimal import Decimal
    cost = Decimal(str(settings.credit_cost_per_verification))
    has_credit = await check_credit_balance(session, user.id, cost)
    if not has_credit:
        await record_api_usage(
            session,
            user_id=user.id,
            api_key_id=api_key.id,
            request_source=ApiRequestSource.API_KEY,
            request_type=ApiRequestType.SINGLE,
            verification_count=0,
            response_status=status.HTTP_402_PAYMENT_REQUIRED,
            duration_ms=int((datetime.utcnow() - start_time).total_seconds() * 1000),
            start_time=start_time,
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient credit. Required: {cost} credit(s) per verification request.",
        )

    # Check rate limit
    is_allowed, remaining = rate_limiter.check_rate_limit(
        api_key.id,
        api_key.rate_limit_per_minute,
        api_key.request_count_reset_at,
    )
    if not is_allowed:
        await record_api_usage(
            session,
            user_id=user.id,
            api_key_id=api_key.id,
            request_source=ApiRequestSource.API_KEY,
            request_type=ApiRequestType.SINGLE,
            verification_count=0,
            response_status=status.HTTP_429_TOO_MANY_REQUESTS,
            duration_ms=int((datetime.utcnow() - start_time).total_seconds() * 1000),
            start_time=start_time,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={"X-RateLimit-Remaining": "0"},
        )

    # Get request body
    import json
    body = await request.json()

    # Detect request type
    is_bulk = "items" in body and isinstance(body["items"], list)

    try:
        if is_bulk:
            # Bulk request
            bulk_request = BulkVerificationRequest(**body)

            if len(bulk_request.items) > settings.api_key_bulk_request_max_items:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Maximum {settings.api_key_bulk_request_max_items} items allowed per bulk request",
                )

            results = []
            successful = 0
            failed = 0

            for item in bulk_request.items:
                try:
                    result = await verify_single_candidate(item, session)
                    results.append(
                        VerificationItemResponse(
                            success=True,
                            request=item,
                            result=result,
                            error=None,
                        )
                    )
                    successful += 1
                except Exception as e:
                    results.append(
                        VerificationItemResponse(
                            success=False,
                            request=item,
                            result=None,
                            error=str(e),
                        )
                    )
                    failed += 1

            verification_count = len(bulk_request.items)
            response_status = status.HTTP_200_OK

            response = BulkVerificationResponse(
                total=len(bulk_request.items),
                successful=successful,
                failed=failed,
                results=results,
            )
        else:
            # Single request
            single_request = PublicResultCheckRequest(**body)
            result = await verify_single_candidate(single_request, session)
            verification_count = 1
            response_status = status.HTTP_200_OK
            response = result

        # Record usage
        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        await record_api_usage(
            session,
            user_id=user.id,
            api_key_id=api_key.id,
            request_source=ApiRequestSource.API_KEY,
            request_type=ApiRequestType.BULK if is_bulk else ApiRequestType.SINGLE,
            verification_count=verification_count,
            response_status=response_status,
            duration_ms=duration_ms,
            start_time=start_time,
        )

        return response

    except HTTPException as e:
        # Record usage for HTTP exceptions (404, 403, etc.) but don't bill
        # Only successful responses (200) will be billed by record_api_usage
        response_status = e.status_code
        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)

        # For HTTP exceptions, no successful verifications
        verification_count = 0

        await record_api_usage(
            session,
            user_id=user.id,
            api_key_id=api_key.id,
            request_source=ApiRequestSource.API_KEY,
            request_type=ApiRequestType.BULK if is_bulk else ApiRequestType.SINGLE,
            verification_count=verification_count,
            response_status=response_status,
            duration_ms=duration_ms,
            start_time=start_time,
        )
        # Re-raise the HTTP exception
        raise
    except Exception as e:
        # Record error
        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        await record_api_usage(
            session,
            user_id=user.id,
            api_key_id=api_key.id,
            request_source=ApiRequestSource.API_KEY,
            request_type=ApiRequestType.BULK if is_bulk else ApiRequestType.SINGLE,
            verification_count=0,
            response_status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            duration_ms=duration_ms,
            start_time=start_time,
        )
        logger.error(f"Error in verification: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error during verification",
        )
