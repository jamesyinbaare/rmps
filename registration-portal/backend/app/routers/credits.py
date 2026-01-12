"""Credit management endpoints."""
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import get_current_active_user, system_admin_only
from app.dependencies.database import DBSessionDep
from app.models import (
    CreditTransaction,
    CreditTransactionType,
    Invoice,
    Payment,
    PaymentStatus,
    PortalUser,
    UserCredit,
)
from app.schemas.credit import (
    CreditAssignmentRequest,
    CreditAssignmentResponse,
    CreditBalanceResponse,
    CreditPurchaseRequest,
    CreditPurchaseResponse,
    CreditTransactionListResponse,
    CreditTransactionResponse,
)
from app.services.credit_service import (
    add_credit,
    get_user_credit,
)
from app.services.payment_service import initialize_payment

router = APIRouter(prefix="/api/v1/credits", tags=["credits"])


@router.get("/balance", response_model=CreditBalanceResponse)
async def get_credit_balance(
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> CreditBalanceResponse:
    """Get current credit balance."""
    from app.services.credit_service import get_user_credit

    credit = await get_user_credit(session, current_user.id)
    return CreditBalanceResponse(
        balance=credit.balance,
        total_purchased=credit.total_purchased,
        total_used=credit.total_used,
    )


@router.get("/transactions", response_model=CreditTransactionListResponse)
async def get_credit_transactions(
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> CreditTransactionListResponse:
    """Get credit transaction history."""
    from sqlalchemy import func

    credit = await get_user_credit(session, current_user.id)

    # Get total count
    count_stmt = select(func.count(CreditTransaction.id)).where(
        CreditTransaction.user_credit_id == credit.id
    )
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0

    # Get paginated transactions
    offset = (page - 1) * page_size
    stmt = (
        select(CreditTransaction)
        .where(CreditTransaction.user_credit_id == credit.id)
        .order_by(CreditTransaction.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await session.execute(stmt)
    transactions = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size

    return CreditTransactionListResponse(
        transactions=[CreditTransactionResponse.model_validate(t) for t in transactions],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/purchase", response_model=CreditPurchaseResponse)
async def purchase_credits(
    purchase_data: CreditPurchaseRequest,
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(get_current_active_user)],
) -> CreditPurchaseResponse:
    """Purchase credits."""
    from app.config import settings
    from app.services.invoice_service import generate_invoice_number

    # Validate minimum purchase
    if purchase_data.amount < settings.credit_minimum_purchase:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Minimum purchase is {settings.credit_minimum_purchase} credits",
        )

    # Calculate total amount
    total_amount = Decimal(str(purchase_data.amount * settings.credit_purchase_price_per_unit))

    # Create invoice for credit purchase (no foreign keys - standalone invoice)
    invoice_number = await generate_invoice_number(session)
    invoice = Invoice(
        invoice_number=invoice_number,
        amount=total_amount,
        currency="GHS",
        status="pending",
        registration_candidate_id=None,
        certificate_request_id=None,
        certificate_confirmation_request_id=None,
    )
    session.add(invoice)
    await session.flush()

    # Initialize payment
    try:
        payment_result = await initialize_payment(
            session,
            invoice,
            total_amount,
            email=current_user.email,
            metadata={
                "type": "credit_purchase",
                "user_id": str(current_user.id),
                "credits": purchase_data.amount,
            },
        )

        # Update invoice with payment
        payment_stmt = select(Payment).where(Payment.id == payment_result["payment_id"])
        payment_result_db = await session.execute(payment_stmt)
        payment = payment_result_db.scalar_one_or_none()

        if payment:
            invoice.status = "pending"  # Will be updated when payment is confirmed

        await session.commit()

        return CreditPurchaseResponse(
            payment_url=payment_result["authorization_url"],
            payment_reference=payment_result["paystack_reference"],
            amount=total_amount,
            credits=purchase_data.amount,
            message="Payment initialized. Complete payment to receive credits.",
        )
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to initialize payment: {str(e)}",
        )


# Admin endpoints
@router.post("/admin/assign", response_model=CreditAssignmentResponse)
async def assign_credits(
    assignment_data: CreditAssignmentRequest,
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(system_admin_only)],
) -> CreditAssignmentResponse:
    """Assign credits to a user (admin only)."""
    # Get target user
    if not assignment_data.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_id is required for this endpoint",
        )
    stmt = select(PortalUser).where(PortalUser.id == assignment_data.user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Add credits
    amount = Decimal(str(assignment_data.amount))
    credit = await add_credit(
        session,
        user.id,
        amount,
        CreditTransactionType.ADMIN_ASSIGNMENT,
        assigned_by_user_id=current_user.id,
        description=assignment_data.description or f"Credits assigned by {current_user.full_name}",
    )

    return CreditAssignmentResponse(
        user_id=user.id,
        user_email=user.email,
        user_name=user.full_name,
        amount=assignment_data.amount,
        new_balance=credit.balance,
        message=f"Successfully assigned {assignment_data.amount} credits to {user.email}",
    )


@router.get("/admin/users/{user_id}", response_model=CreditBalanceResponse)
async def get_user_credit_details(
    user_id: UUID,
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(system_admin_only)],
) -> CreditBalanceResponse:
    """Get credit details for a user (admin only)."""
    credit = await get_user_credit(session, user_id)

    return CreditBalanceResponse(
        balance=credit.balance,
        total_purchased=credit.total_purchased,
        total_used=credit.total_used,
    )


@router.get("/admin/users", response_model=list[dict])
async def list_users_with_credits(
    session: DBSessionDep,
    current_user: Annotated[PortalUser, Depends(system_admin_only)],
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> list[dict]:
    """List all users with credit balances (admin only)."""
    from sqlalchemy import func

    offset = (page - 1) * page_size

    # Get users with credits
    stmt = (
        select(PortalUser, UserCredit)
        .join(UserCredit, PortalUser.id == UserCredit.user_id, isouter=True)
        .order_by(PortalUser.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await session.execute(stmt)
    rows = result.all()

    users_list = []
    for user, credit in rows:
        users_list.append({
            "user_id": str(user.id),
            "email": user.email,
            "full_name": user.full_name,
            "balance": float(credit.balance) if credit else 0.0,
            "total_purchased": float(credit.total_purchased) if credit else 0.0,
            "total_used": float(credit.total_used) if credit else 0.0,
        })

    return users_list
