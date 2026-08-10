"""Certificate number validation helpers (no auto-allocation).

Numbers are entered manually or set later via Phase 4 OCR.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException, status

from app.models import CertificateIssuance


def normalize_certificate_number(value: str | None) -> str | None:
    """Strip and normalize; empty becomes None."""
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


async def assert_certificate_number_available(
    session: AsyncSession,
    number: str,
    *,
    exclude_issuance_id: int | None = None,
) -> None:
    """Raise 400 if another issuance already uses this certificate number."""
    stmt = select(CertificateIssuance).where(CertificateIssuance.certificate_number == number)
    if exclude_issuance_id is not None:
        stmt = stmt.where(CertificateIssuance.id != exclude_issuance_id)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Certificate number '{number}' is already assigned",
        )
