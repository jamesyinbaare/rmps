"""Admin endpoints for results publishing, blocks, and access pins."""
import io
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

import pandas as pd
from fastapi import APIRouter, Body, Form, HTTPException, Query, Request, status, UploadFile, File
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.dependencies.auth import SystemAdminDep
from app.dependencies.database import DBSessionDep
from app.models import (
    RegistrationExam,
    RegistrationCandidate,
    Subject,
    CandidateResult,
    ResultBlock,
    ResultBlockType,
    Grade,
    ResultAccessPin,
)
from app.schemas.registration import RegistrationExamResponse
from app.schemas.result import (
    CandidateResultBulkPublish,
    CandidateResultBulkPublishResponse,
    CandidateResultResponse,
    CandidateResultUpdate,
    ResultBlockCreate,
    ResultBlockResponse,
    PublishResultsFilterRequest,
    ResultAccessPinCreate,
    ResultAccessPinResponse,
    ResultAccessPinUpdate,
)
from app.services.result_service import (
    upload_results_bulk,
    publish_results_bulk,
    unpublish_results_bulk,
    publish_exam_results,
    unpublish_exam_results,
    create_result_block,
    unblock_result,
)
from app.services.result_access_pin_service import (
    generate_pin_serial_combinations,
)

router = APIRouter(prefix="/api/v1/admin", tags=["admin-results"])

logger = logging.getLogger(__name__)


# Results Management Endpoints

@router.post("/results/publish", response_model=CandidateResultBulkPublishResponse, status_code=status.HTTP_200_OK)
async def bulk_publish_results(
    publish_data: CandidateResultBulkPublish,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> CandidateResultBulkPublishResponse:
    """Bulk publish results for an exam (creates CandidateResult records)."""
    try:
        result = await publish_results_bulk(
            session=session,
            exam_id=publish_data.exam_id,
            results=[r.model_dump() for r in publish_data.results],
            published_by_user_id=current_user.id,
        )
        return CandidateResultBulkPublishResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish results: {str(e)}",
        )


@router.post("/results/upload", response_model=CandidateResultBulkPublishResponse, status_code=status.HTTP_200_OK)
async def bulk_upload_results(
    exam_id: int = Form(...),
    file: UploadFile = File(...),
    session: DBSessionDep = None,
    current_user: SystemAdminDep = None,
) -> CandidateResultBulkPublishResponse:
    """Bulk upload results from Excel file (creates CandidateResult records without publishing them)."""
    # Read file content
    file_content = await file.read()
    filename = file.filename or "unknown"

    # Verify file format
    if not filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be Excel format (.xlsx or .xls)"
        )

    # Parse Excel file; read identifier columns as string to preserve leading zeros
    try:
        header_df = pd.read_excel(io.BytesIO(file_content), engine='openpyxl', nrows=0)
        id_cols = [
            c for c in header_df.columns
            if str(c).strip().lower() in ("index_number", "registration_number", "school_code")
        ]
        dtype = {c: str for c in id_cols}
        df = pd.read_excel(io.BytesIO(file_content), engine='openpyxl', dtype=dtype)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error parsing Excel file: {str(e)}"
        )

    if df.empty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Excel file is empty or contains no data"
        )

    # Normalize column names (strip whitespace, handle case insensitivity)
    df.columns = df.columns.str.strip()
    column_mapping = {col.lower(): col for col in df.columns}

    # Required columns: subject_code and grade always; identifier is either registration_number or (school_code + index_number)
    base_required = ['subject_code', 'grade']
    missing_base = [c for c in base_required if c.lower() not in column_mapping]
    if missing_base:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns: {', '.join(missing_base)}"
        )
    has_reg_num = 'registration_number' in column_mapping
    has_school_index = 'school_code' in column_mapping and 'index_number' in column_mapping
    if not has_reg_num and not has_school_index:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must have either column registration_number or both columns school_code and index_number"
        )

    # Convert DataFrame to list of result dictionaries
    results = []
    for idx, row in df.iterrows():
        # Treat identifier columns as strings (Excel may give numbers)
        registration_number = None
        if has_reg_num:
            val = row[column_mapping['registration_number']]
            registration_number = str(val).strip() if pd.notna(val) else None
        school_code = None
        if 'school_code' in column_mapping:
            val = row[column_mapping['school_code']]
            school_code = str(val).strip() if pd.notna(val) else None
        index_number = None
        if 'index_number' in column_mapping:
            val = row[column_mapping['index_number']]
            index_number = str(val).strip() if pd.notna(val) else None

        subject_code = str(row[column_mapping['subject_code']]).strip() if pd.notna(row[column_mapping['subject_code']]) else None
        grade_str = str(row[column_mapping['grade']]).strip() if pd.notna(row[column_mapping['grade']]) else None

        if not subject_code or not grade_str:
            continue  # Skip rows with missing required data

        # Skip row if no valid identifier (let service error would also work; skipping keeps current behavior for bad rows)
        if registration_number:
            pass
        elif school_code and index_number:
            pass
        else:
            continue

        results.append({
            "registration_number": registration_number,
            "school_code": school_code,
            "index_number": index_number,
            "subject_code": subject_code,
            "grade": grade_str,
        })

    if not results:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid results found in Excel file"
        )

    # Call upload_results_bulk service
    try:
        result = await upload_results_bulk(
            session=session,
            exam_id=exam_id,
            results=results,
            uploaded_by_user_id=current_user.id,
        )
        return CandidateResultBulkPublishResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload results: {str(e)}",
        )


