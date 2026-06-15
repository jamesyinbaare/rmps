"""Per-centre external inspector analytics for finance and super-admin reporting."""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExamCentreOfficial,
    ExamInspectorSubjectScope,
    ExamOfficialDesignation,
    ExaminationCandidate,
    ExaminationCentre,
    ExaminationDesignationRate,
    InspectorExamPosting,
    User,
)
from app.schemas.examination import (
    FinanceCentreInspectorAnalysisResponse,
    FinanceCentreInspectorAnalysisRow,
    FinanceCentreInspectorAnalysisShellResponse,
    FinanceCentreInvigilatorSummaryItem,
    FinanceCentreShellCentre,
)
from app.schemas.timetable import TimetableDownloadFilter
from app.services.centre_resolution import (
    centre_scope_school_ids_for_host_overview,
    scope_ids_for_centre_subject_filter,
)
from app.services.exam_official_compensation import (
    compensation_for_official,
    compensation_for_official_at_days,
    compensation_from_rate_row,
)
from app.services.finance_official_statistics import list_centres_for_official_statistics
from app.services.finance_school_summary import load_officials_for_centre
from app.services.sms.phone import normalize_msisdn
from app.services.subject_scope import posting_matches_timetable_filter

DEFAULT_INSPECTOR_CANDIDATES_RATIO = 300
MAX_INSPECTOR_CANDIDATES_RATIO = 10_000
TOTALS_ROW_ID = UUID(int=0)


def inspector_phone_dedup_key(phone: str | None, *, fallback: str) -> str:
    """Normalize phone for dedup; use stable fallback when phone is missing or invalid."""
    if phone and str(phone).strip():
        try:
            return normalize_msisdn(str(phone).strip())
        except ValueError:
            pass
    return fallback


def unique_phones_from_paid_inspectors(officials: Iterable[ExamCentreOfficial]) -> set[str]:
    keys: set[str] = set()
    for off in officials:
        if off.designation != ExamOfficialDesignation.EXTERNAL_INSPECTOR:
            continue
        keys.add(inspector_phone_dedup_key(off.telephone_number, fallback=f"official:{off.id}"))
    return keys


def unique_phones_from_posted_inspectors(
    posting_user_pairs: Iterable[tuple[InspectorExamPosting, User]],
    *,
    subject_filter: TimetableDownloadFilter,
) -> set[str]:
    keys: set[str] = set()
    for posting, user in posting_user_pairs:
        scope = posting.subject_scope
        if isinstance(scope, str):
            scope = ExamInspectorSubjectScope(scope)
        if not posting_matches_timetable_filter(scope, subject_filter):
            continue
        keys.add(
            inspector_phone_dedup_key(
                user.phone_number,
                fallback=f"user:{posting.inspector_user_id}",
            )
        )
    return keys


def inspectors_required_headcount(total_candidates: int, *, ratio: int = DEFAULT_INSPECTOR_CANDIDATES_RATIO) -> int:
    if total_candidates <= 0 or ratio <= 0:
        return 0
    return math.ceil(total_candidates / ratio)


def total_candidates_from_invigilator_item(item: FinanceCentreInvigilatorSummaryItem) -> int:
    """Best-effort aggregate when only per-day unique counts are available (uses peak day)."""
    if not item.days:
        return 0
    return max(d.unique_candidates for d in item.days)


async def count_registered_candidates_in_scope(
    session: AsyncSession,
    exam_id: int,
    scope_ids: set[UUID],
) -> int:
    if not scope_ids:
        return 0
    stmt = select(func.count()).select_from(ExaminationCandidate).where(
        ExaminationCandidate.examination_id == exam_id,
        ExaminationCandidate.school_id.in_(scope_ids),
    )
    return int((await session.execute(stmt)).scalar_one())


