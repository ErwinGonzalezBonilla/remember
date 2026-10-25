from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool
import os

from .config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
# En Vercel cada función es efímera: sin pool propio (Neon ya hace pooling) y comprobando la conexión.
engine = create_engine(
    settings.database_url, connect_args=connect_args, pool_pre_ping=True,
    **({"poolclass": NullPool} if os.getenv("VERCEL") else {}),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def add_missing_columns():
    """Mini-migración para el MVP: añade a las tablas existentes las columnas nuevas (todas opcionales),
    para no tener que borrar la base de datos cada vez que el modelo crece. Más adelante: Alembic."""
    insp = inspect(engine)
    if insp.has_table("memories") and "connection_id" in {c["name"] for c in insp.get_columns("memories")}:
        raise RuntimeError(
            "\n\n  La base de datos es de la versión anterior (conexiones), que cambió de modelo.\n"
            "  Detén el servidor, borra el archivo backend/remember.db y vuelve a arrancar.\n")
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name not in existing and col.nullable:
                    col_type = col.type.compile(dialect=engine.dialect)
                    conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN {col.name} {col_type}'))
        # Columnas añadidas a posteriori que deben ser únicas
        conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username)'))
