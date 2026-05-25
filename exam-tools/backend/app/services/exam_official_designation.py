"""Designation display order for exam centre officials (PDF and exports)."""

from __future__ import annotations

from typing import cast

from app.models import ExamCentreOfficial, ExamOfficialDesignation
from app.services.exam_official_export import designation_str

DESIGNATION_DISPLAY_ORDER: tuple[str, ...] = (
    ExamOfficialDesignation.SUPERVISOR.value,
    ExamOfficialDesignation.ASSISTANT_SUPERVISOR.value,
    ExamOfficialDesignation.EXTERNAL_INSPECTOR.value,
    ExamOfficialDesignation.DEPOT_KEEPER.value,
    ExamOfficialDesignation.POLICE_OFFICER.value,
    ExamOfficialDesignation.INVIGILATOR.value,
)

_RANK_BY_LABEL: dict[str, int] = {label: i for i, label in enumerate(DESIGNATION_DISPLAY_ORDER)}


def designation_sort_rank(designation: str) -> int:
    """Lower rank sorts first; unknown designations sort last."""
    return _RANK_BY_LABEL.get(designation.strip(), len(DESIGNATION_DISPLAY_ORDER))


def sort_officials_by_designation_then_name(rows: list[ExamCentreOfficial]) -> list[ExamCentreOfficial]:
    """Sort by canonical designation order, then full name ascending."""
    return sorted(
        rows,
        key=lambda r: (
            designation_sort_rank(designation_str(r.designation)),
            cast(str, r.full_name).casefold(),
            str(r.id),
        ),
    )
