"""Admin lunch coupon print and verification."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.dependencies.auth import SuperAdminOrTestAdminOfficerDep
from app.dependencies.database import DBSessionDep
from app.models import Examination
from app.schemas.lunch_coupon_verify import (
    LunchCouponVerifiedListResponse,
    LunchCouponVerifiedRow,
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

router = APIRouter(prefix="/admin/examinations", tags=["admin-lunch-coupon"])
scan_router = APIRouter(prefix="/admin", tags=["admin-lunch-coupon"])


async def _all_examination_ids(session) -> list[int]:
    rows = (await session.execute(select(Examination.id).order_by(Examination.created_at.desc()))).scalars().all()
    return list(rows)


@router.get("/{exam_id}/lunch-coupons/print.pdf")
async def get_admin_lunch_coupons_print_pdf(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    subject_id: int = Query(..., description="Subject id for coupon sheet"),
) -> Response:
    pdf_bytes, filename = await generate_lunch_coupons_pdf(
        session,
        examination_id=exam_id,
        subject_id=subject_id,
    )
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@scan_router.get("/lunch-coupon/verified", response_model=LunchCouponVerifiedListResponse)
async def get_admin_lunch_coupon_verified_all(
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    examination_id: int | None = Query(None),
    subject_id: int | None = Query(None),
    verification_date: date | None = Query(None),
) -> LunchCouponVerifiedListResponse:
    officer_subject_ids = {subject_id} if subject_id is not None else None
    if examination_id is not None:
        items = await list_lunch_coupon_verifications(
            session,
            examination_id=examination_id,
            officer_subject_ids=officer_subject_ids,
            verification_date=verification_date,
        )
    else:
        exam_ids = await _all_examination_ids(session)
        by_exam = (
            {eid: {subject_id} for eid in exam_ids}
            if subject_id is not None
            else None
        )
        items = await list_lunch_coupon_verifications_all(
            session,
            examination_ids=exam_ids,
            officer_subject_ids_by_exam=by_exam,
            verification_date=verification_date,
        )
    return LunchCouponVerifiedListResponse(
        items=[LunchCouponVerifiedRow(**item) for item in items],
        total=len(items),
    )


@scan_router.post("/lunch-coupon/verify-scan", response_model=LunchCouponVerifyResponse)
async def post_admin_lunch_coupon_verify_scan(
    body: LunchCouponVerifyRequest,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
) -> LunchCouponVerifyResponse:
    exam_ids = await _all_examination_ids(session)
    result = await verify_and_record_lunch_coupon_scan(
        session,
        examination_ids=exam_ids,
        officer_subject_ids_by_exam=None,
        reference_code=body.reference_code,
        verified_by_id=user.id,
    )
    if result.get("recorded"):
        await session.commit()
    return LunchCouponVerifyResponse(**result)


@router.get("/{exam_id}/lunch-coupon/verified", response_model=LunchCouponVerifiedListResponse)
async def get_admin_lunch_coupon_verified(
    exam_id: int,
    session: DBSessionDep,
    _: SuperAdminOrTestAdminOfficerDep,
    subject_id: int | None = Query(None),
    verification_date: date | None = Query(None),
) -> LunchCouponVerifiedListResponse:
    officer_subject_ids = {subject_id} if subject_id is not None else None
    items = await list_lunch_coupon_verifications(
        session,
        examination_id=exam_id,
        officer_subject_ids=officer_subject_ids,
        verification_date=verification_date,
    )
    return LunchCouponVerifiedListResponse(
        items=[LunchCouponVerifiedRow(**item) for item in items],
        total=len(items),
    )


@router.post("/{exam_id}/lunch-coupon/verify", response_model=LunchCouponVerifyResponse)
async def post_admin_lunch_coupon_verify(
    exam_id: int,
    body: LunchCouponVerifyRequest,
    session: DBSessionDep,
    user: SuperAdminOrTestAdminOfficerDep,
) -> LunchCouponVerifyResponse:
    result = await verify_and_record_lunch_coupon(
        session,
        examination_id=exam_id,
        officer_subject_ids=None,
        reference_code=body.reference_code,
        verified_by_id=user.id,
    )
    if result.get("recorded"):
        await session.commit()
    return LunchCouponVerifyResponse(**result)