@router.post("/results/exams/{exam_id}/publish", response_model=RegistrationExamResponse, status_code=status.HTTP_200_OK)
async def publish_exam_results_endpoint(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> RegistrationExamResponse:
    """Mark exam as published (allows candidates to view results)."""
    try:
        exam = await publish_exam_results(session, exam_id, current_user.id)
        return RegistrationExamResponse.model_validate(exam)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish exam: {str(e)}",
        )


@router.post("/results/exams/{exam_id}/publish-results", response_model=CandidateResultBulkPublishResponse, status_code=status.HTTP_200_OK)
async def publish_results_for_exam(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    filter_data: PublishResultsFilterRequest | None = Body(None),
) -> CandidateResultBulkPublishResponse:
    """Publish uploaded results for an exam with optional filters (all, by school, by subject, or combinations).

    If no filter_data is provided (or empty body), publishes all unpublished results for the exam.
    If filter_data is provided, publishes only results matching the filters (school_ids and/or subject_ids).
    """
    try:
        school_ids = filter_data.school_ids if filter_data else None
        subject_ids = filter_data.subject_ids if filter_data else None

        result = await publish_results_bulk(
            session=session,
            exam_id=exam_id,
            published_by_user_id=current_user.id,
            school_ids=school_ids,
            subject_ids=subject_ids,
        )
        return CandidateResultBulkPublishResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to publish results: {str(e)}",
        )


@router.post("/results/exams/{exam_id}/unpublish-results", response_model=CandidateResultBulkPublishResponse, status_code=status.HTTP_200_OK)
async def unpublish_results_for_exam(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    filter_data: PublishResultsFilterRequest | None = Body(None),
) -> CandidateResultBulkPublishResponse:
    """Unpublish results for an exam with optional filters (all, by school, by subject, or combinations).

    If no filter_data is provided (or empty body), unpublishes all published results for the exam.
    If filter_data is provided, unpublishes only results matching the filters (school_ids and/or subject_ids).
    """
    try:
        school_ids = filter_data.school_ids if filter_data else None
        subject_ids = filter_data.subject_ids if filter_data else None

        result = await unpublish_results_bulk(
            session=session,
            exam_id=exam_id,
            school_ids=school_ids,
            subject_ids=subject_ids,
        )
        return CandidateResultBulkPublishResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unpublish results: {str(e)}",
        )


@router.post("/results/exams/{exam_id}/unpublish", response_model=RegistrationExamResponse, status_code=status.HTTP_200_OK)
async def unpublish_exam_results_endpoint(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> RegistrationExamResponse:
    """Unpublish exam results (prevents candidates from viewing)."""
    try:
        exam = await unpublish_exam_results(session, exam_id)
        # Ensure registration_period is loaded
        await session.refresh(exam, ["registration_period"])
        return RegistrationExamResponse.model_validate(exam)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        import traceback
        error_detail = str(e)
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unpublish exam: {error_detail}",
        )


