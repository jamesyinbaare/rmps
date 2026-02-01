import contextlib
import logging
from collections.abc import AsyncIterator
from typing import Annotated, Any
from urllib.parse import urlparse

from fastapi import Depends, HTTPException
from pydantic_settings import BaseSettings
from sqlalchemy import NullPool, text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import JSON

from app.config import settings


class Base(DeclarativeBase):
    __abstract__ = True
    type_annotation_map = {
        dict[str, Any]: JSON,
    }


class DBSettings(BaseSettings):
    database_use: bool = True
    database_url: str | None = None
    echo_sql: bool = False
    pool_size: int = 10
    max_overflow: int = 10
    pool_timeout: int = 30
    pool_recycle: int = 1800  # 30 minutes
    mock_database: bool = False
    use_null_pool: bool = False
    database_extensions: list[str] = []


db_settings = DBSettings()  # type: ignore

# Heavily inspired by https://praciano.com.br/fastapi-and-async-sqlalchemy-20-with-pytest-done-right.html


def convert_to_async_url(url: str) -> str:
    """Convert a synchronous PostgreSQL URL to use asyncpg driver for async SQLAlchemy.

    Converts:
    - postgresql:// -> postgresql+asyncpg://
    - postgresql+psycopg2:// -> postgresql+asyncpg://
    - postgresql+asyncpg:// -> postgresql+asyncpg:// (no change)

    Args:
        url: The database URL string

    Returns:
        The URL string with asyncpg driver specified
    """
    # If already using asyncpg, return as-is
    if "postgresql+asyncpg://" in url:
        return url

    # Replace postgresql:// with postgresql+asyncpg://
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)

    # Replace postgresql+psycopg2:// with postgresql+asyncpg://
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)

    # Return as-is if no conversion needed (e.g., already async or different driver)
    return url


def validate_database_url(url: str) -> None:
    """Validate database URL has a non-empty, valid host to avoid IDNA/socket errors.

    Raises ValueError if the host is missing, empty, or invalid (e.g. leading dot).
    """
    if not url or not url.strip():
        raise ValueError(
            "DATABASE_URL is empty. Set it to your PostgreSQL URL, e.g. "
            "postgresql+asyncpg://user:pass@cloud-sql-proxy-staging:5432/dbname"
        )
    parsed = urlparse(url)
    host = (parsed.hostname or "").strip()
    if not host:
        raise ValueError(
            "DATABASE_URL has no host (e.g. '@:5432' or '@/db'). "
            "For Cloud SQL proxy use host 'cloud-sql-proxy-staging', e.g. "
            "postgresql+asyncpg://user:pass@cloud-sql-proxy-staging:5432/dbname"
        )
    if host.startswith(".") or ".." in host or host.endswith("."):
        raise ValueError(
            f"DATABASE_URL has invalid host '{host}' (empty label or leading/trailing dot). "
            "Use a valid hostname, e.g. cloud-sql-proxy-staging"
        )


def should_disable_ssl(url: str) -> bool:
    """Check if URL connects to Cloud SQL Proxy (which requires plain TCP).

    The proxy handles TLS to Cloud SQL; the client→proxy connection must not use SSL.
    """
    parsed = urlparse(url)
    host = (parsed.hostname or "").strip().lower()
    return "cloud-sql-proxy" in host


class DatabaseSessionManager:
    _engine: AsyncEngine | None
    _sessionmaker: async_sessionmaker | None

    def __init__(self, host: str, engine_kwargs: dict[str, Any] | None = None):
        validate_database_url(host)
        # Convert database URL to use async driver if needed
        url = convert_to_async_url(host)
        self._host = url
        self._engine_kwargs = engine_kwargs or {}

        # Cloud SQL Proxy expects plain TCP; disable SSL via connect_args
        if should_disable_ssl(url):
            if "connect_args" not in self._engine_kwargs:
                self._engine_kwargs["connect_args"] = {}
            # asyncpg uses ssl=False (not sslmode) to disable SSL
            self._engine_kwargs["connect_args"]["ssl"] = False

        self._engine = None
        self._sessionmaker = None

    async def configure(self) -> None:
        if self._engine is not None:
            return  # Already configured

        self._engine = create_async_engine(self._host, **self._engine_kwargs)
        self._sessionmaker: async_sessionmaker = async_sessionmaker(
            autocommit=False, bind=self._engine, expire_on_commit=False
        )

    async def close(self) -> None:
        if self._engine is None:
            return
        await self._engine.dispose()

        self._engine = None
        self._sessionmaker = None

    @contextlib.asynccontextmanager
    async def connect(self) -> AsyncIterator[AsyncConnection]:
        if self._engine is None:
            raise Exception("DatabaseSessionManager is not initialized")

        async with self._engine.begin() as connection:
            try:
                yield connection
            except Exception:
                await connection.rollback()
                raise

    @contextlib.asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        if self._sessionmaker is None:
            raise Exception("DatabaseSessionManager is not initialized")

        session = self._sessionmaker()
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


