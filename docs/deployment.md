# Deployment

## Frontend on Vercel

Import the repository into Vercel.

Root Directory:
frontend

Build Command:
npm run build

Output Directory:
dist

Environment Variable:
VITE_API_URL=https://YOUR-BACKEND-URL/api

The included frontend/vercel.json enables SPA routing.

## Backend

The Flask API should be deployed separately from the Vite frontend.

Set:
JWT_SECRET_KEY=long-random-secret
DATABASE_URL=your-production-database-url

For production, use PostgreSQL rather than SQLite.
