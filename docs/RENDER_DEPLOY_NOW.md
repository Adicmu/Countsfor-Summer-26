# Deploy now — database is ready

Use this when **CountsFor_Summer_2026** shows **Available** (Basic/Starter) but the site still won't sign in.

Your new DB host should look like: `dpg-d9osve67bikc7380dumg-a` (Ohio).

---

## 1. Connect the web service to Postgres (required)

The database page showing **0 services** means nothing is linked yet.

**Option A — from the database (easiest)**

1. Open **CountsFor_Summer_2026** → **Apps** (or **Connect**)
2. Select web service **`countsfor-summer-26`**
3. Confirm **`DATABASE_URL`** is injected (Internal URL)

**Option B — from the web service**

1. Open **`countsfor-summer-26`** (web service, not the DB)
2. **Environment** → **Add Environment Variable**
3. Key: `DATABASE_URL`
4. Value: pick **CountsFor_Summer_2026** → **Internal Database URL**

---

## 2. Environment checklist (web service)

| Variable | Required | Value |
|----------|----------|--------|
| `DATABASE_URL` | Yes | Linked to **CountsFor_Summer_2026** (internal) |
| `FLASK_ENV` | Yes | `production` |
| `SECRET_KEY` | Yes | Generate random string |
| `GOOGLE_CLIENT_ID` | Yes | Same as in `index.html` meta tag |
| `ALLOWED_EMAIL_DOMAIN` | Yes | `andrew.cmu.edu` |
| `FRONTEND_ORIGIN` | Yes | `https://adicmu.github.io,https://hindjendara.github.io,http://localhost:8765` |
| `ALLOW_BOOTSTRAP_SKIP` | **Remove** | Delete this if present — DB is ready; bootstrap must run |

---

## 3. Deploy

1. **Manual Deploy** → **Clear build cache & deploy**
2. Open **Logs** and confirm pre-deploy ends with:
   ```
   Database bootstrap OK
   Required tables present (7): ...
   ```
3. Wait until status is **Live**

---

## 4. Verify

```text
https://countsfor-summer-26.onrender.com/health
```

Expected:

```json
{
  "status": "ok",
  "database": "connected",
  "db_host": "dpg-d9osve67bikc7380dumg-a",
  "tables": 7
}
```

`db_host` **must** match your new Postgres hostname in the Render dashboard.

Then open the live site → sign in or create account.

---

## If deploy still fails

| Log error | Fix |
|-----------|-----|
| `DATABASE_URL is not set` | Link DB to web service (Step 1) |
| `bootstrap verification failed — missing tables` | Redeploy; ensure `ALLOW_BOOTSTRAP_SKIP` is **not** set |
| `FATAL: bootstrap expected PostgreSQL` | `DATABASE_URL` still pointing at old/deleted DB — re-link |
| Build fails on `requirements.txt` | Root Directory empty; Build: `pip install -r requirements.txt` |
| Health check timeout | Web plan too small or crash — check **Runtime** logs after `gunicorn` starts |

Paste the first red block from **Deploy** or **Pre-Deploy** logs if stuck.
