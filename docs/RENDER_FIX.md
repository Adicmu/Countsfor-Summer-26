# Fix Render "Exited with status 1 while building"

Your deploy log shows **build failures** on every "Update SOC data" commit. That almost always means Render is building from the **repo root** with the default command `pip install -r requirements.txt`, but `requirements.txt` used to live only in `backend/`.

This repo now includes a **root `requirements.txt`** that points at the backend. After you push, redeploy should get past the build step.

---

## Step 1 — Push the fix

Commit and push `requirements.txt`, `runtime.txt`, and any other pending changes to `main` on GitHub.

---

## Step 2 — Fix web service Settings (Countsfor-Summer-26)

Open **Countsfor-Summer-26 → Settings**:

| Setting | Value |
|---------|--------|
| **Root Directory** | leave **empty** (repo root) |
| **Build Command** | `pip install -r requirements.txt` |
| **Pre-Deploy Command** | `python -m backend.bootstrap_db` |
| **Start Command** | `SKIP_DB_BOOTSTRAP=1 gunicorn --workers=1 --bind 0.0.0.0:$PORT --timeout 120 --access-logfile - 'backend.app:create_app()'` |

---

## Step 3 — Environment (Countsfor-Summer-26 → Environment)

| Variable | Value |
|----------|--------|
| `FLASK_ENV` | `production` |
| `DATABASE_URL` | Link **CountsFor_Summer_2026** (Internal Database URL) |
| `SECRET_KEY` | random string (Generate if empty) |
| `GOOGLE_CLIENT_ID` | your Client ID from `index.html` |
| `ADMIN_EMAILS` | `hjendara@andrew.cmu.edu` |
| `ALLOWED_EMAIL_DOMAIN` | `andrew.cmu.edu` |
| `FRONTEND_ORIGIN` | `https://hindjendara.github.io,http://localhost:8765` |

---

## Step 4 — Redeploy

**Manual Deploy → Clear build cache & deploy**

Wait for **Live**. Test:

```
https://YOUR-SERVICE.onrender.com/health
```

Expected: `{"status":"ok"}`

---

## Step 5 — Stop failed deploys on SOC-only commits (optional)

Soc-Bot pushes "Update SOC data" daily. Those commits only change JSON under `data/`. They should not break the backend build anymore once `requirements.txt` exists at repo root.

If builds still fail, open **Logs** and look for the first red line after `pip install`.

---

## Common log errors

| Log message | Fix |
|-------------|-----|
| `Could not open requirements file: requirements.txt` | Push root `requirements.txt` or set Root Directory to `backend` |
| `ModuleNotFoundError: No module named 'backend'` | Use the Start Command above (must run gunicorn from repo root) |
| `No module named 'psycopg2'` | Set Python to **3.11.9**, redeploy with cache clear |
| `Application failed to respond` on `/health` | Set **Pre-Deploy** + **Start** commands above; link **DATABASE_URL** to Postgres; use **1 worker** on free tier |
| Pre-deploy fails on DB | Open **CountsFor_Summer_2026** database is **Available**; **Environment → DATABASE_URL** must link to that DB |

Paste the first error block from the build log if it still fails after these steps.
