# Remember

Warm Modern Heirloom — private memories for the people who matter most.

## Stack
- Frontend: React + Vite + JavaScript + CSS
- Backend: Python + Flask + SQLAlchemy + JWT
- Development DB: SQLite
- Production frontend: Vercel
- Production backend: deploy separately (Render/Railway/Fly.io/etc.)

## Run frontend
cd frontend
npm install
npm run dev

## Run backend
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate
pip install -r requirements.txt
python run.py

Frontend: http://localhost:5173
Backend: http://127.0.0.1:5000

Demo login:
Email: felix@remember.app
Password: remember123
