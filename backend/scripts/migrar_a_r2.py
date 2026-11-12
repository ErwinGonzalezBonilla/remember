"""Copia a R2 los archivos antiguos de Vercel Blob y cambia sus URLs por claves "r2:…".

NO se ejecuta solo. Antes de usarlo en producción, haz una copia de la base de datos.

    cd backend
    # 1) Ver qué haría, sin cambiar nada:
    DATABASE_URL="postgresql://…" R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… \
        python scripts/migrar_a_r2.py --dry-run
    # 2) Hacerlo:
    DATABASE_URL="postgresql://…" R2_ACCOUNT_ID=… … python scripts/migrar_a_r2.py

- Se puede ejecutar varias veces: lo que ya es "r2:…" no se toca, y la clave de cada archivo sale
  de su URL (migrado/<ruta en Blob>), así que repetir no duplica nada. Si un archivo ya está en R2
  con el mismo tamaño, no se vuelve a subir.
- No borra nada de Vercel Blob.
- Si un archivo falla, lo dice y sigue con los demás; al final muestra el resumen.
"""
import argparse
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # para importar app/ desde backend/

from sqlalchemy import inspect, text  # noqa: E402

COLUMNS = [  # (tabla, columna) con URLs de archivos
    ("users", "avatar_url"),
    ("people", "photo_url"),
    ("memories", "media_url"),
    ("memories", "poster_url"),
    ("time_capsules", "cover_url"),
    ("capsule_items", "media_url"),
    ("capsule_items", "poster_url"),
]
BLOB_HOST = ".blob.vercel-storage.com"


def is_blob(url: str | None) -> bool:
    if not url or not url.startswith("https://"):
        return False
    host = urlparse(url).hostname or ""
    return host.endswith(BLOB_HOST)


def key_for(url: str) -> str:
    """Clave en R2 para una URL de Blob: siempre la misma, para que repetir no duplique nada."""
    return "migrado/" + urlparse(url).path.lstrip("/")


def guess_type(url: str) -> str:
    from app.storage import EXT
    ext = Path(urlparse(url).path).suffix.lower()
    return next((ct for ct, e in EXT.items() if e == ext), "application/octet-stream")


def download(url: str) -> tuple[bytes, str]:
    import httpx
    r = httpx.get(url, timeout=120, follow_redirects=True)
    r.raise_for_status()
    return r.content, r.headers.get("content-type", "").split(";")[0].strip() or guess_type(url)


def migrate(engine, dry_run: bool = False, fetch=download, out=print) -> dict:
    """Recorre todas las columnas de URLs. Devuelve el resumen."""
    from app import r2

    stats = {"filas": 0, "archivos": 0, "subidos": 0, "ya_en_r2": 0, "actualizadas": 0, "errores": 0}
    insp = inspect(engine)
    rows = []
    with engine.connect() as conn:
        for table, col in COLUMNS:
            if not insp.has_table(table) or col not in {c["name"] for c in insp.get_columns(table)}:
                continue  # columna que aún no existe en esta base de datos
            for id_, url in conn.execute(text(f"SELECT id, {col} FROM {table} WHERE {col} LIKE :p"),
                                         {"p": f"%{BLOB_HOST}%"}):
                if is_blob(url):
                    rows.append((table, col, id_, url))
    urls = sorted({r[3] for r in rows})
    stats["filas"], stats["archivos"] = len(rows), len(urls)
    out(f"{len(rows)} valores con URLs de Vercel Blob ({len(urls)} archivos distintos).")
    if dry_run:
        for table, col, id_, url in rows:
            out(f"  {table}.{col} id={id_}: {url} → r2:{key_for(url)}")
        out("Modo --dry-run: no se ha cambiado nada.")
        return stats

    done = {}
    for i, url in enumerate(urls, 1):
        key = key_for(url)
        try:
            data, content_type = fetch(url)
            existing = r2.head(key)
            if existing and existing[0] == len(data):
                stats["ya_en_r2"] += 1
                out(f"[{i}/{len(urls)}] ya estaba en R2: {key}")
            else:
                r2.put(key, data, content_type)
                stats["subidos"] += 1
                out(f"[{i}/{len(urls)}] subido ({len(data) / 1024 / 1024:.1f} MB): {key}")
            done[url] = r2.PREFIX + key
        except Exception as e:  # noqa: BLE001 - sigue con los demás
            stats["errores"] += 1
            out(f"[{i}/{len(urls)}] ERROR con {url}: {e}")

    with engine.begin() as conn:
        for table, col, id_, url in rows:
            if url in done:
                # Solo si sigue teniendo la misma URL (nadie la ha cambiado mientras tanto)
                n = conn.execute(text(f"UPDATE {table} SET {col} = :new WHERE id = :id AND {col} = :old"),
                                 {"new": done[url], "id": id_, "old": url}).rowcount
                stats["actualizadas"] += n
    out(f"Hecho: {stats['subidos']} subidos, {stats['ya_en_r2']} ya estaban, {stats['actualizadas']} valores "
        f"actualizados, {stats['errores']} errores. Vercel Blob no se ha tocado.")
    return stats


def main():
    parser = argparse.ArgumentParser(description="Copia los archivos de Vercel Blob a R2 y cambia las URLs por claves r2:…")
    parser.add_argument("--dry-run", action="store_true", help="solo cuenta y muestra lo que haría")
    args = parser.parse_args()

    from app.config import settings
    from app.database import engine

    if not args.dry_run and not settings.uses_r2:
        sys.exit("Faltan las variables de R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).")
    print(f"Base de datos: {engine.url.render_as_string(hide_password=True)}")
    stats = migrate(engine, dry_run=args.dry_run)
    sys.exit(1 if stats["errores"] else 0)


if __name__ == "__main__":
    main()
