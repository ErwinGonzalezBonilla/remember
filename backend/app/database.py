import hashlib

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


def _fingerprint() -> str:
    """Huella del modelo (tablas y columnas). Cambia solo cuando el código añade algo a la base de datos."""
    parts = sorted(f"{t.name}.{c.name}:{c.type}" for t in Base.metadata.sorted_tables for c in t.columns)
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def ensure_schema():
    """Al arrancar: 1 consulta si la base de datos ya está al día. Solo si el modelo cambió (un despliegue
    nuevo) crea las tablas y columnas que falten y guarda la huella nueva."""
    fp = _fingerprint()
    try:
        with engine.connect() as conn:
            if conn.execute(text("SELECT value FROM app_settings WHERE key = 'schema'")).scalar() == fp:
                return
    except Exception:  # noqa: BLE001 - primera vez: la tabla aún no existe
        pass
    Base.metadata.create_all(bind=engine)
    add_missing_columns()
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM app_settings WHERE key = 'schema'"))
        conn.execute(text("INSERT INTO app_settings (key, value) VALUES ('schema', :v)"), {"v": fp})


def add_missing_columns():
    """Mini-migración para el MVP: añade a las tablas existentes las columnas nuevas (todas opcionales),
    para no tener que borrar la base de datos cada vez que el modelo crece. Más adelante: Alembic."""
    # 1) Revisar con una sola conexión (solo lectura)
    with engine.connect() as conn:
        insp = inspect(conn)
        if insp.has_table("memories") and "connection_id" in {c["name"] for c in insp.get_columns("memories")}:
            raise RuntimeError(
                "\n\n  La base de datos es de la versión anterior (conexiones), que cambió de modelo.\n"
                "  Detén el servidor, borra el archivo backend/rehomi.db y vuelve a arrancar.\n")
        tables = set(insp.get_table_names())
        missing = []
        for table in Base.metadata.sorted_tables:
            if table.name not in tables:
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            missing += [(table.name, col) for col in table.columns if col.name not in existing and col.nullable]
    # 2) Aplicar los cambios
    with engine.begin() as conn:
        for table_name, col in missing:
            conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN {col.name} {col.type.compile(dialect=engine.dialect)}'))
        # Columnas añadidas a posteriori que deben ser únicas
        conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username)'))
