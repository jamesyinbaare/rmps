import asyncio
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Batch, BatchDocument, Document
from app.services.id_extraction import id_extraction_service
from app.services.storage import storage_service


class BatchProcessor:
    """Service for processing batches of documents."""

    async def process_batch(self, batch_id: int, session: AsyncSession) -> dict[str, Any]:
        """
        Process all documents in a batch asynchronously.
        Returns processing summary.
        """
        # Get batch
        stmt = select(Batch).where(Batch.id == batch_id)
        result = await session.execute(stmt)
        batch = result.scalar_one_or_none()
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")

        # Update batch status
        batch.status = "processing"
        await session.commit()

        # Get all batch documents
        batch_doc_stmt = select(BatchDocument).where(BatchDocument.batch_id == batch_id)
        result = await session.execute(batch_doc_stmt)
        batch_documents = result.scalars().all()

        processed_count = 0
        failed_count = 0

        # Process documents concurrently (with limit)
        semaphore = asyncio.Semaphore(5)  # Limit concurrent processing

        async def process_document(batch_doc: BatchDocument) -> None:
            nonlocal processed_count, failed_count
            async with semaphore:
                try:
                    batch_doc.processing_status = "processing"
                    await session.commit()

                    # Get document
                    doc_stmt = select(Document).where(Document.id == batch_doc.document_id)
                    doc_result = await session.execute(doc_stmt)
                    document = doc_result.scalar_one()

                    # Retrieve file
                    file_content = await storage_service.retrieve(document.file_path)

                    # Extract ID
                    extraction_result = await id_extraction_service.extract_id(file_content, session, document.id)

                    # Update document
                    if extraction_result["is_valid"]:
                        document.extracted_id = extraction_result["extracted_id"]
                        document.id_extraction_method = extraction_result["method"]
                        document.id_extraction_confidence = extraction_result["confidence"]
                        document.school_id = extraction_result.get("school_id")
                        document.subject_id = extraction_result.get("subject_id")
                        document.test_type = extraction_result.get("test_type")
                        document.subject_series = extraction_result.get("subject_series")
                        document.sheet_number = extraction_result.get("sheet_number")
                        document.id_extraction_status = "success"
                        document.id_extracted_at = datetime.utcnow()
                        batch_doc.processing_status = "completed"
                        processed_count += 1
                    else:
                        document.id_extraction_status = "error"
                        batch_doc.processing_status = "failed"
                        batch_doc.error_message = extraction_result.get("error_message", "Extraction failed")
                        failed_count += 1

                    await session.commit()
                except Exception as e:
                    batch_doc.processing_status = "failed"
                    batch_doc.error_message = str(e)
                    failed_count += 1
                    await session.commit()

        # Process all documents
        tasks = [process_document(bd) for bd in batch_documents]
        await asyncio.gather(*tasks)

        # Update batch status
        batch.processed_files = processed_count
        batch.failed_files = failed_count
        if failed_count == 0:
            batch.status = "completed"
        elif processed_count == 0:
            batch.status = "failed"
        else:
            batch.status = "completed"  # Partial success still counts as completed

        batch.completed_at = datetime.utcnow()
        await session.commit()

        return {
            "batch_id": batch_id,
            "processed": processed_count,
            "failed": failed_count,
            "total": len(batch_documents),
        }

    async def validate_batch(self, batch_id: int, session: AsyncSession) -> dict[str, Any]:
        """
        Validate batch documents for sequence gaps and duplicates.
        Returns validation report.
        """
        # Get batch
        stmt = select(Batch).where(Batch.id == batch_id)
        result = await session.execute(stmt)
        batch = result.scalar_one_or_none()
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")

        # Get all documents in batch
        batch_doc_stmt = (
            select(Document)
            .join(BatchDocument, Document.id == BatchDocument.document_id)
            .where(BatchDocument.batch_id == batch_id)
        )
        result = await session.execute(batch_doc_stmt)
        documents = result.scalars().all()

        validation_errors: list[str] = []
        sequence_gaps: list[dict[str, Any]] = []
        duplicates: list[dict[str, Any]] = []

        # Group documents by school+subject+test_type
        grouped: dict[tuple[int, int, str], list[Document]] = {}
        for doc in documents:
            if doc.school_id and doc.subject_id and doc.test_type:
                key = (doc.school_id, doc.subject_id, doc.test_type)
                if key not in grouped:
                    grouped[key] = []
                grouped[key].append(doc)

        # Check for duplicates and sequence gaps
        for (school_id, subject_id, test_type), docs in grouped.items():
            sheet_numbers = [int(d.sheet_number) for d in docs if d.sheet_number and d.sheet_number.isdigit()]

            # Find duplicates
            seen: dict[int, list[int]] = {}
            for i, sheet_num in enumerate(sheet_numbers):
                if sheet_num in seen:
                    seen[sheet_num].append(i)
                else:
                    seen[sheet_num] = [i]

            for sheet_num, indices in seen.items():
                if len(indices) > 1:
                    duplicates.append(
                        {
                            "school_id": school_id,
                            "subject_id": subject_id,
                            "test_type": test_type,
                            "sheet_number": str(sheet_num).zfill(2),
                            "document_ids": [docs[i].id for i in indices],
                        }
                    )

            # Find sequence gaps
            if sheet_numbers:
                min_sheet = min(sheet_numbers)
                max_sheet = max(sheet_numbers)
                existing_set = set(sheet_numbers)
                gaps = [i for i in range(min_sheet, max_sheet + 1) if i not in existing_set]
                if gaps:
                    sequence_gaps.append(
                        {
                            "school_id": school_id,
                            "subject_id": subject_id,
                            "test_type": test_type,
                            "missing_sheets": [str(g).zfill(2) for g in gaps],
                        }
                    )

        return {
            "batch_id": batch_id,
            "validation_errors": validation_errors,
            "sequence_gaps": sequence_gaps,
            "duplicates": duplicates,
        }

    async def rename_files(self, batch_id: int, session: AsyncSession) -> dict[str, Any]:
        """
        Rename files in batch using extracted IDs.
        Returns renaming summary.
        """
        # Get batch
        stmt = select(Batch).where(Batch.id == batch_id)
        result = await session.execute(stmt)
        batch = result.scalar_one_or_none()
        if not batch:
            raise ValueError(f"Batch {batch_id} not found")

        # Get all documents in batch with extracted IDs
        batch_doc_stmt = (
            select(Document)
            .join(BatchDocument, Document.id == BatchDocument.document_id)
            .where(BatchDocument.batch_id == batch_id, Document.extracted_id.isnot(None))
        )
        result = await session.execute(batch_doc_stmt)
        documents = result.scalars().all()

        renamed_count = 0
        failed_count = 0

        for document in documents:
            try:
                if document.extracted_id:
                    # Generate new filename from extracted ID
                    ext = "." + document.file_name.split(".")[-1] if "." in document.file_name else ""
                    new_filename = f"{document.extracted_id}{ext}"

                    # Retrieve old file
                    old_content = await storage_service.retrieve(document.file_path)

                    # Save with new path
                    new_path, checksum = await storage_service.save(old_content, new_filename)

                    # Delete old file
                    await storage_service.delete(document.file_path)

                    # Update document
                    document.file_path = new_path
                    document.file_name = new_filename
                    document.checksum = checksum

                    await session.commit()
                    renamed_count += 1
            except Exception:
                failed_count += 1

        return {
            "batch_id": batch_id,
            "renamed": renamed_count,
            "failed": failed_count,
            "total": len(documents),
        }


# Global batch processor instance
batch_processor = BatchProcessor()
