"""examiner invitation status enum uppercase values

Revision ID: d4e5f6a7b0c1
Revises: c3d4e5f6a7b9
Create Date: 2026-06-05

Deprecated intermediate step (uppercase native enum). Superseded by e5f6a7b0c1d2
which stores status as VARCHAR. Kept as no-op so existing revision chains stay valid.
"""

from typing import Sequence, Union

revision: str = "d4e5f6a7b0c1"
down_revision: Union[str, None] = "c3d4e5f6a7b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
