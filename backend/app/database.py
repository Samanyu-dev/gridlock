import os

from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./gridlock.db")

# Vercel Postgres / Neon give a postgres:// URL; SQLAlchemy wants postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

IS_SQLITE = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if IS_SQLITE else {}
# Pooling that survives serverless/Neon idle disconnects.
engine_kwargs = {"echo": False, "connect_args": connect_args}
if not IS_SQLITE:
    engine_kwargs.update({"pool_pre_ping": True, "pool_recycle": 300})
engine = create_engine(DATABASE_URL, **engine_kwargs)


def init_db():
    """Ensure tables exist.

    Production uses **Alembic migrations** as the schema strategy (see
    ``backend/alembic``). Auto-create runs only for SQLite (dev/tests) or when
    ``GRIDLOCK_AUTO_CREATE=1`` is set explicitly — it is never the production
    migration path for Postgres.
    """
    if not (IS_SQLITE or os.environ.get("GRIDLOCK_AUTO_CREATE") == "1"):
        return
    try:
        SQLModel.metadata.create_all(engine)
    except (IntegrityError, ProgrammingError):
        # Concurrent cold starts can race to create the same tables; harmless.
        pass


def get_session():
    with Session(engine) as session:
        yield session
