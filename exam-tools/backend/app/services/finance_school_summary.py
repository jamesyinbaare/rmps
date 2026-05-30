"""Finance school (centre) summary: invigilation metrics and official roster."""

import re
from datetime import datetime
from typing import cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ExamCentreOfficial,
    ExamInspectorSubjectScope,
    Examination,
    ExaminationCentre,
    ExamOfficialDesignation,
)
from app.schemas.admin_exam_official import AdminExamCentreOfficialRow
from app.schemas.examination import (
    FinanceCentreInvigilatorSummaryItem,
    FinanceCentreSchoolSummaryResponse,
    FinanceCentreSchoolSummaryRoleCounts,
)
from app.schemas.timetable import TimetableDownloadFilter
from app.models import ExaminationDesignationRate
from app.services.exam_official_compensation import compensation_for_official
from app.services.exam_official_export import designation_str, examination_label


def subject_filter_filename_suffix(subject_filter: TimetableDownloadFilter) -> str:
    if subject_filter == TimetableDownloadFilter.CORE_ONLY:
        return "CORE"
    if subject_filter == TimetableDownloadFilter.ELECTIVE_ONLY:
        return "ELECTIVE"
    return "ALL"


def school_summary_export_filename(
    center_code: str,
    center_name: str,
    subject_filter: TimetableDownloadFilter,
) -> str:
    def part(s: str) -> str:
        t = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", s.strip())
        return (t or "unknown")[:80]

    suffix = subject_filter_filename_suffix(subject_filter)
    return f"{part(center_code)} {part(center_name)} {suffix}.xlsx"


def expected_invigilations_total(item: FinanceCentreInvigilatorSummaryItem) -> int:
    return sum(d.invigilators_required for d in item.days)


def build_role_counts(officials: list[ExamCentreOfficial]) -> FinanceCentreSchoolSummaryRoleCounts:
    counts = FinanceCentreSchoolSummaryRoleCounts()
    mapping = {
        ExamOfficialDesignation.EXTERNAL_INSPECTOR: "external_inspector",
        ExamOfficialDesignation.POLICE_OFFICER: "police_officer",
        ExamOfficialDesignation.SUPERVISOR: "supervisor",
        ExamOfficialDesignation.DEPOT_KEEPER: "depot_keeper",
        ExamOfficialDesignation.ASSISTANT_SUPERVISOR: "assistant_supervisor",
    }
    for off in officials:
        field = mapping.get(off.designation)
        if field is not None:
            current = getattr(counts, field)
            setattr(counts, field, current + 1)
    return counts


def invigilator_headcount(officials: list[ExamCentreOfficial]) -> int:
    return sum(1 for off in officials if off.designation == ExamOfficialDesignation.INVIGILATOR)


def invigilator_days_declared(officials: list[ExamCentreOfficial]) -> int:
    return sum(int(off.num_days) for off in officials if off.designation == ExamOfficialDesignation.INVIGILATOR)


def officials_to_admin_rows(
    pairs: list[tuple[ExamCentreOfficial, ExaminationCentre]],
    examination_id: int,
    exam_label: str,
    *,
    rates_by_designation: dict[ExamOfficialDesignation, ExaminationDesignationRate] | None = None,
) -> list[AdminExamCentreOfficialRow]:
    rates = rates_by_designation or {}
    items: list[AdminExamCentreOfficialRow] = []
    for off, centre in pairs:
        bb = off.bank_branch
        comp = compensation_for_official(off, rates)
        items.append(
            AdminExamCentreOfficialRow(
                id=off.id,
                examination_id=examination_id,
                examination_label=exam_label,
                center_id=centre.id,
                center_code=cast(str, centre.code),
                center_name=cast(str, centre.name),
                full_name=cast(str, off.full_name),
                designation=designation_str(off.designation),
                bank_branch_id=off.bank_branch_id,
                bank_code=cast(str, bb.bank_code),
                bank_name=cast(str, bb.bank_name),
                branch_name=cast(str, bb.branch_name),
                account_number=cast(str, off.account_number),
                num_days=int(off.num_days),
                telephone_number=cast(str, off.telephone_number),
                subject_scope=(
                    off.subject_scope.value
                    if isinstance(off.subject_scope, ExamInspectorSubjectScope)
                    else str(off.subject_scope)
                ),
                created_at=cast(datetime, off.created_at),
                updated_at=cast(datetime, off.updated_at),
                daily_rate_ghs=comp.daily_rate_ghs,
                commuting_allowance_ghs=comp.commuting_allowance_ghs,
                airtime_ghs=comp.airtime_ghs,
                total_payable_ghs=comp.total_payable_ghs,
            )
        )
    return items


