# Setup guide — Google SSO + Render backend

This guide walks you through everything you (the operator) need to do
to take the auth-enabled build live. The code is already written and
tested; only third-party setup remains.

**Time budget**: ~30–45 minutes the first time, ~5 minutes for any subsequent
deploys.

---

## 1. Create a Google OAuth client

1. Go to <https://console.cloud.google.com/apis/credentials>.
2. If you don't have a project yet, create one — call it `CountsFor`.
3. Click **+ CREATE CREDENTIALS → OAuth client ID**.
4. If asked to configure the consent screen first:
   - User type: **External** (so anyone with andrew.cmu.edu can sign in).
   - App name: `CountsFor`.
   - User support email: your andrew.cmu.edu address.
   - Authorized domains: `github.io`, `onrender.com`.
   - Test users: add yourself + ladyhodhod for the first week (after which
     you can move the consent screen to "In production" to lift the limit).
5. Back at "Create OAuth client ID":
   - Application type: **Web application**.
   - Name: `CountsFor Web`.
   - **Authorized JavaScript origins** — add ALL of these:
     - `http://localhost:8765`        ← local frontend (python http.server)
     - `https://adicmu.github.io`     ← deployed frontend (GitHub Pages)
   - **Authorized redirect URIs** — leave empty. (We use the
     popup flow, not redirect.)
6. Click **Create**. Copy the **Client ID** (looks like
   `1234567890-abc…apps.googleusercontent.com`).

**Where to paste it** — two places:

- `index.html` line ~15:
  ```html
  <meta name="cf-google-client-id" content="PASTE-CLIENT-ID-HERE" />
  ```
- On Render (next step): `GOOGLE_CLIENT_ID` env var.

> Note: the Client ID is **not** a secret. It's safe to commit to the
> public repo. The client *secret* (which you won't need here, since we
> only verify ID tokens) IS secret — don't paste that anywhere.

---

## 2. Deploy the backend to Render

1. Sign up at <https://render.com> (free tier).
2. Click **New + → Blueprint**.
3. Connect your GitHub account. Pick the `Countsfor-Summer-26` repo.
4. Render reads `backend/render.yaml` and proposes:
   - One **Web Service** named `countsfor-backend` (Python).
   - One **Postgres** database named `countsfor-db` (free tier).
   Click **Apply**.

5. After ~3 minutes the services start. Open the web service. Click
   **Environment** → **Add Environment Variable** for each:

   | Key                       | Value                                                                  |
   | ------------------------- | ---------------------------------------------------------------------- |
   | `GOOGLE_CLIENT_ID`        | (paste the value from step 1.6)                                        |
   | `ADMIN_EMAILS`            | `avivek@andrew.cmu.edu,ladyhodhod@andrew.cmu.edu` (comma-separated)    |
   | `ALLOWED_EMAIL_DOMAIN`    | `andrew.cmu.edu` (or leave empty to accept any Google account)         |
   | `FRONTEND_ORIGIN`         | `https://adicmu.github.io,http://localhost:8765`                        |

   (`SECRET_KEY` and `DATABASE_URL` are auto-set by `render.yaml` — leave
   them alone.)

6. Click **Manual Deploy → Deploy latest commit**. Wait for the green
   `Live` indicator.

7. Note the service URL — it'll look like
   `https://countsfor-backend.onrender.com`. Confirm it's reachable:
   ```
   curl https://countsfor-backend.onrender.com/health
   {"status":"ok"}
   ```

8. **Tell the frontend where the backend is.** Update `js/api.js` —
   find the `CF_BACKEND_URL` constant and replace the default
   `https://countsfor-backend.onrender.com` with your actual URL (if
   different). Commit + push.

> Free tier caveats:
> - Web service sleeps after 15 min of inactivity. First request after
>   sleep takes ~30s to wake. Subsequent requests are fast.
> - Postgres free tier expires after **90 days** — Render will email you
>   a reminder. Plan to upgrade ($7/mo) or migrate before then.

---

