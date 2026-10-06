# Placement Pulse — AI Placement Drive Tracker

A full-stack placement management platform for colleges. It includes a polished student/placement-cell UI, JWT authentication, eligibility filtering, applications, status tracking, notifications, analytics, and a browser-based AI voice assistant.

## Stack
- Frontend: React + Vite + React Router + Lucide icons + custom responsive CSS
- Backend: Node.js + Express + JWT + bcryptjs
- Database: SQLite-compatible SQL.js (persists to `backend/data/placement.sqlite`)
- Voice: Browser Web Speech API (speech-to-text + text-to-speech), no paid API key required

## Features
- Student and placement-cell roles
- Student profile: branch, CGPA, backlogs, skills
- Drive CRUD with company, role, package, eligibility and deadline
- Automatic eligibility filtering
- Apply before deadline; duplicate protection
- Placement-cell applicant tracking and status updates
- Student application dashboard
- Notifications and upcoming deadline cards
- Analytics with branch/company/status summaries
- AI voice assistant with placement-aware commands/questions
- Search, filters, pagination-ready API patterns
- Seeded demo accounts and sample drives

## Demo accounts
- Student: `student@demo.com` / `Student@123`
- Placement cell: `admin@demo.com` / `Admin@123`

## Run

### Backend
```bash
cd backend
npm install
npm run dev
```
Runs on `http://localhost:5000`.

### Frontend
In another terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the Vite URL shown in the terminal (normally `http://localhost:5173`).

The frontend proxies `/api` to the backend in development.

## Voice assistant
Use Chrome/Edge for the best Web Speech API support. Click the microphone in the dashboard and ask things such as:
- "What drives am I eligible for?"
- "What is my application status?"
- "Which drives are closing soon?"
- "How many applicants does Infosys have?"

The app converts speech to text, calls the backend assistant, and reads the answer aloud.

## Production notes
- Replace the JWT secret in `.env`.
- Serve the built frontend behind HTTPS; microphone permissions are best supported over secure origins.
- For enterprise deployment, swap SQL.js for PostgreSQL and add an object store for resumes.
