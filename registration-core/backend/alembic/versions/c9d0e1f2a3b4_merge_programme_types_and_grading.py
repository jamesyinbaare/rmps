"""Merge programme types branch with grading options branch

Revision ID: c9d0e1f2a3b4
Revises: a8b9c0d1e2f3, be281c6e6782
Create Date: 2026-03-18 23:35:00.000000

"""
from typing import Sequence, Union


revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = ("a8b9c0d1e2f3", "be281c6e6782")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Merge heads — no schema changes."""
    pass


def downgrade() -> None:
    """Un-merge heads — no schema changes."""
    pass