async def load_officials_for_centre(
    session: AsyncSession,
    examination_id: int,
    centre_id: UUID,
    *,
    subject_filter: TimetableDownloadFilter = TimetableDownloadFilter.ALL,
) -> list[tuple[ExamCentreOfficial, ExaminationCentre]]:
    stmt = (
        select(ExamCentreOfficial, ExaminationCentre)
        .join(
            ExaminationCentre,
            ExaminationCentre.id == ExamCentreOfficial.examination_centre_id,
        )
        .where(
            ExamCentreOfficial.examination_id == examination_id,
            ExamCentreOfficial.examination_centre_id == centre_id,
        )
        .options(selectinload(ExamCentreOfficial.bank_branch))
        .order_by(ExamCentreOfficial.full_name.asc())
    )
    if subject_filter == TimetableDownloadFilter.CORE_ONLY:
        stmt = stmt.where(ExamCentreOfficial.subject_scope == ExamInspectorSubjectScope.CORE)
    elif subject_filter == TimetableDownloadFilter.ELECTIVE_ONLY:
        stmt = stmt.where(ExamCentreOfficial.subject_scope == ExamInspectorSubjectScope.ELECTIVE)
    result = await session.execute(stmt)
    return list(result.all())


def build_school_summary_response(
    *,
    centre: ExaminationCentre,
    subject_filter: TimetableDownloadFilter,
    invigilator_item: FinanceCentreInvigilatorSummaryItem,
    officials: list[ExamCentreOfficial],
    official_rows: list[AdminExamCentreOfficialRow],
) -> FinanceCentreSchoolSummaryResponse:
    expected = expected_invigilations_total(invigilator_item)
    declared = invigilator_days_declared(officials)
    return FinanceCentreSchoolSummaryResponse(
        center_id=centre.id,
        center_code=str(centre.code),
        center_name=str(centre.name),
        subject_filter=subject_filter,
        expected_invigilations_total=expected,
        invigilator_days_declared=declared,
        variance=declared - expected,
        role_counts=build_role_counts(officials),
        officials=official_rows,
    )


async def build_finance_centre_school_summary(
    session: AsyncSession,
    exam: Examination,
    centre: ExaminationCentre,
    subject_filter: TimetableDownloadFilter,
    *,
    build_invigilator_item,
) -> FinanceCentreSchoolSummaryResponse:
    """``build_invigilator_item`` is injected to avoid circular imports from examinations router."""
    exam_label = examination_label(exam)
    pairs = await load_officials_for_centre(
        session, exam.id, centre.id, subject_filter=subject_filter
    )
    from app.services.exam_official_compensation import load_designation_rates_map

    officials = [off for off, _centre in pairs]
    rates_map = await load_designation_rates_map(session, exam.id)
    official_rows = officials_to_admin_rows(pairs, exam.id, exam_label, rates_by_designation=rates_map)
    invigilator_item = await build_invigilator_item(session, exam.id, centre, subject_filter)
    return build_school_summary_response(
        centre=centre,
        subject_filter=subject_filter,
        invigilator_item=invigilator_item,
        officials=officials,
        official_rows=official_rows,
    )
