"""Regional examiner roster quotas per subject and region group."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Examiner,
    ExaminerSubject,
    ExaminerType,
    ExaminationExaminerQuotaRegionGroup,
    ExaminationExaminerQuotaRegionGroupRegion,
    Region,
    SubjectExaminerRegionQuota,
)
from app.services.examiner_reference_code import ROLE_SHORT_CODES


def _examiner_type_label(examiner_type: ExaminerType) -> str:
    return {
        ExaminerType.CHIEF: "Chief examiner",
        ExaminerType.ASSISTANT_CHIEF: "Assistant chief examiner",
        ExaminerType.ASSISTANT: "Assistant examiner",
        ExaminerType.TEAM_LEADER: "Team leader",
    }[examiner_type]

RoleCounts = dict[ExaminerType, int]


@dataclass
class GroupDistribution:
    total: int = 0
    by_role: RoleCounts = field(default_factory=dict)


@dataclass
class GenderDistribution:
    male: int = 0
    female: int = 0


@dataclass
class SubjectQuotaSettings:
    total_quota: int | None = None
    male_quota: int | None = None
    female_quota: int | None = None


@dataclass
class QuotaExceedResult:
    exceeded: bool
    group_id: UUID | None = None
    group_name: str | None = None
    examiner_type: ExaminerType | None = None
    message: str | None = None


@dataclass
class ProposedExaminerRow:
    subject_id: int
    examiner_type: ExaminerType
    region: Region
    gender: str | None = None


def _empty_distribution() -> dict[UUID, GroupDistribution]:
    return defaultdict(GroupDistribution)


async def _load_region_to_group(
    session: AsyncSession,
    examination_id: int,
) -> dict[Region, tuple[UUID, str]]:
    stmt = (
        select(
            ExaminationExaminerQuotaRegionGroupRegion.region,
            ExaminationExaminerQuotaRegionGroupRegion.group_id,
            ExaminationExaminerQuotaRegionGroup.name,
        )
        .join(
            ExaminationExaminerQuotaRegionGroup,
            ExaminationExaminerQuotaRegionGroup.id == ExaminationExaminerQuotaRegionGroupRegion.group_id,
        )
        .where(ExaminationExaminerQuotaRegionGroupRegion.examination_id == examination_id)
    )
    rows = (await session.execute(stmt)).all()
    mapping: dict[Region, tuple[UUID, str]] = {}
    for region, group_id, group_name in rows:
        reg = region if isinstance(region, Region) else Region(str(region))
        mapping[reg] = (group_id, group_name)
    return mapping


async def resolve_group_for_region(
    session: AsyncSession,
    *,
    examination_id: int,
    region: Region,
) -> tuple[UUID, str]:
    mapping = await _load_region_to_group(session, examination_id)
    if region not in mapping:
        raise ValueError("This region is not assigned to a quota region group for this examination.")
    return mapping[region]


async def list_quotas_for_subject(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> list[SubjectExaminerRegionQuota]:
    stmt = (
        select(SubjectExaminerRegionQuota)
        .where(
            SubjectExaminerRegionQuota.examination_id == examination_id,
            SubjectExaminerRegionQuota.subject_id == subject_id,
        )
        .options(
            selectinload(SubjectExaminerRegionQuota.group).selectinload(
                ExaminationExaminerQuotaRegionGroup.regions
            )
        )
    )
    return list((await session.execute(stmt)).scalars().all())


async def count_gender_distribution(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    exclude_examiner_id: UUID | None = None,
) -> GenderDistribution:
    stmt = (
        select(Examiner.gender)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            Examiner.examination_id == examination_id,
            ExaminerSubject.subject_id == subject_id,
            Examiner.gender.in_(["Male", "Female"]),
        )
    )
    if exclude_examiner_id is not None:
        stmt = stmt.where(Examiner.id != exclude_examiner_id)
    rows = (await session.execute(stmt)).scalars().all()
    dist = GenderDistribution()
    for gender in rows:
        if gender == "Male":
            dist.male += 1
        elif gender == "Female":
            dist.female += 1
    return dist


def _merge_gender_additional(
    base: GenderDistribution,
    additional: dict[int, GenderDistribution] | None,
    *,
    subject_id: int,
) -> GenderDistribution:
    extra = additional.get(subject_id, GenderDistribution()) if additional is not None else GenderDistribution()
    return GenderDistribution(male=base.male + extra.male, female=base.female + extra.female)


def _gender_quota_for_label(gender: str) -> str:
    return "Male" if gender == "Male" else "Female"


async def count_roster_distribution(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    exclude_examiner_id: UUID | None = None,
) -> dict[UUID, GroupDistribution]:
    region_to_group = await _load_region_to_group(session, examination_id)
    stmt = (
        select(Examiner)
        .join(ExaminerSubject, ExaminerSubject.examiner_id == Examiner.id)
        .where(
            Examiner.examination_id == examination_id,
            ExaminerSubject.subject_id == subject_id,
        )
    )
    if exclude_examiner_id is not None:
        stmt = stmt.where(Examiner.id != exclude_examiner_id)
    examiners = list((await session.execute(stmt)).scalars().all())

    dist = _empty_distribution()
    for ex in examiners:
        if ex.region is None:
            continue
        group_info = region_to_group.get(ex.region)
        if group_info is None:
            continue
        group_id, _ = group_info
        dist[group_id].total += 1
        dist[group_id].by_role[ex.examiner_type] = dist[group_id].by_role.get(ex.examiner_type, 0) + 1
    return dict(dist)


def _merge_additional(
    base: dict[UUID, GroupDistribution],
    additional: dict[tuple[int, UUID], GroupDistribution] | None,
    *,
    subject_id: int,
    group_id: UUID,
    examiner_type: ExaminerType,
) -> tuple[int, int]:
    db = base.get(group_id, GroupDistribution())
    extra = GroupDistribution()
    if additional is not None:
        extra = additional.get((subject_id, group_id), GroupDistribution())
    total = db.total + extra.total
    role_count = db.by_role.get(examiner_type, 0) + extra.by_role.get(examiner_type, 0)
    return total, role_count


def _quota_share_percents(keys: list[str], quotas: list[int | None]) -> dict[str, float]:
    """Share of each non-null cap within a category (values sum to 100)."""
    pairs = [(k, q) for k, q in zip(keys, quotas, strict=True) if q is not None and q > 0]
    if not pairs:
        return {}
    total = sum(q for _, q in pairs)
    if total <= 0:
        return {}
    raw = {k: 100.0 * q / total for k, q in pairs}
    rounded = {k: round(v, 1) for k, v in raw.items()}
    drift = round(100.0 - sum(rounded.values()), 1)
    if drift != 0 and rounded:
        last_key = pairs[-1][0]
        rounded[last_key] = round(rounded[last_key] + drift, 1)
    return rounded


def _apply_quota_percents(rows: list[dict], *, key_field: str) -> None:
    if not rows:
        return
    keys = [str(r[key_field]) for r in rows]
    quotas = [r.get("quota") for r in rows]
    percents = _quota_share_percents(keys, quotas)
    for row in rows:
        row["quota_percent"] = percents.get(str(row[key_field]))


def _gender_cap(settings: SubjectQuotaSettings, gender: str) -> int | None:
    if gender == "Male":
        return settings.male_quota
    if gender == "Female":
        return settings.female_quota
    return None


def _check_gender_quota(
    *,
    settings: SubjectQuotaSettings,
    gender: str | None,
    gender_counts: GenderDistribution,
) -> QuotaExceedResult | None:
    if gender not in ("Male", "Female"):
        return None
    cap = _gender_cap(settings, gender)
    if cap is None:
        return None
    current = gender_counts.male if gender == "Male" else gender_counts.female
    if current + 1 > cap:
        label = _gender_quota_for_label(gender)
        return QuotaExceedResult(
            exceeded=True,
            message=(
                f"The nationwide quota for {label} examiners is full ({cap} allowed)."
            ),
        )
    return None


async def would_exceed_quota(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    region: Region,
    examiner_type: ExaminerType,
    gender: str | None = None,
    exclude_examiner_id: UUID | None = None,
    additional: dict[tuple[int, UUID], GroupDistribution] | None = None,
    additional_gender: dict[int, GenderDistribution] | None = None,
) -> QuotaExceedResult:
    quotas = await list_quotas_for_subject(session, examination_id=examination_id, subject_id=subject_id)
    settings = await get_quota_settings_for_subject(
        session, examination_id=examination_id, subject_id=subject_id
    )
    has_regional_quotas = bool(quotas)
    has_gender_quotas = settings.male_quota is not None or settings.female_quota is not None
    if not has_regional_quotas and not has_gender_quotas:
        return QuotaExceedResult(exceeded=False)

    group_id: UUID | None = None
    group_name: str | None = None
    if has_regional_quotas:
        try:
            group_id, group_name = await resolve_group_for_region(
                session, examination_id=examination_id, region=region
            )
        except ValueError as exc:
            return QuotaExceedResult(exceeded=True, message=str(exc))

        dist = await count_roster_distribution(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            exclude_examiner_id=exclude_examiner_id,
        )
        total_count, role_count = _merge_additional(
            dist, additional, subject_id=subject_id, group_id=group_id, examiner_type=examiner_type
        )

        total_quota = next(
            (q.quota_count for q in quotas if q.group_id == group_id and q.examiner_type is None),
            None,
        )
        role_quota = next(
            (q.quota_count for q in quotas if q.group_id == group_id and q.examiner_type == examiner_type),
            None,
        )

        if total_quota is not None and total_count + 1 > total_quota:
            return QuotaExceedResult(
                exceeded=True,
                group_id=group_id,
                group_name=group_name,
                message=(
                    f"The quota for {group_name} is full ({total_quota} examiner"
                    f"{'s' if total_quota != 1 else ''})."
                ),
            )

        if role_quota is not None and role_count + 1 > role_quota:
            role_label = _examiner_type_label(examiner_type)
            return QuotaExceedResult(
                exceeded=True,
                group_id=group_id,
                group_name=group_name,
                examiner_type=examiner_type,
                message=(
                    f"The quota for {role_label} in {group_name} is full ({role_quota} allowed)."
                ),
            )

    if has_gender_quotas:
        gender_dist = await count_gender_distribution(
            session,
            examination_id=examination_id,
            subject_id=subject_id,
            exclude_examiner_id=exclude_examiner_id,
        )
        merged_gender = _merge_gender_additional(
            gender_dist, additional_gender, subject_id=subject_id
        )
        gender_result = _check_gender_quota(
            settings=settings,
            gender=gender,
            gender_counts=merged_gender,
        )
        if gender_result is not None:
            return gender_result

    return QuotaExceedResult(exceeded=False, group_id=group_id, group_name=group_name)


async def assert_examiner_regional_quota_allowed(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    region: Region,
    examiner_type: ExaminerType,
    gender: str | None = None,
    exclude_examiner_id: UUID | None = None,
    additional: dict[tuple[int, UUID], GroupDistribution] | None = None,
    additional_gender: dict[int, GenderDistribution] | None = None,
) -> None:
    result = await would_exceed_quota(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        region=region,
        examiner_type=examiner_type,
        gender=gender,
        exclude_examiner_id=exclude_examiner_id,
        additional=additional,
        additional_gender=additional_gender,
    )
    if result.exceeded and result.message:
        raise ValueError(result.message)


def build_quota_waitlist_portal_message(
    *,
    invitee_name: str,
    group_name: str,
    subject_name: str,
    examiner_type: ExaminerType,
) -> str:
    role_label = _examiner_type_label(examiner_type)
    first = invitee_name.split()[0] if invitee_name.strip() else "there"
    return (
        f"Thank you, {first}, for confirming your availability as {role_label} for {subject_name}. "
        f"The roster quota for the {group_name} region group is currently full. "
        f"A place may open if another examiner declines or is removed from the roster. "
        f"Please return to this page and try confirming again — we'll add you automatically when a slot is available."
    )


async def get_quota_settings_for_subject(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> SubjectQuotaSettings:
    from app.models import SubjectExaminerQuotaSettings

    stmt = select(SubjectExaminerQuotaSettings).where(
        SubjectExaminerQuotaSettings.examination_id == examination_id,
        SubjectExaminerQuotaSettings.subject_id == subject_id,
    )
    row = (await session.execute(stmt)).scalar_one_or_none()
    if row is None:
        return SubjectQuotaSettings()
    return SubjectQuotaSettings(
        total_quota=int(row.total_quota) if row.total_quota is not None else None,
        male_quota=int(row.male_quota) if row.male_quota is not None else None,
        female_quota=int(row.female_quota) if row.female_quota is not None else None,
    )


async def get_total_quota_for_subject(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
) -> int | None:
    settings = await get_quota_settings_for_subject(
        session, examination_id=examination_id, subject_id=subject_id
    )
    return settings.total_quota


async def upsert_quota_settings_for_subject(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    total_quota: int | None,
    male_quota: int | None = None,
    female_quota: int | None = None,
) -> None:
    from app.models import SubjectExaminerQuotaSettings

    stmt = select(SubjectExaminerQuotaSettings).where(
        SubjectExaminerQuotaSettings.examination_id == examination_id,
        SubjectExaminerQuotaSettings.subject_id == subject_id,
    )
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if total_quota is None and male_quota is None and female_quota is None:
        if existing is not None:
            await session.delete(existing)
        return
    if existing is None:
        session.add(
            SubjectExaminerQuotaSettings(
                examination_id=examination_id,
                subject_id=subject_id,
                total_quota=total_quota,
                male_quota=male_quota,
                female_quota=female_quota,
            )
        )
    else:
        existing.total_quota = total_quota
        existing.male_quota = male_quota
        existing.female_quota = female_quota
    await session.flush()


async def upsert_total_quota_for_subject(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    total_quota: int | None,
) -> None:
    settings = await get_quota_settings_for_subject(
        session, examination_id=examination_id, subject_id=subject_id
    )
    await upsert_quota_settings_for_subject(
        session,
        examination_id=examination_id,
        subject_id=subject_id,
        total_quota=total_quota,
        male_quota=settings.male_quota,
        female_quota=settings.female_quota,
    )


async def replace_quotas_for_subject(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    items: list[tuple[UUID, ExaminerType | None, int]],
) -> list[SubjectExaminerRegionQuota]:
    await session.execute(
        delete(SubjectExaminerRegionQuota).where(
            SubjectExaminerRegionQuota.examination_id == examination_id,
            SubjectExaminerRegionQuota.subject_id == subject_id,
        )
    )
    created: list[SubjectExaminerRegionQuota] = []
    for group_id, examiner_type, quota_count in items:
        row = SubjectExaminerRegionQuota(
            examination_id=examination_id,
            subject_id=subject_id,
            group_id=group_id,
            examiner_type=examiner_type,
            quota_count=quota_count,
        )
        session.add(row)
        created.append(row)
    await session.flush()
    return created


async def assess_proposed_examiners(
    session: AsyncSession,
    *,
    examination_id: int,
    subject_id: int,
    proposed: list[ProposedExaminerRow],
) -> dict:
    quotas = await list_quotas_for_subject(session, examination_id=examination_id, subject_id=subject_id)
    dist = await count_roster_distribution(
        session, examination_id=examination_id, subject_id=subject_id
    )
    region_to_group = await _load_region_to_group(session, examination_id)

    additional: dict[tuple[int, UUID], GroupDistribution] = defaultdict(GroupDistribution)
    additional_gender: dict[int, GenderDistribution] = defaultdict(GenderDistribution)
    row_errors: list[dict] = []
    violations: list[str] = []
    settings = await get_quota_settings_for_subject(
        session, examination_id=examination_id, subject_id=subject_id
    )

    for idx, row in enumerate(proposed, start=1):
        if row.subject_id != subject_id:
            row_errors.append({"row_number": idx, "message": "Subject does not match assessment subject."})
            continue
        group_info = region_to_group.get(row.region)
        if group_info is None:
            row_errors.append(
                {"row_number": idx, "message": f"Region {row.region.value} is not in a quota region group."}
            )
            continue
        group_id, _ = group_info
        key = (subject_id, group_id)
        additional[key].total += 1
        additional[key].by_role[row.examiner_type] = (
            additional[key].by_role.get(row.examiner_type, 0) + 1
        )
        if row.gender == "Male":
            additional_gender[subject_id].male += 1
        elif row.gender == "Female":
            additional_gender[subject_id].female += 1

    summary_by_group: list[dict] = []
    group_ids = {q.group_id for q in quotas}

    group_name_by_id: dict[UUID, str] = {}

    stmt = (
        select(ExaminationExaminerQuotaRegionGroup)
        .where(ExaminationExaminerQuotaRegionGroup.examination_id == examination_id)
        .options(selectinload(ExaminationExaminerQuotaRegionGroup.regions))
    )
    for group in (await session.execute(stmt)).scalars().all():
        group_name_by_id[group.id] = group.name

    for group_id in sorted(group_ids, key=lambda g: group_name_by_id.get(g, "").lower()):
        group_name = group_name_by_id.get(group_id, "Unknown")
        current = dist.get(group_id, GroupDistribution())
        extra = additional.get((subject_id, group_id), GroupDistribution())
        proposed_total = current.total + extra.total
        total_quota = next((q.quota_count for q in quotas if q.group_id == group_id and q.examiner_type is None), None)

        if total_quota is not None:
            total_row = {
                "group_id": str(group_id),
                "group_name": group_name,
                "examiner_type": None,
                "examiner_type_label": "Total",
                "current_count": current.total,
                "proposed_count": extra.total,
                "combined_count": proposed_total,
                "quota": total_quota,
                "quota_percent": None,
                "remaining": total_quota - proposed_total,
                "over_cap": proposed_total > total_quota,
            }
            summary_by_group.append(total_row)
            if total_row["over_cap"]:
                violations.append(f"{group_name} total exceeds quota ({proposed_total}/{total_quota}).")

        for et in ExaminerType:
            role_quota = next(
                (q.quota_count for q in quotas if q.group_id == group_id and q.examiner_type == et),
                None,
            )
            if role_quota is None:
                continue
            current_role = current.by_role.get(et, 0)
            proposed_role = extra.by_role.get(et, 0)
            combined_role = current_role + proposed_role
            role_row = {
                "group_id": str(group_id),
                "group_name": group_name,
                "examiner_type": et.value,
                "examiner_type_label": _examiner_type_label(et),
                "current_count": current_role,
                "proposed_count": proposed_role,
                "combined_count": combined_role,
                "quota": role_quota,
                "quota_percent": None,
                "remaining": role_quota - combined_role,
                "over_cap": combined_role > role_quota,
            }
            summary_by_group.append(role_row)
            if role_row["over_cap"]:
                violations.append(
                    f"{group_name} {_examiner_type_label(et)} exceeds quota ({combined_role}/{role_quota})."
                )

    group_total_rows = [r for r in summary_by_group if r["examiner_type"] is None]
    _apply_quota_percents(group_total_rows, key_field="group_id")
    for group_id_str in {r["group_id"] for r in summary_by_group if r["examiner_type"] is not None}:
        role_rows = [
            r for r in summary_by_group if r["group_id"] == group_id_str and r["examiner_type"] is not None
        ]
        _apply_quota_percents(role_rows, key_field="examiner_type")

    gender_dist = await count_gender_distribution(
        session, examination_id=examination_id, subject_id=subject_id
    )
    merged_gender = _merge_gender_additional(gender_dist, additional_gender, subject_id=subject_id)
    summary_by_gender: list[dict] = []
    for gender_label in ("Male", "Female"):
        cap = _gender_cap(settings, gender_label)
        if cap is None:
            continue
        current = gender_dist.male if gender_label == "Male" else gender_dist.female
        combined = merged_gender.male if gender_label == "Male" else merged_gender.female
        proposed_g = combined - current
        gender_row = {
            "gender": gender_label,
            "gender_label": gender_label,
            "current_count": current,
            "proposed_count": proposed_g,
            "combined_count": combined,
            "quota": cap,
            "quota_percent": None,
            "remaining": cap - combined,
            "over_cap": combined > cap,
        }
        summary_by_gender.append(gender_row)
        if gender_row["over_cap"]:
            violations.append(
                f"Nationwide {gender_label} quota exceeded ({combined}/{cap})."
            )
    _apply_quota_percents(summary_by_gender, key_field="gender")

    return {
        "valid": len(violations) == 0 and len(row_errors) == 0,
        "violations": violations,
        "row_errors": row_errors,
        "summary_by_group": summary_by_group,
        "summary_by_gender": summary_by_gender,
        "proposed_count": len(proposed),
    }


def role_short_label(examiner_type: ExaminerType) -> str:
    return ROLE_SHORT_CODES.get(examiner_type, examiner_type.value)