async def resolve_centre_candidate_total(
    session: AsyncSession,
    exam_id: int,
    centre: ExaminationCentre,
    subject_filter: TimetableDownloadFilter,
    invigilator_item: FinanceCentreInvigilatorSummaryItem,
) -> int:
    """Candidates in scope; prefer timetable-derived peak-day count, else registered count."""
    scope_ids = await scope_ids_for_centre_subject_filter(
        session,
        centre,
        await centre_scope_school_ids_for_host_overview(session, centre),
        subject_filter=subject_filter,
    )
    if not scope_ids:
        return 0
    if invigilator_item.days:
        peak = total_candidates_from_invigilator_item(invigilator_item)
        if peak > 0:
            return peak
    return await count_registered_candidates_in_scope(session, exam_id, scope_ids)


def external_inspector_officials(officials: Iterable[ExamCentreOfficial]) -> list[ExamCentreOfficial]:
    return [off for off in officials if off.designation == ExamOfficialDesignation.EXTERNAL_INSPECTOR]


def external_inspector_max_assigned_days(officials: Iterable[ExamCentreOfficial]) -> int:
    days = [int(off.num_days) for off in external_inspector_officials(officials)]
    return max(days) if days else 0


def external_inspector_pay_total(
    officials: Iterable[ExamCentreOfficial],
    rates_map: dict[ExamOfficialDesignation, ExaminationDesignationRate],
) -> Decimal:
    total = Decimal("0")
    for off in external_inspector_officials(officials):
        comp = compensation_for_official(off, rates_map)
        if comp.total_payable_ghs is not None:
            total += comp.total_payable_ghs
    return total


def external_inspector_pay_at_exam_days(
    officials: Iterable[ExamCentreOfficial],
    rates_map: dict[ExamOfficialDesignation, ExaminationDesignationRate],
    exam_days: int,
) -> Decimal:
    total = Decimal("0")
    for off in external_inspector_officials(officials):
        comp = compensation_for_official_at_days(off, rates_map, exam_days)
        if comp.total_payable_ghs is not None:
            total += comp.total_payable_ghs
    return total


def pay_at_posted_headcount(
    posted_count: int,
    exam_days: int,
    rates_map: dict[ExamOfficialDesignation, ExaminationDesignationRate],
) -> Decimal:
    if posted_count <= 0:
        return Decimal("0")
    rate = rates_map.get(ExamOfficialDesignation.EXTERNAL_INSPECTOR)
    comp = compensation_from_rate_row(rate, exam_days)
    if comp.total_payable_ghs is None:
        return Decimal("0")
    return comp.total_payable_ghs * posted_count


def build_inspector_analysis_row(
    centre: ExaminationCentre,
    *,
    subject_filter: TimetableDownloadFilter,
    total_candidates: int,
    exam_days: int,
    paid_phones: set[str],
    posted_phones: set[str],
    total_inspector_pay_ghs: Decimal,
    max_inspector_assigned_days: int,
    pay_at_exam_days_ghs: Decimal,
    pay_at_assigned_days_ghs: Decimal,
    pay_at_posted_count_ghs: Decimal,
    candidates_per_inspector: int = DEFAULT_INSPECTOR_CANDIDATES_RATIO,
) -> FinanceCentreInspectorAnalysisRow:
    external_count = len(paid_phones)
    posted_count = len(posted_phones)
    union_phones = paid_phones | posted_phones
    overlap = len(paid_phones & posted_phones)
    required = inspectors_required_headcount(total_candidates, ratio=candidates_per_inspector)
    variance = external_count - required
    candidates_per = (
        round(total_candidates / external_count, 1) if external_count > 0 else None
    )
    assigned_days_variance = max_inspector_assigned_days - exam_days
    days_pay_variance = pay_at_assigned_days_ghs - pay_at_exam_days_ghs
    payroll_vs_posted_variance = total_inspector_pay_ghs - pay_at_posted_count_ghs
    return FinanceCentreInspectorAnalysisRow(
        center_id=centre.id,
        center_code=str(centre.code),
        center_name=str(centre.name),
        subject_filter=subject_filter.value if hasattr(subject_filter, "value") else str(subject_filter),
        total_candidates=total_candidates,
        exam_days=exam_days,
        external_inspector_count=external_count,
        posted_inspector_count=posted_count,
        unique_inspector_count=len(union_phones),
        inspectors_in_both=overlap,
        total_inspector_pay_ghs=total_inspector_pay_ghs,
        max_inspector_assigned_days=max_inspector_assigned_days,
        assigned_days_variance=assigned_days_variance,
        pay_at_exam_days_ghs=pay_at_exam_days_ghs,
        pay_at_assigned_days_ghs=pay_at_assigned_days_ghs,
        days_pay_variance_ghs=days_pay_variance,
        pay_at_posted_count_ghs=pay_at_posted_count_ghs,
        payroll_vs_posted_variance_ghs=payroll_vs_posted_variance,
        inspectors_required=required,
        paid_inspector_variance=variance,
        candidates_per_paid_inspector=candidates_per,
    )


