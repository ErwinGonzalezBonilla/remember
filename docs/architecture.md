# Remember Architecture

Frontend and backend are intentionally separated.

Frontend:
React + Vite -> REST API -> Flask

Backend:
Flask -> SQLAlchemy -> SQLite in development / PostgreSQL in production

Authentication:
JWT access token.

The frontend prototype contains demo data so the UX can be tested before connecting every screen to the API.
