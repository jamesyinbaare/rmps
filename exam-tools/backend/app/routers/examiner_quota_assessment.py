"""Subject officer quota self-assessment (non-persisted upload)."""

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.dependencies.auth import SuperAdminOrTestAdminOfficerOrSubjectOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination
from app.schemas.subject_examiner_region_quota import QuotaAssessmentResponse
from app.services.examiner_regional_quota import ProposedExaminerRow, assess_proposed_examiners
from app.services.examiner_roster import dataframe_row_to_examiner_fields, read_examiners_spreadsheet
from app.services.examiner_subject_lock import assert_examiner_subject_allowed
from app.services.script_allocation import parse_region
from app.services.sms.phone import normalize_msisdn
from app.services.subject_officer_scope import assert_subject_officer_access, is_unrestricted_examiner_manager

router = APIRouter(tags=["examiner-quota-assessment"])

_MAX_BYTES = 5 * 1024 * 1024
_MAX_ROWS = 5000


@router.post(
    "/examinations/{examination_id}/subjects/{subject_id}/examiner-quota-assessment",
    response_model=QuotaAssessmentResponse,
)
async def assess_examiner_quota_upload(
    examination_id: int,
    subject_id: int,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerOrSubjectOfficerDep,
    file: UploadFile = File(...),
) -> QuotaAssessmentResponse:
    exam = await session.get(Examination, examination_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Examination not found")

    if not is_unrestricted_examiner_manager(user):
        await assert_subject_officer_access(session, user, examination_id, subject_id)

    raw = await file.read()
    if len(raw) > _MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")

    try:
        df = read_examiners_spreadsheet(raw, file.filename or "upload.csv")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if len(df) > _MAX_ROWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {_MAX_ROWS} data rows are allowed",
        )

    proposed: list[ProposedExaminerRow] = []
    row_errors: list[dict] = []

    for row_number, (_, srow) in enumerate(df.iterrows(), start=2):
        try:
            fields = await dataframe_row_to_examiner_fields(session, srow)
            region = parse_region(fields["allowed_region"])
            sid = fields["subject_ids"][0]
            msisdn = normalize_msisdn(fields["phone_number"])
            await assert_examiner_subject_allowed(
                session,
                examination_id=examination_id,
                msisdn=msisdn,
                subject_id=sid,
            )
            if sid != subject_id:
                raise ValueError("Spreadsheet subject does not match the selected assessment subject.")
            proposed.append(
                ProposedExaminerRow(
                    subject_id=sid,
                    examiner_type=fields["examiner_type"],
                    region=region,
                    gender=fields.get("gender"),
                )
            )
        except ValueError as exc:
            row_errors.append({"row_number": row_number, "message": str(exc)})

    result = await assess_proposed_examiners(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        proposed=proposed,
    )
    result["row_errors"] = row_errors + result.get("row_errors", [])
    if row_errors:
        result["valid"] = False
    return QuotaAssessmentResponse(**result)
