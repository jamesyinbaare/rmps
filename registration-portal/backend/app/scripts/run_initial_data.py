#!/usr/bin/env python3
"""Script to run initial data setup."""
import asyncio
import sys

from app.dependencies.database import get_sessionmanager, initialize_db
from app.initial_data import ensure_system_admin_user


async def main() -> None:
    """Run initial data setup."""
    try:
        sessionmanager = get_sessionmanager()
        async with initialize_db(sessionmanager):
            async with sessionmanager.session() as session:
                await ensure_system_admin_user(session)
        print("Initial data setup completed successfully")
    except Exception as e:
        print(f"Error during initial data setup: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
