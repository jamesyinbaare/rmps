"""Script to add test unmatched records for testing.

To run this script:
    cd backend
    python add_test_unmatched_records.py

Or if using uv:
    uv run python add_test_unmatched_records.py
"""

import asyncio
from sqlalchemy import select

from app.dependencies.database import get_sessionmanager, initialize_db
from app.models import Document, UnmatchedExtractionRecord, DataExtractionMethod, UnmatchedRecordStatus


async def add_test_unmatched_records() -> None:
    """Add test unmatched records for document with extracted_id 8170957033101."""
    sessionmanager = get_sessionmanager()
    async with initialize_db(sessionmanager):
        async with sessionmanager.session() as session:
            # Find document by extracted_id
            stmt = select(Document).where(Document.extracted_id == "8170957033101")
            result = await session.execute(stmt)
            document = result.scalar_one_or_none()

            if not document:
                print(f"ERROR: Document with extracted_id '8170957033101' not found!")
                return

            print(f"Found document: id={document.id}, extracted_id={document.extracted_id}")

            # Test data
            test_records = [
                {
                    "index_number": "095281250006",
                    "raw_score": "75",
                    "sn": 11,
                    "candidate_name": "COLLINS NAAH DERY",
                    "attend": "[x]",
                    "verify": 75
                },
                {
                    "index_number": "095221250089",
                    "raw_score": "40",
                    "sn": 9,
                    "candidate_name": "FELICIA BUONYERA MAALE",
                    "attend": "[x]",
                    "verify": 40
                },
                {
                    "index_number": "095251250084",
                    "raw_score": "A",
                    "sn": 10,
                    "candidate_name": "EZEKIEL TUNIVOE WASAL",
                    "attend": "[x]",
                    "verify": "A"
                }
            ]

            created_count = 0
            for record_data in test_records:
                # Check if record already exists
                existing_stmt = select(UnmatchedExtractionRecord).where(
                    UnmatchedExtractionRecord.document_id == document.id,
                    UnmatchedExtractionRecord.index_number == record_data["index_number"],
                    UnmatchedExtractionRecord.sn == record_data["sn"]
                )
                existing_result = await session.execute(existing_stmt)
                existing = existing_result.scalar_one_or_none()

                if existing:
                    print(f"Record already exists for index_number={record_data['index_number']}, sn={record_data['sn']}")
                    continue

                # Create unmatched record
                unmatched_record = UnmatchedExtractionRecord(
                    document_id=document.id,
                    index_number=record_data["index_number"],
                    candidate_name=record_data["candidate_name"],
                    score=record_data["raw_score"],
                    sn=record_data["sn"],
                    raw_data=record_data,
                    status=UnmatchedRecordStatus.PENDING,
                    extraction_method=DataExtractionMethod.AUTOMATED_EXTRACTION,
                )
                session.add(unmatched_record)
                created_count += 1
                print(f"Created record: index_number={record_data['index_number']}, sn={record_data['sn']}, candidate_name={record_data['candidate_name']}")

            await session.commit()
            print(f"\nSuccessfully created {created_count} unmatched record(s)")


if __name__ == "__main__":
    asyncio.run(add_test_unmatched_records())
