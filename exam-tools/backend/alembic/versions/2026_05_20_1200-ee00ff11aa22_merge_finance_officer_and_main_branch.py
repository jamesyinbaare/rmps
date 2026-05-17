"""Merge finance officer enum branch with main migration line.

Two revisions both had down_revision cc00dd11ee22:
- dd1122334455 (FINANCE_OFFICER userrole)
- b1c2d3e4f5a6 -> ... -> f0a1b2c3d4e5 (inspector postings / system_settings)

Revision ID: ee00ff11aa22
Revises: dd1122334455, f0a1b2c3d4e5
Create Date: 2026-05-20

"""

from collections.abc import Sequence

revision: str = "ee00ff11aa22"
down_revision: str | Sequence[str] | None = ("dd1122334455", "f0a1b2c3d4e5")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
