from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document


async def get_parsed_content_by_extracted_id(session: AsyncSession, extracted_id: str) -> dict[str, Any] | None:
    """Get scores_extraction_data from Document by extracted_id."""
    stmt = select(Document).where(Document.extracted_id == extracted_id)
    result = await session.execute(stmt)
    document = result.scalar_one_or_none()
    return document.scores_extraction_data if document and document.scores_extraction_data else None
