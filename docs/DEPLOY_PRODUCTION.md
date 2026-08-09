# Production deploy — Google SSO, User table, flags, wishlist

This guide gets CountsFor live with **real sign in** and a **persistent User table**. Pick one database option; the backend always runs on **Render** (free tier works).

| You need | What provides it |
|----------|------------------|
| Flask API + Google SSO | Render web service |
| User / flags / wishlist storage | Postgres (Render **or** Supabase) |
| Static front end | GitHub Pages (this repo) |

**Accounts to create:** [Render](https://render.com), [Google Cloud Console](https://console.cloud.google.com), and optionally [Supabase](https://supabase.com) if you skip Render Postgres.

---

## Recommended path: Render backend + Render Postgres (simplest)

### Step 1 — Google OAuth client (~10 min)

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create project **CountsFor** (if needed).
3. Configure **OAuth consent screen** (External, app name CountsFor, support email your andrew address).
4. **Create credentials → OAuth client ID → Web application**.
5. **Authorized JavaScript origins** (add all that apply):
   - `http://localhost:8765`
   - Your GitHub Pages URL after Step 4 (example: `https://YOUR_GITHUB_USERNAME.github.io`)
   - If the repo is a project site: `https://YOUR_GITHUB_USERNAME.github.io/Countsfor-Summer-26`
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

Paste the Client ID in **`index.html`**:

```html
<meta name="cf-google-client-id" content="YOUR_CLIENT_ID_HERE" />
```

---

### Step 2 — Deploy backend on Render (~15 min)

1. Sign up at [render.com](https://render.com) and connect GitHub.
2. **New → Blueprint**.
3. Select this repo and use **`backend/render.yaml`** (default).
4. Click **Apply**. Render creates:
   - Web service `countsfor-backend`
   - Postgres `countsfor-db`
5. Open the web service → **Environment**. Add:

| Variable | Value |
|----------|--------|
| `GOOGLE_CLIENT_ID` | Same as in `index.html` |
| `ADMIN_EMAILS` | Your andrew email(s), comma separated |
| `ALLOWED_EMAIL_DOMAIN` | `andrew.cmu.edu` |
| `FRONTEND_ORIGIN` | Your Pages URL(s), comma separated (Step 4) |

Leave `SECRET_KEY` and `DATABASE_URL` auto-generated.

6. **Manual Deploy → Deploy latest commit**.
7. When **Live**, copy the service URL (example: `https://countsfor-backend-xxxx.onrender.com`).
8. Test:

```bash
curl https://YOUR-SERVICE.onrender.com/health
```

Expected: `{"status":"ok"}`

9. Paste that URL in **`index.html`**:

```html
<meta name="cf-backend-url" content="https://YOUR-SERVICE.onrender.com" />
```

---

### Step 3 — Seed faculty (skip onboarding for professors)

Copy and edit the seed file:

```bash
cp backend/seed_users.example.json backend/seed_users.json
```

Add real andrew emails, roles, and programs. Example entry:

```json
{
  "email": "prof@andrew.cmu.edu",
  "name": "Prof Name",
  "role": "professor",
  "primary_program": "CS",
  "department": "Computer Science"
}
```

On Render, set env var:

```
SEED_USERS_PATH=backend/seed_users.json
```

Commit `seed_users.json` only if emails are not sensitive, or paste rows manually in the database (Step 5).

Redeploy after adding the env var.

---

### Step 4 — Deploy front end on GitHub Pages (~5 min)

1. GitHub repo → **Settings → Pages**.
2. **Build and deployment → Source:** GitHub Actions.
3. Push to `main` (or run workflow **Deploy frontend to GitHub Pages** manually).
4. Note your site URL under Pages settings (example: `https://USER.github.io/Countsfor-Summer-26/`).
5. Update **`FRONTEND_ORIGIN`** on Render to match **exactly** (no trailing slash):

```
https://USER.github.io,https://USER.github.io/Countsfor-Summer-26,http://localhost:8765
```

6. Add the same origin(s) to Google OAuth **Authorized JavaScript origins**.

Commit and push `index.html` with `cf-backend-url` and `cf-google-client-id` filled in.

---

### Step 5 — Verify

Open your GitHub Pages URL. You should see **Sign in with Google**, not demo mode.

| Test | Expected |
|------|----------|
| Sign in as student | Onboarding once, then saved to User table |
| Sign in again | Straight to tailored view |
| Sign out | Login screen returns |
| Faculty account (seeded) | No onboarding, flag button visible |
| Admin email in `ADMIN_EMAILS` | Flag review + Users buttons in navbar |
| Render Postgres | Table Editor in Render dashboard shows `users` rows |

---

## Alternative: Render backend + Supabase Postgres

Use this if you want Supabase’s database UI, backups, or to avoid Render’s 90-day free Postgres limit.

### A — Create Supabase project

1. [supabase.com](https://supabase.com) → New project.
2. **Project Settings → Database → Connection string → URI**.
3. Copy the **Session pooler** URI (port 5432).

### B — Deploy Render without Render Postgres

1. Render → **New → Blueprint**.
2. Point at **`backend/render.supabase.yaml`** (not `render.yaml`).
3. In Environment, set:

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Supabase Session pooler URI |
| `GOOGLE_CLIENT_ID` | Your Client ID |
| `ADMIN_EMAILS` | Your admin andrew email(s) |
| `FRONTEND_ORIGIN` | GitHub Pages origin(s) |
| `ALLOWED_EMAIL_DOMAIN` | `andrew.cmu.edu` |

4. Deploy and set `cf-backend-url` in `index.html` (same as Step 2 above).

### C — Confirm tables in Supabase

After first successful deploy and one sign in:

**Supabase → Table Editor → `users`**

Columns include `email`, `role`, `primary_program`, `profile_completed`, `last_login`.

Faculty seeds: edit **`backend/seed_users.json`** or insert rows in Supabase with `profile_completed = true`.

See also [`SUPABASE_HOSTING.md`](SUPABASE_HOSTING.md).

---

## Local testing before going live

```powershell
# Terminal 1 — backend
cd backend
copy .env.example .env
# Edit .env: GOOGLE_CLIENT_ID, ADMIN_EMAILS, SECRET_KEY
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..
python -m backend.app

# Terminal 2 — front end
python -m http.server 8765
```

Open `http://localhost:8765`. Backend must be running or you get demo mode.

---

## Troubleshooting

**Still see onboarding splash every login for faculty**  
Add them to `backend/seed_users.json` with `role` + `primary_program`, or set `profile_completed = true` in the database.

**"Sign-in failed"**  
`GOOGLE_CLIENT_ID` must match on Render and in `index.html`. OAuth origins must match your Pages URL exactly.

**CORS error in browser console**  
Add your Pages origin to `FRONTEND_ORIGIN` on Render (no path, no trailing slash).

**First request slow (~30 s)**  
Render free tier sleeps after idle. Normal on cold start.

**Demo mode (no login screen)**  
Backend unreachable. Check `cf-backend-url` meta tag and `/health`.

---

## What you do not need

- **Supabase Auth** — Google SSO is handled by Flask.
- **OAuth client secret** — not used (ID token verification only).
- **SIO / CMU directory** — roles live in the local User table only.

---

## Quick reference — env vars on Render

```
SECRET_KEY              auto (Render) or random string
DATABASE_URL            auto (render.yaml) OR Supabase URI
GOOGLE_CLIENT_ID        from Google Cloud Console
ADMIN_EMAILS            you@andrew.cmu.edu
ALLOWED_EMAIL_DOMAIN    andrew.cmu.edu
FRONTEND_ORIGIN         https://YOUR_PAGES_ORIGIN,http://localhost:8765
SEED_USERS_PATH         backend/seed_users.json   (optional)
```

More detail: [`SETUP_AUTH.md`](SETUP_AUTH.md).
