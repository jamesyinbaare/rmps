"""Pytest defaults so `app` imports without a live DATABASE_URL."""

import os

# Must be set before importing app.* (database module reads settings at import time).
os.environ.setdefault("DATABASE_USE", "false")
