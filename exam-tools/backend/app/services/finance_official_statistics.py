"""Per-centre examination official statistics for super-admin reporting."""

from collections import defaultdict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CentreStructureMode,
    ExamCentreOfficial,
    ExamInspectorSubjectScope,
    Examination,
    ExaminationCentre,
)
from app.schemas.examination import (
    FinanceCentreOfficialStatisticsResponse,
    FinanceCentreOfficialStatisticsRow,
    FinanceCentreOfficialStatisticsShellResponse,
    FinanceCentreShellCentre,
)
from app.schemas.timetable import TimetableDownloadFilter
from app.services.centre_resolution import (
    list_centres_for_examination,
    membership_scope_for_timetable_filter,
)
from app.services.finance_school_summary import (
    build_role_counts,
    expected_invigilations_total,
    invigilator_days_declared,
    invigilator_headcount,
    load_officials_for_centre,
)

TOTALS_ROW_ID = UUID(int=0)


def build_statistics_row(
    centre: ExaminationCentre,
    officials: list[ExamCentreOfficial],
    *,
    expected_invigilator_days: int = 0,
) -> FinanceCentreOfficialStatisticsRow:
    role_counts = build_role_counts(officials)
    inv_count = invigilator_headcount(officials)
    inv_days = invigilator_days_declared(officials)
    total = (
        inv_count
        + role_counts.external_inspector
        + role_counts.supervisor
        + role_counts.assistant_supervisor
        + role_counts.police_officer
        + role_counts.depot_keeper
    )
    return FinanceCentreOfficialStatisticsRow(
        center_id=centre.id,
        center_code=str(centre.code),
        center_name=str(centre.name),
        invigilator_count=inv_count,
        invigilator_days=inv_days,
        expected_invigilator_days=expected_invigilator_days,
        invigilator_variance=inv_days - expected_invigilator_days,
        external_inspector=role_counts.external_inspector,
        supervisor=role_counts.supervisor,
        assistant_supervisor=role_counts.assistant_supervisor,
        police_officer=role_counts.police_officer,
        depot_keeper=role_counts.depot_keeper,
        total_officials=total,
    )


def sum_statistics_rows(rows: list[FinanceCentreOfficialStatisticsRow]) -> FinanceCentreOfficialStatisticsRow:
    inv_days = sum(r.invigilator_days for r in rows)
    expected = sum(r.expected_invigilator_days for r in rows)
    return FinanceCentreOfficialStatisticsRow(
        center_id=TOTALS_ROW_ID,
        center_code="TOTAL",
        center_name="",
        invigilator_count=sum(r.invigilator_count for r in rows),
        invigilator_days=inv_days,
        expected_invigilator_days=expected,
        invigilator_variance=inv_days - expected,
        external_inspector=sum(r.external_inspector for r in rows),
        supervisor=sum(r.supervisor for r in rows),
        assistant_supervisor=sum(r.assistant_supervisor for r in rows),
        police_officer=sum(r.police_officer for r in rows),
        depot_keeper=sum(r.depot_keeper for r in rows),
        total_officials=sum(r.total_officials for r in rows),
    )


async def list_centres_for_official_statistics(
    session: AsyncSession,
    examination_id: int,
    subject_filter: TimetableDownloadFilter,
) -> list[ExaminationCentre]:
    """Centres that hosted the requested subject scope (SPLIT exams only)."""
    exam = await session.get(Examination, examination_id)
    if exam is None:
        return []
    mode = exam.centre_structure_mode
    if isinstance(mode, str):
        mode = CentreStructureMode(mode)
    mem_scope = membership_scope_for_timetable_filter(subject_filter)
    if (
        mode == CentreStructureMode.SPLIT
        and subject_filter != TimetableDownloadFilter.ALL
        and mem_scope is not None
    ):
        return await list_centres_for_examination(
            session, examination_id, membership_scope=mem_scope
        )
    return await list_centres_for_examination(session, examination_id)


async def load_officials_grouped_by_centre(
    session: AsyncSession,
    examination_id: int,
    subject_filter: TimetableDownloadFilter,
) -> dict[UUID, list[ExamCentreOfficial]]:
    stmt = select(ExamCentreOfficial).where(ExamCentreOfficial.examination_id == examination_id)
    if subject_filter == TimetableDownloadFilter.CORE_ONLY:
        stmt = stmt.where(ExamCentreOfficial.subject_scope == ExamInspectorSubjectScope.CORE)
    elif subject_filter == TimetableDownloadFilter.ELECTIVE_ONLY:
        stmt = stmt.where(ExamCentreOfficial.subject_scope == ExamInspectorSubjectScope.ELECTIVE)
    result = await session.execute(stmt)
    grouped: dict[UUID, list[ExamCentreOfficial]] = defaultdict(list)
    for off in result.scalars().all():
        grouped[off.examination_centre_id].append(off)
    return grouped


async def build_statistics_row_for_centre(
    session: AsyncSession,
    examination_id: int,
    centre: ExaminationCentre,
    subject_filter: TimetableDownloadFilter,
    *,
    build_invigilator_item,
    officials: list[ExamCentreOfficial] | None = None,
) -> FinanceCentreOfficialStatisticsRow:
    if officials is None:
        pairs = await load_officials_for_centre(
            session, examination_id, centre.id, subject_filter=subject_filter
        )
        officials = [off for off, _centre in pairs]
    invigilator_item = await build_invigilator_item(
        session, examination_id, centre, subject_filter
    )
    expected = expected_invigilations_total(invigilator_item)
    return build_statistics_row(
        centre,
        officials,
        expected_invigilator_days=expected,
    )


async def build_official_statistics_shell(
    session: AsyncSession,
    examination_id: int,
    subject_filter: TimetableDownloadFilter,
) -> FinanceCentreOfficialStatisticsShellResponse:
    centres = await list_centres_for_official_statistics(session, examination_id, subject_filter)
    return FinanceCentreOfficialStatisticsShellResponse(
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


async def build_finance_centre_official_statistics(
    session: AsyncSession,
    examination_id: int,
    subject_filter: TimetableDownloadFilter,
    *,
    build_invigilator_item,
) -> FinanceCentreOfficialStatisticsResponse:
    """``build_invigilator_item`` is injected to avoid circular imports from examinations router."""
    centres = await list_centres_for_official_statistics(session, examination_id, subject_filter)
    officials_by_centre = await load_officials_grouped_by_centre(
        session, examination_id, subject_filter
    )
    centre_rows: list[FinanceCentreOfficialStatisticsRow] = []
    for centre in sorted(centres, key=lambda row: (str(row.code), str(row.name))):
        centre_rows.append(
            await build_statistics_row_for_centre(
                session,
                examination_id,
                centre,
                subject_filter,
                build_invigilator_item=build_invigilator_item,
                officials=officials_by_centre.get(centre.id, []),
            )
        )
    return FinanceCentreOfficialStatisticsResponse(
        examination_id=examination_id,
        subject_filter=subject_filter.value if hasattr(subject_filter, "value") else str(subject_filter),
        centres=centre_rows,
        totals=sum_statistics_rows(centre_rows),
    )