def sum_inspector_analysis_rows(
    rows: list[FinanceCentreInspectorAnalysisRow],
) -> FinanceCentreInspectorAnalysisRow:
    total_candidates = sum(r.total_candidates for r in rows)
    external_count = sum(r.external_inspector_count for r in rows)
    exam_days = sum(r.exam_days for r in rows)
    max_assigned_days = sum(r.max_inspector_assigned_days for r in rows)
    pay_at_exam_days = sum((r.pay_at_exam_days_ghs for r in rows), Decimal("0"))
    pay_at_assigned_days = sum((r.pay_at_assigned_days_ghs for r in rows), Decimal("0"))
    pay_at_posted = sum((r.pay_at_posted_count_ghs for r in rows), Decimal("0"))
    total_pay = sum((r.total_inspector_pay_ghs for r in rows), Decimal("0"))
    return FinanceCentreInspectorAnalysisRow(
        center_id=TOTALS_ROW_ID,
        center_code="TOTAL",
        center_name="",
        subject_filter=rows[0].subject_filter if rows else "ALL",
        total_candidates=total_candidates,
        exam_days=exam_days,
        external_inspector_count=external_count,
        posted_inspector_count=sum(r.posted_inspector_count for r in rows),
        unique_inspector_count=sum(r.unique_inspector_count for r in rows),
        inspectors_in_both=sum(r.inspectors_in_both for r in rows),
        total_inspector_pay_ghs=total_pay,
        max_inspector_assigned_days=max_assigned_days,
        assigned_days_variance=max_assigned_days - exam_days,
        pay_at_exam_days_ghs=pay_at_exam_days,
        pay_at_assigned_days_ghs=pay_at_assigned_days,
        days_pay_variance_ghs=pay_at_assigned_days - pay_at_exam_days,
        pay_at_posted_count_ghs=pay_at_posted,
        payroll_vs_posted_variance_ghs=total_pay - pay_at_posted,
        inspectors_required=sum(r.inspectors_required for r in rows),
        paid_inspector_variance=external_count - sum(r.inspectors_required for r in rows),
        candidates_per_paid_inspector=(
            round(total_candidates / external_count, 1) if external_count > 0 else None
        ),
    )


async def load_posting_user_pairs_for_centre(
    session: AsyncSession,
    examination_id: int,
    centre_id: UUID,
) -> list[tuple[InspectorExamPosting, User]]:
    stmt = (
        select(InspectorExamPosting, User)
        .join(User, User.id == InspectorExamPosting.inspector_user_id)
        .where(
            InspectorExamPosting.examination_id == examination_id,
            InspectorExamPosting.examination_centre_id == centre_id,
        )
    )
    return list((await session.execute(stmt)).all())


