"""Pytest configuration: allow importing app modules without a live database."""

import os

# Must run before any `app.*` import that loads `app.dependencies.database`.
os.environ.setdefault("DATABASE_USE", "false")
