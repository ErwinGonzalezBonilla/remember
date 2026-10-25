# Remember · Conecta · Guarda · Siempre

App privada para guardar recuerdos con las personas que importan y compartirlos cuando estén listas.

**La idea:** el recuerdo va primero. Guardas una foto, un video, un audio o una nota y etiquetas a la persona con quien lo viviste, aunque no tenga cuenta (por ejemplo, tu bebé). Cada persona tiene su **cofre**. Cuando esa persona crea su cuenta y os conectáis, su cofre se abre.

**Conectar (parte 2):** cada usuario tiene un @usuario. Quien crea su cuenta busca a la otra persona por @usuario o correo exacto y le envía una solicitud diciendo quién es para ella; quien la recibe elige quién es para él, la vincula con una persona de su lista y acepta: su cofre se abre. Desconectar revoca el acceso en los dos sentidos.

**Regla de privacidad:** ves un recuerdo si lo creaste tú o si estás etiquetado en él y conectado con quien lo guardó.
Stack: **React + Vite** → **FastAPI** → **SQLAlchemy** → **PostgreSQL** (SQLite en local), JWT, Cloudinary opcional.

```
remember/
├── backend/            FastAPI
│   ├── app/
│   │   ├── main.py         app, CORS, errores en español, /uploads
│   │   ├── config.py       variables de entorno (.env)
│   │   ├── models.py       User, Person, Memory, MemoryTag, Comment, Reaction, PasswordReset
│   │   ├── schemas.py      validación (Pydantic)
│   │   ├── security.py     bcrypt, JWT, códigos de invitación
│   │   ├── deps.py         usuario actual + regla de visibilidad de recuerdos
│   │   ├── storage.py      subida de fotos/video/audio con límites (local o Cloudinary)
│   │   └── routers/        auth · me · people · memories · connect
│   └── tests/test_flujo.py flujo completo + privacidad
└── frontend/           React + Vite
    └── src/
        ├── api/client.js       fetch con token y errores
        ├── context/AuthContext.jsx
        ├── components/         Logo, Icon, ui (botones, avatar, nav inferior…)
        ├── pages/auth/         Login, Registro, Recuperar, Restablecer
        ├── pages/people/       Tus personas, Añadir/editar persona, Cofre (línea de tiempo)
        ├── pages/memories/     Galería con filtros, Nuevo recuerdo (con etiquetas y grabadora), Detalle
        ├── pages/              Home, Perfil/Bienvenida, Calendario (cumpleaños y fechas), Ajustes
        └── styles/app.css      sistema visual (paleta del informe, modo oscuro)
```

## Puesta en marcha

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # cambia SECRET_KEY
uvicorn app.main:app --reload
```
API en http://localhost:8000 · documentación interactiva en http://localhost:8000/docs

Tests: `pytest -q`

### Frontend
```bash
cd frontend
npm install
npm run dev
```
App en http://localhost:5173 (Vite redirige `/api` y `/uploads` al backend).

> El enlace de "Olvidé mi contraseña" se imprime en la consola del backend (todavía no hay envío de emails).

## Qué incluye

| Área | Estado |
|---|---|
| Sistema visual | ✅ Paleta del informe, logo, Nunito/Caveat, modo oscuro, mobile-first |
| Cuenta | ✅ Registro, login, recuperar contraseña (enlace de 1 h y un solo uso), cambio de contraseña, eliminar cuenta |
| Perfil | ✅ Bienvenida tras registrarse, foto, frase y cumpleaños |
| Inicio | ✅ Tus personas en círculos, "Guarda un recuerdo" como acción principal, fecha especial próxima |
| Personas y cofre | ✅ Personas sin cuenta (bebé, pareja, amigos), su cofre como línea de tiempo por años |
| Recuerdos | ✅ Foto, video, audio (grabado o subido) y nota; etiquetas a 0..n personas; "solo para mí"; galería con filtros |
| Reacciones y comentarios | ✅ |
| Calendario | ✅ Cumpleaños y fechas especiales de tus personas |
| Conectar y abrir el cofre | ⏳ Parte 2 |

## Decisiones de privacidad y seguridad

- **Privado por defecto:** un recuerdo solo lo ve quien lo creó y, en la parte 2, las personas etiquetadas que se conecten. Si no puedes verlo, la API responde *404* (no revela que existe).
- **Solo puedes etiquetar a personas de tu propia lista.** Borrar a una persona no borra tus recuerdos: solo quita la etiqueta.
- **Login con mensaje genérico** ("Correo o contraseña incorrectos"), así nadie averigua qué correos tienen cuenta.
- Contraseñas con **bcrypt**; tokens de recuperación guardados como hash SHA-256.
- Multimedia: lista blanca de formatos, límite de tamaño (`MAX_UPLOAD_MB`) y nombres aleatorios.
- Eliminar cuenta borra sus recuerdos, personas, comentarios y reacciones.

## Publicar (Vercel + Railway)

**Backend en Railway** (carpeta `backend`, arranca con `railway.json`):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (añade antes el servicio PostgreSQL) |
| `SECRET_KEY` | una clave larga nueva (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) |
| `FRONTEND_URL` | la URL de Vercel, p. ej. `https://remember-erwin.vercel.app` |
| `CLOUDINARY_URL` | `cloudinary://API_KEY:API_SECRET@CLOUD_NAME` (fotos, videos y audios) |

**Frontend en Vercel** (carpeta `frontend`, preset Vite): variable `VITE_API_URL` = la URL pública de Railway, sin barra final.

Pendiente antes de un lanzamiento real:
- **Alembic** para migraciones (ahora `create_all` + columnas nuevas automáticas).
- **Archivos privados**: en Cloudinary pasar a `type="authenticated"` con URLs firmadas.
- **Envío de emails** para la recuperación de contraseña (Resend o un flujo n8n).
- **Rate limiting** en `/api/auth/*` contra fuerza bruta, y token en cookie `httpOnly`.

## Siguientes pasos sugeridos (orden del informe)

- **Parte 2 – Conectar y abrir el cofre**: `@usuario` único, búsqueda por @usuario o correo exacto, solicitudes (pendiente/aceptada), vincular la solicitud con una persona de tu lista (`Person.linked_user_id`) y pantalla "¡Tu cofre se ha abierto!".
- **Cápsula**: recuerdos sellados hasta una fecha (p. ej. sus 18 años); el backend no los devuelve antes.
- **Chat** por WebSocket entre personas conectadas.
- **Calendario** completo: eventos propios, vista mensual y recordatorios.
12. **Settings y Privacy**: exportar datos (ZIP), 2FA, notificaciones.
13. **Recommendations**: tabla `Recommendation` con categoría y listas conjuntas.

## Publicar en Vercel (todo en un proyecto)

`vercel.json` en la raíz usa **Vercel Services**: la web (`frontend/`) y la API FastAPI (`backend/`) en el mismo dominio; `/api/*` va al backend y el resto a React.

1. Importa el repo en Vercel con **Root Directory = raíz del repo** (no `frontend`).
2. En el proyecto → **Storage**: crea una base de datos **Neon (Postgres)** y un **Blob** con acceso **Public**, y conéctalos al proyecto (añaden `DATABASE_URL` y las variables de Blob solos).
3. **Settings → Environment Variables**: `SECRET_KEY` (clave larga nueva) y `FRONTEND_URL` (`https://tu-proyecto.vercel.app`).
4. Redeploy.

Límites de esta versión: cada subida admite como máximo 4 MB (límite de Vercel); las fotos se reducen en el navegador antes de subirse. Los archivos en Blob público tienen URLs largas y aleatorias, pero no están firmadas.