async def build_inspector_analysis_row_for_centre(
    session: AsyncSession,
    examination_id: int,
    centre: ExaminationCentre,
    subject_filter: TimetableDownloadFilter,
    *,
    build_invigilator_item: Callable[..., object],
    candidates_per_inspector: int = DEFAULT_INSPECTOR_CANDIDATES_RATIO,
    officials: list[ExamCentreOfficial] | None = None,
    rates_map: dict[ExamOfficialDesignation, ExaminationDesignationRate] | None = None,
) -> FinanceCentreInspectorAnalysisRow:
    if officials is None:
        pairs = await load_officials_for_centre(
            session, examination_id, centre.id, subject_filter=subject_filter
        )
        officials = [off for off, _centre in pairs]
    if rates_map is None:
        from app.services.exam_official_compensation import load_designation_rates_map

        rates_map = await load_designation_rates_map(session, examination_id)

    invigilator_item = await build_invigilator_item(session, examination_id, centre, subject_filter)
    total_candidates = await resolve_centre_candidate_total(
        session, examination_id, centre, subject_filter, invigilator_item
    )
    exam_days = len(invigilator_item.days)
    paid_phones = unique_phones_from_paid_inspectors(officials)
    posting_pairs = await load_posting_user_pairs_for_centre(session, examination_id, centre.id)
    posted_phones = unique_phones_from_posted_inspectors(
        posting_pairs, subject_filter=subject_filter
    )
    pay_total = external_inspector_pay_total(officials, rates_map)
    pay_at_exam_days = external_inspector_pay_at_exam_days(officials, rates_map, exam_days)
    max_assigned_days = external_inspector_max_assigned_days(officials)
    posted_count = len(posted_phones)
    pay_at_posted = pay_at_posted_headcount(posted_count, exam_days, rates_map)
    return build_inspector_analysis_row(
        centre,
        subject_filter=subject_filter,
        total_candidates=total_candidates,
        exam_days=exam_days,
        paid_phones=paid_phones,
        posted_phones=posted_phones,
        total_inspector_pay_ghs=pay_total,
        max_inspector_assigned_days=max_assigned_days,
        pay_at_exam_days_ghs=pay_at_exam_days,
        pay_at_assigned_days_ghs=pay_total,
        pay_at_posted_count_ghs=pay_at_posted,
        candidates_per_inspector=candidates_per_inspector,
    )


async def build_inspector_analysis_shell(
    session: AsyncSession,
    examination_id: int,
    subject_filter: TimetableDownloadFilter,
) -> FinanceCentreInspectorAnalysisShellResponse:
    centres = await list_centres_for_official_statistics(session, examination_id, subject_filter)
    return FinanceCentreInspectorAnalysisShellResponse(
        examination_id=examination_id,
        subject_filter=subject_filter.value if hasattr(subject_filter, "value") else str(subject_filter),
        centres=[
            FinanceCentreShellCentre(
                center_id=c.id,
                center_code=str(c.code),
                center_name=str(c.name),
            )
            for c in sorted(centres, key=lambda row: (str(row.code), str(row.name)))
        ],
    )


async def build_finance_inspector_analysis(
    session: AsyncSession,
    examination_id: int,
    subject_filter: TimetableDownloadFilter,
    *,
    build_invigilator_item: Callable[..., object],
    candidates_per_inspector: int = DEFAULT_INSPECTOR_CANDIDATES_RATIO,
) -> FinanceCentreInspectorAnalysisResponse:
    from app.services.exam_official_compensation import load_designation_rates_map

    centres = await list_centres_for_official_statistics(session, examination_id, subject_filter)
    rates_map = await load_designation_rates_map(session, examination_id)
    centre_rows: list[FinanceCentreInspectorAnalysisRow] = []
    for centre in sorted(centres, key=lambda row: (str(row.code), str(row.name))):
        centre_rows.append(
            await build_inspector_analysis_row_for_centre(
                session,
                examination_id,
                centre,
                subject_filter,
                build_invigilator_item=build_invigilator_item,
                candidates_per_inspector=candidates_per_inspector,
                rates_map=rates_map,
            )
        )
    return FinanceCentreInspectorAnalysisResponse(
        examination_id=examination_id,
        subject_filter=subject_filter.value if hasattr(subject_filter, "value") else str(subject_filter),
        candidates_per_inspector=candidates_per_inspector,
        centres=centre_rows,
        totals=sum_inspector_analysis_rows(centre_rows),
    )
