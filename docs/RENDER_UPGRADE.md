# Render upgrade — free trial expired, deploy failing

> **Database already Available?** Skip to **`docs/RENDER_DEPLOY_NOW.md`** — connect `countsfor-summer-26` to the DB, remove `ALLOW_BOOTSTRAP_SKIP`, deploy.

When the **Render free trial or free Postgres expires**, deploys fail at **pre-deploy** (`bootstrap_db`) or **health check** (`/health` returns 503). Render may also block plan changes until the service can deploy.

If **Postgres was deleted** (common after free trial), create a **new** database and relink `DATABASE_URL` — the old connection string will never work again.

This repo includes a **recovery deploy** path to break that loop.

---

## Database was deleted — recreate it

1. Render Dashboard → **New +** → **PostgreSQL**
2. Name: **`CountsFor_Summer_2026`** (must match `render.yaml`)
3. Region: **Ohio (US East)**
4. Plan: **Starter** (requires billing on your account)
5. Create → wait until **Available**
6. Open your web service (**countsfor-summer-26**) → **Environment**
7. Add / link **`DATABASE_URL`** → select the new database → **Internal Database URL**
8. On the DB **Apps** tab, confirm **1 service** is connected (not 0)
9. **Remove** `ALLOW_BOOTSTRAP_SKIP` if it was set during recovery
10. **Manual Deploy** → **Clear build cache & deploy**
11. After `/health` shows `"database":"connected"`, you are done

Tables are created automatically by `python -m backend.bootstrap_db` during pre-deploy.

---

## Step 1 — Add billing (required before any upgrade)

1. [dashboard.render.com](https://dashboard.render.com) → **Account Settings** → **Billing**
2. Add a **credit card** and confirm billing is active

You do **not** need a successful deploy to add billing.

---

## Step 2 — Recovery deploy (get one successful deploy)

On your web service (**countsfor-summer-26** or **countsfor-backend**):

1. **Environment** → add:
   ```
   ALLOW_BOOTSTRAP_SKIP=1
   ```
2. **Manual Deploy** → **Clear build cache & deploy**

Pre-deploy and `/health` will succeed with `status: degraded` even if Postgres is unreachable. The service should show **Live**.

---

## Step 3 — Upgrade Postgres first

1. Open **CountsFor_Summer_2026** (Postgres) in Render
2. **Settings** → change plan to **Starter** (~$7/mo)
3. Wait until status is **Available**

If the old free database was deleted, create a **new** Starter Postgres in **ohio**, link it to the web service as `DATABASE_URL`, then redeploy.

---

## Step 4 — Upgrade web service

1. Web service → **Settings** → **Instance Type** → **Starter**
2. Or sync the repo **`render.yaml`** blueprint (already set to `plan: starter`)

---

## Step 5 — Normal deploy (remove recovery flag)

1. **Delete** `ALLOW_BOOTSTRAP_SKIP` from Environment (or set to empty)
2. **Manual Deploy** → **Clear build cache & deploy**
3. Test:
   ```
   https://countsfor-summer-26.onrender.com/health
   ```
   Expected:
   ```json
   {"status":"ok","database":"connected","tables":7}
   ```

---

## Blueprint (`render.yaml`)

| Resource | Plan |
|----------|------|
| Web (`countsfor-backend`) | `starter` |
| Postgres (`CountsFor_Summer_2026`) | `starter` |

After billing is on, use **Blueprints** → **Sync** or set plans manually in the dashboard.

---

## If upgrade is still greyed out

- Upgrade **Postgres** from the **database** page (not the web service page)
- Use **Account Settings → Billing** first
- Or create a **new** Starter web service + Starter Postgres, point `index.html` `cf-backend-url` at the new URL, delete the old free service later

---

## One canonical backend

Keep **`countsfor-summer-26`** (matches `index.html`). Suspend or delete duplicate **`countsfor-backend`** after migration. See `docs/RENDER_AUDIT.md`.
