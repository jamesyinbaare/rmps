"""Subject officer lunch coupon verification."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse

from app.dependencies.auth import SubjectOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import UserRole
from app.schemas.lunch_coupon_verify import (
    LunchCouponVerifiedListResponse,
    LunchCouponVerifyRequest,
    LunchCouponVerifyResponse,
)
from app.services.lunch_coupon_pdf import generate_lunch_coupons_pdf
from app.services.lunch_coupon_verify import (
    list_lunch_coupon_verifications,
    list_lunch_coupon_verifications_all,
    verify_and_record_lunch_coupon,
    verify_and_record_lunch_coupon_scan,
)
from app.services.subject_officer_scope import (
    assert_subject_officer_access,
    assert_subject_officer_examination_access,
    load_subject_officer_multi_exam_scope,
)

router = APIRouter(tags=["lunch-coupon-verify"])


async def _subject_officer_scan_scope(session, user) -> tuple[list[int], dict[int, set[int]]]:
    if user.role != UserRole.SUBJECT_OFFICER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    examination_ids, by_exam = await load_subject_officer_multi_exam_scope(session, user_id=user.id)
    if not examination_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No subject assignment for any examination",
        )
    return examination_ids, by_exam


@router.get(
    "/subject-officer/lunch-coupon/verified",
    response_model=LunchCouponVerifiedListResponse,
)
async def get_lunch_coupon_verified_all(
    session: DBSessionDep,
    user: SubjectOfficerDep,
) -> LunchCouponVerifiedListResponse:
    examination_ids, by_exam = await _subject_officer_scan_scope(session, user)
    items = await list_lunch_coupon_verifications_all(
        session,
        examination_ids=examination_ids,
        officer_subject_ids_by_exam=by_exam,
    )
    return LunchCouponVerifiedListResponse(items=items, total=len(items))


@router.post(
    "/subject-officer/lunch-coupon/verify-scan",
    response_model=LunchCouponVerifyResponse,
)
async def post_lunch_coupon_verify_scan(
    body: LunchCouponVerifyRequest,
    session: DBSessionDep,
    user: SubjectOfficerDep,
) -> LunchCouponVerifyResponse:
    examination_ids, by_exam = await _subject_officer_scan_scope(session, user)
    result = await verify_and_record_lunch_coupon_scan(
        session,
        examination_ids=examination_ids,
        officer_subject_ids_by_exam=by_exam,
        reference_code=body.reference_code,
        verified_by_id=user.id,
    )
    if result.get("recorded"):
        await session.commit()
    return LunchCouponVerifyResponse(**result)


@router.get(
    "/examinations/{examination_id}/subject-officer/lunch-coupon/verified",
    response_model=LunchCouponVerifiedListResponse,
)
async def get_lunch_coupon_verified(
    examination_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
) -> LunchCouponVerifiedListResponse:
    officer_subject_ids = await assert_subject_officer_examination_access(session, user, examination_id)
    items = await list_lunch_coupon_verifications(
        session,
        examination_id=examination_id,
        officer_subject_ids=officer_subject_ids,
    )
    return LunchCouponVerifiedListResponse(items=items, total=len(items))


@router.post(
    "/examinations/{examination_id}/subject-officer/lunch-coupon/verify",
    response_model=LunchCouponVerifyResponse,
)
async def post_lunch_coupon_verify(
    examination_id: int,
    body: LunchCouponVerifyRequest,
    session: DBSessionDep,
    user: SubjectOfficerDep,
) -> LunchCouponVerifyResponse:
    officer_subject_ids = await assert_subject_officer_examination_access(session, user, examination_id)
    result = await verify_and_record_lunch_coupon(
        session,
        examination_id=examination_id,
        officer_subject_ids=officer_subject_ids,
        reference_code=body.reference_code,
        verified_by_id=user.id,
    )
    if result.get("recorded"):
        await session.commit()
    return LunchCouponVerifyResponse(**result)


@router.get(
    "/examinations/{examination_id}/subject-officer/lunch-coupons/print.pdf",
)
async def get_subject_officer_lunch_coupons_print_pdf(
    examination_id: int,
    session: DBSessionDep,
    user: SubjectOfficerDep,
    subject_id: int = Query(..., description="Subject id for coupon sheet"),
) -> Response:
    await assert_subject_officer_access(session, user, examination_id, subject_id)
    pdf_bytes, filename = await generate_lunch_coupons_pdf(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
    )
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
