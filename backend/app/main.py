from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, add_missing_columns, engine
from .routers import auth, memories, people, users

# MVP: crea las tablas al arrancar. Cuando el modelo se estabilice, pasar a Alembic.
Base.metadata.create_all(bind=engine)
add_missing_columns()

app = FastAPI(title="Remember API", version="0.2.0",
              description="Conecta · Guarda · Siempre")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def friendly_validation(_: Request, exc: RequestValidationError):
    """Devuelve el primer error en español y claro, como pide el mapa de Login."""
    err = exc.errors()[0]
    field = err["loc"][-1] if err.get("loc") else ""
    msg = err.get("msg", "Datos no válidos.").removeprefix("Value error, ")
    kind = err.get("type", "")
    if field == "email":
        msg = "Ingresa un correo electrónico válido."
    elif kind == "missing":
        msg = "Completa todos los campos obligatorios."
    elif field == "full_name":
        msg = "Escribe tu nombre completo (mínimo 2 caracteres)."
    elif kind == "string_too_short":
        msg = "Este campo no puede estar vacío."
    elif kind == "string_too_long":
        msg = f"El texto es demasiado largo (máximo {err.get('ctx', {}).get('max_length', '')} caracteres)."
    elif kind in ("date_from_datetime_parsing", "date_parsing"):
        msg = "La fecha no es válida."
    elif kind == "literal_error":
        msg = "Elige una de las opciones disponibles."
    return JSONResponse(status_code=422, content={"detail": msg, "field": field})


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(people.router)
app.include_router(memories.router)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/api/health")
def health():
    return {"status": "ok"}
