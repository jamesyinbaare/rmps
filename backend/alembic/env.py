import asyncio
from logging.config import fileConfig
import os
from alembic_utils.pg_grant_table import PGGrantTable
from alembic_utils.pg_function import PGFunction
from sqlalchemy import pool, engine_from_config
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from app.config import settings
from alembic import context
from app.models import Base
# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = Base.metadata

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.
env = settings.environment
if env == "dev":
    database_url = "postgresql+asyncpg://postgres:postgres@postgres:5432/icm_db" #settings.database_url
elif env == "stg":
    db_pass = os.environ.get("DB_PASS", None)
    db_host = os.environ.get("DB_HOST", "")
    db_name = os.environ.get("DB_NAME", "icm_db")
    database_url = f"postgresql://postgres:{db_pass}@{db_host}/{db_name}"
else:  # FIXME(james): support test & production environments by reading db creds from secrets manager
    raise ValueError(f"ENV {env} is not supported.")
print(f"Using database URL: {database_url}")


def include_object(object, name, type_, reflected, compare_to) -> bool:
    if isinstance(object, PGGrantTable):
        return False
    elif isinstance(object, PGFunction) and object.to_variable_name() in ["public_delete_old_tasks"]:
        return False
    return True


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, include_object=include_object)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = database_url
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    asyncio.run(run_async_migrations())


# def run_migrations_online() -> None:
#     """Run migrations in 'online' mode.

#     In this scenario we need to create an Engine
#     and associate a connection with the context.

#     """
#     configuration = config.get_section(config.config_ini_section)
#     configuration["sqlalchemy.url"] = database_url

#     connectable = engine_from_config(
#         configuration,  # Use the updated configuration
#         prefix="sqlalchemy.",
#         poolclass=pool.NullPool,
#     )
#     with connectable.connect() as connection:
#         context.configure(connection=connection, target_metadata=target_metadata, include_object=include_object)

#         with context.begin_transaction():
#             context.run_migrations()



if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
