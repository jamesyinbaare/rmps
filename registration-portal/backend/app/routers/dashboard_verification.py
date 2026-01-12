"""Dashboard verification endpoints (JWT auth, billed)."""
import logging
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.dependencies.auth import get_current_active_user
from app.dependencies.database import DBSessionDep
from app.models import ApiRequestSource, ApiRequestType, PortalUser
from app.routers.public import check_public_results
from app.schemas.result import PublicResultCheckRequest, PublicResultResponse
from app.schemas.verification import (
    BulkVerificationRequest,
    BulkVerificationResponse,
    VerificationItemResponse,
)
from app.services.api_usage_tracker import record_api_usage
from app.services.credit_service import check_credit_balance
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/dashboard/verify", tags=["dashboard-verification"])


async def verify_single_candidate(
    request_data: PublicResultCheckRequest,
    session: DBSessionDep,
) -> PublicResultResponse:
    """Helper function to verify a single candidate (reuses public endpoint logic)."""
    return await check_public_results(request_data, session)


@router.post("")
async def verify_candidates(
    request: Request,
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> PublicResultResponse | BulkVerificationResponse:
    """
    Dashboard verification endpoint that handles both single and bulk requests.

    Request body can be:
    - Single: {"registration_number": "...", "exam_type": "...", ...}
    - Bulk: {"items": [{"registration_number": "...", ...}, ...]}
    """
    start_time = datetime.utcnow()

    # Check credit balance
    from decimal import Decimal
    cost = Decimal(str(settings.credit_cost_per_verification))
    has_credit = await check_credit_balance(session, current_user.id, cost)
    if not has_credit:
        await record_api_usage(
            session,
            user_id=current_user.id,
            api_key_id=None,
            request_source=ApiRequestSource.DASHBOARD,
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
            user_id=current_user.id,
            api_key_id=None,
            request_source=ApiRequestSource.DASHBOARD,
            request_type=ApiRequestType.BULK if is_bulk else ApiRequestType.SINGLE,
            verification_count=verification_count,
            response_status=response_status,
            duration_ms=duration_ms,
            start_time=start_time,
        )

        return response

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Record error
        duration_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        await record_api_usage(
            session,
            user_id=current_user.id,
            api_key_id=None,
            request_source=ApiRequestSource.DASHBOARD,
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
