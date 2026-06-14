"""Store travel-rate region as varchar API values (e.g. Ashanti).

Revision ID: n1a2b3c4d5e7
Revises: m1a2b3c4d5e6
Create Date: 2026-06-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "n1a2b3c4d5e7"
down_revision: str | Sequence[str] | None = "m1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_REGION_ENUM_TO_API = """
    CASE region::text
        WHEN 'ASHANTI' THEN 'Ashanti'
        WHEN 'BONO' THEN 'Bono'
        WHEN 'BONO_EAST' THEN 'Bono East'
        WHEN 'AHAFO' THEN 'Ahafo'
        WHEN 'CENTRAL' THEN 'Central'
        WHEN 'EASTERN' THEN 'Eastern'
        WHEN 'GREATER_ACCRA' THEN 'Greater Accra'
        WHEN 'NORTHERN' THEN 'Northern'
        WHEN 'NORTH_EAST' THEN 'North East'
        WHEN 'SAVANNAH' THEN 'Savannah'
        WHEN 'UPPER_EAST' THEN 'Upper East'
        WHEN 'UPPER_WEST' THEN 'Upper West'
        WHEN 'VOLTA' THEN 'Volta'
        WHEN 'OTI' THEN 'Oti'
        WHEN 'WESTERN' THEN 'Western'
        WHEN 'WESTERN_NORTH' THEN 'Western North'
        ELSE region::text
    END
"""

_PG_REGION_ENUM_NAMES = (
    "ASHANTI",
    "BONO",
    "BONO_EAST",
    "AHAFO",
    "CENTRAL",
    "EASTERN",
    "GREATER_ACCRA",
    "NORTHERN",
    "NORTH_EAST",
    "SAVANNAH",
    "UPPER_EAST",
    "UPPER_WEST",
    "VOLTA",
    "OTI",
    "WESTERN",
    "WESTERN_NORTH",
)


def upgrade() -> None:
    bind = op.get_bind()
    udt_name = bind.execute(
        sa.text(
            "SELECT udt_name FROM information_schema.columns "
            "WHERE table_schema = 'public' "
            "AND table_name = 'examination_examiner_travel_rates' "
            "AND column_name = 'region'"
        )
    ).scalar()
    if udt_name is None:
        return

    if udt_name == "region":
        op.execute(
            f"""
            ALTER TABLE examination_examiner_travel_rates
            ALTER COLUMN region TYPE VARCHAR(64)
            USING ({_REGION_ENUM_TO_API})
            """
        )
    else:
        names_sql = ", ".join(f"'{name}'" for name in _PG_REGION_ENUM_NAMES)
        op.execute(
            f"""
            UPDATE examination_examiner_travel_rates
            SET region = ({_REGION_ENUM_TO_API})
            WHERE region IN ({names_sql})
            """
        )


def downgrade() -> None:
    pass