## 3. Local development

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env — at minimum set GOOGLE_CLIENT_ID, ADMIN_EMAILS, SECRET_KEY.
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m backend.app                # http://localhost:5000

# Frontend (separate terminal)
cd /Users/adityavivek/Desktop/CountsFor
python3 -m http.server 8765          # http://localhost:8765

# Run all tests
PYTHONPATH=. pytest backend/tests -q                 # backend
open http://localhost:8765/tests/test.html           # frontend (in browser)
```

The frontend auto-detects `localhost` and points at `http://localhost:5000`
for the API. Production builds point at the Render URL.

---

## 4. Post-deploy verification checklist

Sign in once each as:

- [ ] **Student** (any non-admin andrew.cmu.edu account) — confirm:
      onboarding completes, role badge shows the major, Save course works,
      navbar Saved count updates, NO "Flag course issue" button visible
      on the course card, NO "Flag review" navbar button.
- [ ] **Faculty** (a non-admin account; manually set their role via the
      profile-completion screen) — confirm: NO Save button, "Flag course
      issue" appears and the modal submits successfully, navbar shows NO
      "Flag review" (admin only).
- [ ] **Admin** (an email listed in `ADMIN_EMAILS`) — confirm: "Flag
      review" appears in the navbar, opens the review list with tab
      filtering (Pending/Reviewed/Resolved/Dismissed), can resolve a
      flag and the status badge updates.
- [ ] **Sign out** — confirm session cookie is cleared, refresh shows
      the login screen again.

If any check fails, see **Troubleshooting** below.

---

## 5. Troubleshooting

### "Sign-in failed" toast after clicking Google button
- **Cause**: backend rejected the ID token. Common reasons:
  - `GOOGLE_CLIENT_ID` on Render doesn't match the one in `index.html`.
  - The current origin (e.g. `https://adicmu.github.io`) isn't in the
    Authorized JavaScript origins on the Google Console client.
- **Fix**: check both. Origins are matched **exactly** — no trailing slash,
  HTTPS vs HTTP must match.

### CORS error in the browser console
- **Cause**: `FRONTEND_ORIGIN` env var on Render doesn't include the
  origin you're hitting from. Each origin must be listed verbatim,
  comma-separated.

### Backend wakes from sleep slowly on free tier
- **Expected**. First request after 15 min idle takes 20–30s. The
  frontend falls back to "demo mode" (localStorage) during the cold start
  so the UI stays interactive — when the backend comes online the
  next sign-in succeeds.

### Admin role doesn't stick
- `ADMIN_EMAILS` is checked on EVERY login — adding/removing an email
  takes effect on that user's next sign-in. Sign out + back in to refresh.

### "GOOGLE_CLIENT_ID not set on the server" error
- The Render web service is missing the env var. Add it in the Render
  dashboard → Environment → save → manual redeploy.

---

## 6. What to do when you need to change something

- **Add an admin**: edit `ADMIN_EMAILS` in Render dashboard → save →
  Render auto-redeploys → that user signs out and back in.
- **Lock signups to a different domain**: change `ALLOWED_EMAIL_DOMAIN`.
- **Add a new endpoint**: add a route to `backend/`, write a pytest test,
  commit, push — Render auto-deploys.
- **Reset the database** (e.g. wipe stale flags during testing): in
  Render dashboard → Postgres → Connect → run
  `TRUNCATE flags, wishlist_items;` (keeps users intact).

---

## 7. What's NOT done yet

- **Email verification flow** — Google handles this already; no extra
  emails sent by our backend.
- **Password reset / email + password fallback** — not implemented since
  SSO covers the CMU community. Add when external advisors need access.
- **Andrew SSO (Shibboleth)** — would replace Google but require IT
  involvement. Out of scope for v1.
- **Course offering ML predictor** — current implementation is rule-based
  only (see `predictOffering()` in `js/data.js`).
- **Data deduplication** for `data/courses.json` — flagged as a future
  cleanup; the offering predictor already dedupes per-course internally.