@router.get("/results/{exam_id}", response_model=list[CandidateResultResponse])
async def list_exam_results(
    exam_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    candidate_id: int | None = Query(None, description="Filter by candidate ID"),
    subject_id: int | None = Query(None, description="Filter by subject ID"),
    school_id: int | None = Query(None, description="Filter by school ID"),
) -> list[CandidateResultResponse]:
    """List all results for an exam (with optional filters)."""
    # Verify exam exists
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    # Build query
    stmt = (
        select(CandidateResult)
        .join(RegistrationCandidate, CandidateResult.registration_candidate_id == RegistrationCandidate.id)
        .join(Subject, CandidateResult.subject_id == Subject.id)
        .where(CandidateResult.registration_exam_id == exam_id)
        .options(
            selectinload(CandidateResult.candidate),
            selectinload(CandidateResult.subject),
        )
    )

    if candidate_id:
        stmt = stmt.where(CandidateResult.registration_candidate_id == candidate_id)
    if subject_id:
        stmt = stmt.where(CandidateResult.subject_id == subject_id)
    if school_id:
        stmt = stmt.where(RegistrationCandidate.school_id == school_id)

    result = await session.execute(stmt)
    results = result.scalars().all()

    # Build response
    response_list = []
    for r in results:
        response_list.append(
            CandidateResultResponse(
                id=r.id,
                registration_candidate_id=r.registration_candidate_id,
                subject_id=r.subject_id,
                subject_code=r.subject.code,
                subject_name=r.subject.name,
                registration_exam_id=r.registration_exam_id,
                exam_type=exam.exam_type,
                exam_series=exam.exam_series,
                exam_year=exam.year,
                grade=r.grade,
                is_published=r.is_published,
                published_at=r.published_at,
                published_by_user_id=r.published_by_user_id,
                candidate_name=r.candidate.name,
                candidate_index_number=r.candidate.index_number,
                candidate_registration_number=r.candidate.registration_number,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )

    return response_list


@router.put("/results/{result_id}", response_model=CandidateResultResponse)
async def update_result(
    result_id: int,
    update_data: CandidateResultUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> CandidateResultResponse:
    """Update individual result (can unblock by changing BLOCKED to regular grade)."""
    result_stmt = select(CandidateResult).where(CandidateResult.id == result_id)
    result = await session.execute(result_stmt)
    candidate_result = result.scalar_one_or_none()

    if not candidate_result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")

    # Update grade if provided
    if update_data.grade is not None:
        # If unblocking (changing from BLOCKED to regular grade)
        if candidate_result.grade == Grade.BLOCKED and update_data.grade != Grade.BLOCKED:
            candidate_result = await unblock_result(session, result_id, update_data.grade, current_user.id)
        else:
            candidate_result.grade = update_data.grade
            candidate_result.published_by_user_id = current_user.id
            candidate_result.updated_at = datetime.utcnow()

    await session.commit()
    await session.refresh(candidate_result)

    # Get related data for response
    exam_stmt = select(RegistrationExam).where(RegistrationExam.id == candidate_result.registration_exam_id)
    exam_result = await session.execute(exam_stmt)
    exam = exam_result.scalar_one()

    subject_stmt = select(Subject).where(Subject.id == candidate_result.subject_id)
    subject_result = await session.execute(subject_stmt)
    subject = subject_result.scalar_one()

    return CandidateResultResponse(
        id=candidate_result.id,
        registration_candidate_id=candidate_result.registration_candidate_id,
        subject_id=candidate_result.subject_id,
        subject_code=subject.code,
        subject_name=subject.name,
        registration_exam_id=candidate_result.registration_exam_id,
        exam_type=exam.exam_type,
        exam_series=exam.exam_series,
        exam_year=exam.year,
        grade=candidate_result.grade,
        is_published=candidate_result.is_published,
        published_at=candidate_result.published_at,
        published_by_user_id=candidate_result.published_by_user_id,
        candidate_name=candidate_result.candidate.name,
        candidate_index_number=candidate_result.candidate.index_number,
        candidate_registration_number=candidate_result.candidate.registration_number,
        created_at=candidate_result.created_at,
        updated_at=candidate_result.updated_at,
    )


@router.post("/results/blocks", response_model=ResultBlockResponse, status_code=status.HTTP_201_CREATED)
async def create_result_block_endpoint(
    block_data: ResultBlockCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ResultBlockResponse:
    """Create result block (administrative blocking - prevents viewing)."""
    try:
        block = await create_result_block(
            session=session,
            block_type=block_data.block_type,
            exam_id=block_data.registration_exam_id,
            blocked_by_user_id=current_user.id,
            candidate_id=block_data.registration_candidate_id,
            school_id=block_data.school_id,
            subject_id=block_data.subject_id,
            reason=block_data.reason,
        )

        # Get related data for response
        exam_stmt = select(RegistrationExam).where(RegistrationExam.id == block.registration_exam_id)
        exam_result = await session.execute(exam_stmt)
        exam = exam_result.scalar_one()

        response_data = {
            "id": block.id,
            "block_type": block.block_type,
            "registration_exam_id": block.registration_exam_id,
            "exam_type": exam.exam_type,
            "exam_series": exam.exam_series,
            "exam_year": exam.year,
            "registration_candidate_id": block.registration_candidate_id,
            "candidate_name": None,
            "candidate_registration_number": None,
            "school_id": block.school_id,
            "school_name": None,
            "school_code": None,
            "subject_id": block.subject_id,
            "subject_code": None,
            "subject_name": None,
            "is_active": block.is_active,
            "blocked_by_user_id": block.blocked_by_user_id,
            "blocked_by_user_name": current_user.full_name,
            "reason": block.reason,
            "created_at": block.created_at,
            "updated_at": block.updated_at,
        }

        if block.registration_candidate_id:
            candidate_stmt = select(RegistrationCandidate).where(
                RegistrationCandidate.id == block.registration_candidate_id
            )
            candidate_result = await session.execute(candidate_stmt)
            candidate = candidate_result.scalar_one()
            response_data["candidate_name"] = candidate.name
            response_data["candidate_registration_number"] = candidate.registration_number

        if block.school_id:
            school_stmt = select(School).where(School.id == block.school_id)
            school_result = await session.execute(school_stmt)
            school = school_result.scalar_one()
            response_data["school_name"] = school.name
            response_data["school_code"] = school.code

        if block.subject_id:
            subject_stmt = select(Subject).where(Subject.id == block.subject_id)
            subject_result = await session.execute(subject_stmt)
            subject = subject_result.scalar_one()
            response_data["subject_code"] = subject.code
            response_data["subject_name"] = subject.name

        return ResultBlockResponse(**response_data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create block: {str(e)}",
        )


@router.get("/results/blocks", response_model=list[ResultBlockResponse])
async def list_result_blocks(
    request: Request,
    session: DBSessionDep,
    current_user: SystemAdminDep,
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
) -> list[ResultBlockResponse]:
    """List result blocks."""
    # Parse exam_id from raw query parameters to handle empty strings properly
    # This bypasses FastAPI's automatic validation which fails on empty strings
    exam_id_int: int | None = None
    raw_exam_id = request.query_params.get("exam_id")
    if raw_exam_id is not None and raw_exam_id.strip() != "":
        try:
            exam_id_int = int(raw_exam_id.strip())
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="exam_id must be a valid integer",
            )

    # Use left join to handle cases where exam might not exist (data integrity issues)
    stmt = (
        select(ResultBlock)
        .outerjoin(RegistrationExam, ResultBlock.registration_exam_id == RegistrationExam.id)
        .options(
            selectinload(ResultBlock.exam),
            selectinload(ResultBlock.candidate),
            selectinload(ResultBlock.school),
            selectinload(ResultBlock.subject),
            selectinload(ResultBlock.blocked_by),
        )
    )

    if exam_id_int:
        stmt = stmt.where(ResultBlock.registration_exam_id == exam_id_int)
    if is_active is not None:
        stmt = stmt.where(ResultBlock.is_active == is_active)

    result = await session.execute(stmt)
    blocks = result.scalars().all()

    response_list = []
    for block in blocks:
        # Handle case where exam might not exist (shouldn't happen, but be defensive)
        if not block.exam:
            # Skip blocks with missing exams (data integrity issue)
            continue

        response_data = {
            "id": block.id,
            "block_type": block.block_type,
            "registration_exam_id": block.registration_exam_id,
            "exam_type": block.exam.exam_type,
            "exam_series": block.exam.exam_series,
            "exam_year": block.exam.year,
            "registration_candidate_id": block.registration_candidate_id,
            "candidate_name": None,
            "candidate_registration_number": None,
            "school_id": block.school_id,
            "school_name": None,
            "school_code": None,
            "subject_id": block.subject_id,
            "subject_code": None,
            "subject_name": None,
            "is_active": block.is_active,
            "blocked_by_user_id": block.blocked_by_user_id,
            "blocked_by_user_name": block.blocked_by.full_name if block.blocked_by else "Unknown",
            "reason": block.reason,
            "created_at": block.created_at,
            "updated_at": block.updated_at,
        }

        if block.candidate:
            response_data["candidate_name"] = block.candidate.name
            response_data["candidate_registration_number"] = block.candidate.registration_number

        if block.school:
            response_data["school_name"] = block.school.name
            response_data["school_code"] = block.school.code

        if block.subject:
            response_data["subject_code"] = block.subject.code
            response_data["subject_name"] = block.subject.name

        response_list.append(ResultBlockResponse(**response_data))

    return response_list


@router.delete("/results/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_result_block(
    block_id: int,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> None:
    """Remove block (deactivate)."""
    block_stmt = select(ResultBlock).where(ResultBlock.id == block_id)
    block_result = await session.execute(block_stmt)
    block = block_result.scalar_one_or_none()

    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")

    block.is_active = False
    block.updated_at = datetime.utcnow()

    await session.commit()


# Result Access PIN/Serial Endpoints

@router.post("/result-access-pins/generate", response_model=list[ResultAccessPinResponse], status_code=status.HTTP_201_CREATED)
async def generate_result_access_pins(
    pin_data: ResultAccessPinCreate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> list[ResultAccessPinResponse]:
    """Generate PIN/Serial combinations for result access (System Admin or Director only)."""
    try:
        generated_pins = await generate_pin_serial_combinations(
            session=session,
            count=pin_data.count,
            max_uses=pin_data.max_uses,
            created_by_user_id=current_user.id,
        )
        await session.commit()

        # Load created_by relationship
        for pin in generated_pins:
            await session.refresh(pin, ["created_by"])

        return [
            ResultAccessPinResponse(
                id=pin.id,
                pin=pin.pin,
                serial_number=pin.serial_number,
                max_uses=pin.max_uses,
                current_uses=pin.current_uses,
                is_active=pin.is_active,
                created_by_user_id=pin.created_by_user_id,
                created_by_user_name=pin.created_by.full_name if pin.created_by else None,
                expires_at=pin.expires_at,
                first_used_registration_number=pin.first_used_registration_number,
                first_used_exam_id=pin.first_used_exam_id,
                first_used_at=pin.first_used_at,
                created_at=pin.created_at,
                updated_at=pin.updated_at,
            )
            for pin in generated_pins
        ]
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        await session.rollback()
        logger.error(f"Error generating PIN/Serial combinations: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate PIN/Serial combinations",
        )


@router.get("/result-access-pins", response_model=list[ResultAccessPinResponse])
async def list_result_access_pins(
    session: DBSessionDep,
    current_user: SystemAdminDep,
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
) -> list[ResultAccessPinResponse]:
    """List all PIN/Serial combinations with usage stats."""
    stmt = select(ResultAccessPin).options(
        selectinload(ResultAccessPin.created_by),
    ).order_by(ResultAccessPin.created_at.desc())

    if is_active is not None:
        stmt = stmt.where(ResultAccessPin.is_active == is_active)

    result = await session.execute(stmt)
    pins = result.scalars().all()

    return [
        ResultAccessPinResponse(
            id=pin.id,
            pin=pin.pin,
            serial_number=pin.serial_number,
            max_uses=pin.max_uses,
            current_uses=pin.current_uses,
            is_active=pin.is_active,
            created_by_user_id=pin.created_by_user_id,
            created_by_user_name=pin.created_by.full_name if pin.created_by else None,
            expires_at=pin.expires_at,
            first_used_registration_number=pin.first_used_registration_number,
            first_used_exam_id=pin.first_used_exam_id,
            first_used_at=pin.first_used_at,
            created_at=pin.created_at,
            updated_at=pin.updated_at,
        )
        for pin in pins
    ]


@router.patch("/result-access-pins/{pin_id}", response_model=ResultAccessPinResponse)
async def update_result_access_pin(
    pin_id: int,
    update_data: ResultAccessPinUpdate,
    session: DBSessionDep,
    current_user: SystemAdminDep,
) -> ResultAccessPinResponse:
    """Update PIN/Serial combination (activate/deactivate or set expiration)."""
    stmt = select(ResultAccessPin).where(ResultAccessPin.id == pin_id).options(
        selectinload(ResultAccessPin.created_by),
    )
    result = await session.execute(stmt)
    pin = result.scalar_one_or_none()

    if not pin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PIN/Serial combination not found")

    if update_data.is_active is not None:
        pin.is_active = update_data.is_active
    if update_data.expires_at is not None:
        pin.expires_at = update_data.expires_at

    pin.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(pin, ["created_by"])

    return ResultAccessPinResponse(
        id=pin.id,
        pin=pin.pin,
        serial_number=pin.serial_number,
        max_uses=pin.max_uses,
        current_uses=pin.current_uses,
        is_active=pin.is_active,
        created_by_user_id=pin.created_by_user_id,
        created_by_user_name=pin.created_by.full_name if pin.created_by else None,
        expires_at=pin.expires_at,
        first_used_registration_number=pin.first_used_registration_number,
        first_used_exam_id=pin.first_used_exam_id,
        first_used_at=pin.first_used_at,
        created_at=pin.created_at,
        updated_at=pin.updated_at,
    )