class TestingDatabaseSessionManager(DatabaseSessionManager):
    async def configure(self) -> None:
        from pytest_postgresql.janitor import DatabaseJanitor

        result = urlparse(settings.database_url)
        self.__janitor = DatabaseJanitor(
            user=result.username,
            host=result.hostname,
            port=result.port,  # type: ignore
            dbname=result.path.strip("/"),
            version=14,
            password=result.password,
        )  # type: ignore

        try:
            self.__janitor.drop()
        except Exception:
            pass
        self.__janitor.init()

        await super().configure()

        if db_settings.database_extensions:
            async with self.connect() as conn:
                for ext in db_settings.database_extensions:
                    await conn.execute(text(f"CREATE EXTENSION IF NOT EXISTS {ext};"))
                await conn.commit()

        async with self.connect() as conn:
            tables_only = [table for table in Base.metadata.sorted_tables if not table.info.get("is_view")]
            await conn.run_sync(lambda sync_conn: Base.metadata.create_all(sync_conn, tables=tables_only))

    async def close(self) -> None:
        async with self.connect() as conn:
            tables_only = [table for table in reversed(Base.metadata.sorted_tables) if not table.info.get("is_view")]
            await conn.run_sync(lambda sync_conn: Base.metadata.drop_all(sync_conn, tables=tables_only))
        await super().close()
        self.__janitor.drop()


if db_settings.mock_database:
    if db_settings.database_url is None:
        raise Exception("Database URL is not set")
    elif db_settings.use_null_pool:
        sessionmanager: DatabaseSessionManager = TestingDatabaseSessionManager(
            settings.database_url,
            {
                "echo": db_settings.echo_sql,
                "poolclass": NullPool,
            },
        )
    else:
        sessionmanager: DatabaseSessionManager | None = TestingDatabaseSessionManager(
            settings.database_url,
            {
                "echo": db_settings.echo_sql,
                "pool_size": db_settings.pool_size,
                "max_overflow": db_settings.max_overflow,
                "pool_timeout": db_settings.pool_timeout,
                "pool_recycle": db_settings.pool_recycle,
            },
        )
elif db_settings.database_use:
    database_url = db_settings.database_url or settings.database_url
    if database_url:
        sessionmanager = DatabaseSessionManager(
            database_url,
            {
                "echo": db_settings.echo_sql,
                "pool_size": db_settings.pool_size,
                "max_overflow": db_settings.max_overflow,
                "pool_timeout": db_settings.pool_timeout,
                "pool_recycle": db_settings.pool_recycle,
            },
        )
    else:
        logging.getLogger().warning("Database URL is not set")
        sessionmanager = None
else:
    logging.getLogger().warning("Database is not configured")
    sessionmanager = None


async def get_db_session() -> AsyncIterator[AsyncSession]:
    if sessionmanager is None:
        raise HTTPException(512, "Database is not configured")

    async with sessionmanager.session() as session:
        yield session


async def get_db() -> AsyncIterator[DatabaseSessionManager]:
    if sessionmanager is None:
        raise HTTPException(512, "Database is not configured")

    yield sessionmanager


def get_sessionmanager() -> DatabaseSessionManager:
    if sessionmanager is None:
        raise Exception("Database is not configured")

    return sessionmanager


DBSessionDep = Annotated[AsyncSession, Depends(get_db_session)]


@contextlib.asynccontextmanager
async def initialize_db(manager: DatabaseSessionManager) -> AsyncIterator[DatabaseSessionManager]:
    await manager.configure()
    yield manager
    await manager.close()
