"""Per-examination region groups for examiner roster quotas."""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ExaminationExaminerQuotaRegionGroup,
    ExaminationExaminerQuotaRegionGroupRegion,
    Region,
)
from app.services.examiner_reference_code import ALL_REGIONS


def validate_quota_region_group_payload(
    groups: Sequence[dict[str, object]],
) -> list[tuple[str, list[str]]]:
    """Validate PUT payload; returns normalized (name, regions) tuples."""
    if not groups:
        raise ValueError("At least one quota region group is required.")

    seen_regions: set[str] = set()
    normalized: list[tuple[str, list[str]]] = []

    for group in groups:
        name = str(group.get("name", "")).strip()
        if not name:
            raise ValueError("Each quota region group must have a name.")

        raw_regions = group.get("regions")
        if not isinstance(raw_regions, list) or not raw_regions:
            raise ValueError(f"Group '{name}' must include at least one region.")
        regions: list[str] = []
        for raw in raw_regions:
            region_val = str(raw).strip()
            if region_val in seen_regions:
                raise ValueError(f"Region '{region_val}' is assigned to more than one quota group.")
            seen_regions.add(region_val)
            regions.append(region_val)

        normalized.append((name, regions))

    expected = {r.value for r in ALL_REGIONS}
    if seen_regions != expected:
        missing = sorted(expected - seen_regions)
        extra = sorted(seen_regions - expected)
        if missing:
            raise ValueError(f"Unassigned regions: {', '.join(missing)}.")
        if extra:
            raise ValueError(f"Unknown regions: {', '.join(extra)}.")
    return normalized


async def quota_regions_fully_mapped(session: AsyncSession, examination_id: int) -> bool:
    count = (
        await session.execute(
            select(func.count())
            .select_from(ExaminationExaminerQuotaRegionGroupRegion)
            .where(ExaminationExaminerQuotaRegionGroupRegion.examination_id == examination_id)
        )
    ).scalar_one()
    return int(count or 0) == len(ALL_REGIONS)
