"""Service for managing user credits."""
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import (
    UserCredit,
    CreditTransaction,
    CreditTransactionType,
    PortalUser,
    Payment,
)


async def get_user_credit(session: AsyncSession, user_id: UUID) -> Optional[UserCredit]:
    """
    Get user credit account, creating one if it doesn't exist.

    Args:
        session: Database session
        user_id: User ID

    Returns:
        UserCredit object
    """
    stmt = select(UserCredit).where(UserCredit.user_id == user_id)
    result = await session.execute(stmt)
    credit = result.scalar_one_or_none()

    if credit is None:
        # Create credit account if it doesn't exist
        credit = UserCredit(user_id=user_id, balance=Decimal("0"))
        session.add(credit)
        await session.commit()
        await session.refresh(credit)

    return credit


async def check_credit_balance(session: AsyncSession, user_id: UUID, required: Decimal) -> bool:
    """
    Check if user has sufficient credit balance.

    Args:
        session: Database session
        user_id: User ID
        required: Required credit amount

    Returns:
        True if sufficient credit, False otherwise
    """
    credit = await get_user_credit(session, user_id)
    return credit.balance >= required


async def deduct_credit(
    session: AsyncSession,
    user_id: UUID,
    amount: Decimal,
    description: Optional[str] = None,
) -> UserCredit:
    """
    Deduct credit from user account.

    Args:
        session: Database session
        user_id: User ID
        amount: Amount to deduct (should be positive, will be negated)
        description: Optional description

    Returns:
        Updated UserCredit object

    Raises:
        HTTPException: If insufficient credit
    """
    credit = await get_user_credit(session, user_id)

    if credit.balance < amount:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient credit. Required: {amount}, Available: {credit.balance}",
        )

    # Deduct credit
    credit.balance -= amount
    credit.total_used += amount

    # Create transaction record
    transaction = CreditTransaction(
        user_id=user_id,
        user_credit_id=credit.id,
        transaction_type=CreditTransactionType.USAGE,
        amount=-amount,  # Negative for deduction
        balance_after=credit.balance,
        description=description or f"Credit used for verification request",
    )
    session.add(transaction)

    await session.commit()
    await session.refresh(credit)

    return credit


async def add_credit(
    session: AsyncSession,
    user_id: UUID,
    amount: Decimal,
    transaction_type: CreditTransactionType,
    payment_id: Optional[int] = None,
    assigned_by_user_id: Optional[UUID] = None,
    description: Optional[str] = None,
) -> UserCredit:
    """
    Add credit to user account.

    Args:
        session: Database session
        user_id: User ID
        amount: Amount to add
        transaction_type: Type of transaction (PURCHASE or ADMIN_ASSIGNMENT)
        payment_id: Payment ID if purchase
        assigned_by_user_id: Admin user ID if assignment
        description: Optional description

    Returns:
        Updated UserCredit object
    """
    credit = await get_user_credit(session, user_id)

    # Add credit
    credit.balance += amount

    if transaction_type == CreditTransactionType.PURCHASE:
        credit.total_purchased += amount

    # Create transaction record
    transaction = CreditTransaction(
        user_id=user_id,
        user_credit_id=credit.id,
        transaction_type=transaction_type,
        amount=amount,  # Positive for addition
        balance_after=credit.balance,
        payment_id=payment_id,
        assigned_by_user_id=assigned_by_user_id,
        description=description,
    )
    session.add(transaction)

    await session.commit()
    await session.refresh(credit)

    return credit


async def create_credit_account(session: AsyncSession, user_id: UUID) -> UserCredit:
    """
    Initialize credit account for a new user.

    Args:
        session: Database session
        user_id: User ID

    Returns:
        Created UserCredit object
    """
    credit = UserCredit(user_id=user_id, balance=Decimal("0"))
    session.add(credit)
    await session.commit()
    await session.refresh(credit)
    return credit
