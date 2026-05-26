# CountsFor — Backend (scaffold only)

This directory is reserved for the future Python backend. **No running code lives here yet** — auth + persistent storage are deferred per the May 26 meeting decision. The frontend currently uses `localStorage` and the existing GitHub-hosted course data.

When the backend is implemented, this scaffold pre-commits the team to:

- **Framework**: Flask (lightweight, easy for student contributors) + SQLAlchemy
- **DB**: SQLite for local dev, Postgres for production (Render/Fly.io recommended)
- **Auth**: server-side sessions via Flask-Login; passwords hashed with `bcrypt`
- **Authorization**: role-based decorators on every protected route
- **API shape**: see `../docs/BACKEND_API_CONTRACT.md`
- **Schema**: see `schema.sql`

## Suggested layout (when implementation begins)

```
backend/
├── app.py                    # Flask app factory + blueprint registration
├── auth.py                   # /api/auth/* routes — signup, login, logout, me
├── flags.py                  # /api/flags/* routes (POST by faculty, GET/PATCH by admin)
├── wishlist.py               # /api/wishlist/* routes (student-only)
├── models.py                 # SQLAlchemy models matching schema.sql
├── permissions.py            # @require_role decorator helpers
├── seed.py                   # Pull legacy localStorage entries → backfill DB
├── tests/
│   ├── test_auth.py
│   ├── test_flags.py
│   └── test_wishlist.py
├── requirements.txt          # flask, flask-sqlalchemy, flask-login, bcrypt, pytest
├── .env.example
└── schema.sql                # ← Already drafted; reflects the in-progress models
```

## Local dev (when ready)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
flask --app app run --debug --port 5000
```

The frontend's `js/api.js` is already organized as a priority chain
(live API → GitHub raw → local JSON). When the backend goes live, point
`API_BASE` in `js/api.js` at the deployed URL.

## Role-based authorization

Every protected endpoint must check the session user's role. Frontend gating
(showing/hiding buttons) is **not** sufficient — the meeting explicitly called
out that a student could otherwise inspect the DOM and submit a flag.

| Endpoint                       | Allowed roles                                                       |
| ------------------------------ | ------------------------------------------------------------------- |
| `POST /api/flags`              | `professor`, `area_head`, `associate_area_head`, `advisor`, `admin` |
| `GET /api/flags`               | `admin`                                                             |
| `PATCH /api/flags/:id`         | `admin`                                                             |
| `GET /api/wishlist`            | `student` (own data only)                                           |
| `POST /api/wishlist`           | `student`                                                           |
| `DELETE /api/wishlist/:code`   | `student` (own data only)                                           |
| `GET /api/me`                  | any logged-in user                                                  |
| `POST /api/auth/signup,login`  | public                                                              |
| `POST /api/auth/logout`        | any logged-in user                                                  |

## Migration plan (frontend → backend)

The frontend stores `cf_flags` and `cf_wishlist` in `localStorage` today with
the same field names as the DB schema. When auth ships:

1. On first login, the frontend POSTs any local `cf_flags` / `cf_wishlist`
   entries to the new endpoints (one-time migration).
2. After migration, the frontend reads/writes via the backend exclusively.
3. The local fallback remains for offline / demo mode but shows a clear
   "Sign in to sync" banner.
