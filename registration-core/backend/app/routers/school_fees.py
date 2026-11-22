"""School fees & invoices management endpoints."""

from decimal import Decimal, InvalidOperation
from io import BytesIO

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse

from app.dependencies.auth import SchoolUserWithSchoolDep
from app.dependencies.database import DBSessionDep
from app.schemas.school_fees import (
    CreateSchoolFeeInvoiceRequest,
    FeeCandidatesResponse,
    FeesExamSummaryResponse,
    FeesSummaryResponse,
    PaystackPayResponse,
    SchoolFeeInvoiceResponse,
)
from app.services import school_fee_invoice_service as fees

router = APIRouter(prefix="/api/v1/school/fees", tags=["school-fees"])


@router.get("/summary", response_model=FeesSummaryResponse)
async def get_fees_summary(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    exam_id: int | None = Query(None),
) -> FeesSummaryResponse:
    data = await fees.get_fees_summary(
        session, school_id=current_user.school_id, exam_id=exam_id
    )
    return FeesSummaryResponse.model_validate(data)


@router.get("/summary-by-exam", response_model=FeesExamSummaryResponse)
async def get_fees_summary_by_exam(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> FeesExamSummaryResponse:
    """Return unpaid amount due and owing candidate counts per examination."""
    if current_user.school_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User must be associated with a school",
        )
    data = await fees.get_fees_summary_by_exam(
        session, school_id=current_user.school_id
    )
    return FeesExamSummaryResponse.model_validate(data)


@router.get("/exams/{exam_id}/candidates", response_model=FeeCandidatesResponse)
async def list_fee_candidates(
    exam_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    registration_type: str | None = Query(None),
    unpaid_only: bool = Query(True),
    include_free_tvet: bool = Query(False),
) -> FeeCandidatesResponse:
    try:
        data = await fees.list_fee_candidates(
            session,
            exam_id=exam_id,
            school_id=current_user.school_id,
            registration_type=registration_type,
            unpaid_only=unpaid_only,
            include_free_tvet=include_free_tvet,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return FeeCandidatesResponse.model_validate(data)


@router.get("/invoices", response_model=list[SchoolFeeInvoiceResponse])
async def list_invoices(
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    exam_id: int | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
) -> list[SchoolFeeInvoiceResponse]:
    invoices = await fees.list_invoices(
        session,
        school_id=current_user.school_id,
        exam_id=exam_id,
        status_filter=status_filter,
    )
    return [SchoolFeeInvoiceResponse.model_validate(fees.serialize_invoice(inv)) for inv in invoices]


@router.post(
    "/invoices",
    response_model=SchoolFeeInvoiceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_invoice(
    payload: CreateSchoolFeeInvoiceRequest,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> SchoolFeeInvoiceResponse:
    try:
        invoice, reused = await fees.create_school_fee_invoice(
            session,
            school_id=current_user.school_id,  # type: ignore[arg-type]
            exam_id=payload.exam_id,
            created_by_user_id=current_user.id,
            candidate_ids=payload.candidate_ids,
            all_unpaid=payload.all_unpaid,
            registration_types=payload.registration_types,
            allow_free_tvet=payload.allow_free_tvet,
        )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    invoice = await fees.get_invoice(session, invoice.id, school_id=current_user.school_id)
    return SchoolFeeInvoiceResponse.model_validate(
        fees.serialize_invoice(invoice, reused=reused)  # type: ignore[arg-type]
    )


@router.get("/invoices/{invoice_id}", response_model=SchoolFeeInvoiceResponse)
async def get_invoice(
    invoice_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> SchoolFeeInvoiceResponse:
    invoice = await fees.get_invoice(session, invoice_id, school_id=current_user.school_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return SchoolFeeInvoiceResponse.model_validate(fees.serialize_invoice(invoice))


@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
):
    invoice = await fees.get_invoice(session, invoice_id, school_id=current_user.school_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    pdf_bytes = await fees.generate_school_fee_invoice_pdf(session, invoice)
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{invoice.invoice_number}.pdf"'
        },
    )


@router.post(
    "/invoices/{invoice_id}/pay/paystack",
    response_model=PaystackPayResponse,
)
async def pay_invoice_paystack(
    invoice_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
) -> PaystackPayResponse:
    invoice = await fees.get_invoice(session, invoice_id, school_id=current_user.school_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    try:
        result = await fees.start_paystack_payment(
            session,
            invoice,
            email=current_user.email,
        )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Payment initialization failed: {exc}",
        ) from exc
    return PaystackPayResponse.model_validate(result)


@router.post(
    "/invoices/{invoice_id}/pay/bank-deposit",
    response_model=SchoolFeeInvoiceResponse,
)
async def pay_invoice_bank_deposit(
    invoice_id: int,
    session: DBSessionDep,
    current_user: SchoolUserWithSchoolDep,
    file: UploadFile = File(...),
    deposit_reference: str | None = Form(None),
    deposited_amount: str | None = Form(None),
) -> SchoolFeeInvoiceResponse:
    invoice = await fees.get_invoice(session, invoice_id, school_id=current_user.school_id)
    if not invoice:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")

    amount_dec: Decimal | None = None
    if deposited_amount:
        try:
            amount_dec = Decimal(deposited_amount)
        except (InvalidOperation, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid deposited_amount",
            ) from exc

    content = await file.read()
    try:
        await fees.submit_bank_deposit(
            session,
            invoice,
            file_content=content,
            filename=file.filename or "pay-in-slip.pdf",
            mime_type=file.content_type or "application/octet-stream",
            uploaded_by_user_id=current_user.id,
            deposit_reference=deposit_reference,
            deposited_amount=amount_dec,
        )
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    invoice = await fees.get_invoice(session, invoice_id, school_id=current_user.school_id)
    return SchoolFeeInvoiceResponse.model_validate(fees.serialize_invoice(invoice))  # type: ignore[arg-type]
