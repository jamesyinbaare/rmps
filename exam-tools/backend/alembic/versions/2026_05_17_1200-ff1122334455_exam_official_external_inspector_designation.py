"""Exam centre officials: External Inspector designation + 10-digit phone check.

Revision ID: ff1122334455
Revises: ee00ff11aa22
Create Date: 2026-05-17

- ck_exam_school_official_designation: add External Inspector (app enum already had it).
- ck_exam_school_official_telephone_gh: store any 10 digits; Ghana prefix rules are UI-only.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "ff1122334455"
down_revision: Union[str, Sequence[str], None] = "ee00ff11aa22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DESIGNATION_CHECK = (
    "designation IN ("
    "'Depot Keeper', "
    "'Supervisor', "
    "'Assistant Supervisor', "
    "'Invigilator', "
    "'Police Officer', "
    "'External Inspector'"
    ")"
)

_OLD_DESIGNATION_CHECK = (
    "designation IN ("
    "'Depot Keeper', "
    "'Supervisor', "
    "'Assistant Supervisor', "
    "'Invigilator', "
    "'Police Officer'"
    ")"
)

_OLD_PHONE_CHECK = (
    "telephone_number ~ '^0(20|23|24|25|26|27|28|29|50|54|55|56|57|59)[0-9]{7}$'"
)
_NEW_PHONE_CHECK = "length(telephone_number) = 10 AND telephone_number ~ '^[0-9]{10}$'"


def upgrade() -> None:
    op.drop_constraint(
        "ck_exam_school_official_designation",
        "exam_centre_officials",
        type_="check",
    )
    op.create_check_constraint(
        "ck_exam_school_official_designation",
        "exam_centre_officials",
        _DESIGNATION_CHECK,
    )
    op.drop_constraint(
        "ck_exam_school_official_telephone_gh",
        "exam_centre_officials",
        type_="check",
    )
    op.create_check_constraint(
        "ck_exam_school_official_telephone_gh",
        "exam_centre_officials",
        _NEW_PHONE_CHECK,
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_exam_school_official_telephone_gh",
        "exam_centre_officials",
        type_="check",
    )
    op.create_check_constraint(
        "ck_exam_school_official_telephone_gh",
        "exam_centre_officials",
        _OLD_PHONE_CHECK,
    )
    op.drop_constraint(
        "ck_exam_school_official_designation",
        "exam_centre_officials",
        type_="check",
    )
    op.create_check_constraint(
        "ck_exam_school_official_designation",
        "exam_centre_officials",
        _OLD_DESIGNATION_CHECK,
    )
