# Render audit — two services, two databases (fix this first)

## What we found (live check)

You currently have **two separate Render web backends** talking to **different databases**:

| Web service URL | `/health` (live) | Houda (`hbouamor@andrew.cmu.edu`) |
|-----------------|------------------|-----------------------------------|
| **`https://countsfor-summer-26.onrender.com`** | Old deploy: `{"status":"ok"}` only | Password login **works** after Create account |
| **`https://countsfor-backend.onrender.com`** | New deploy: `database: connected`, **7 tables** | **No password saved** (`no_password_set`) — Google-only account |

The GitHub Pages frontend (`index.html`) points at **`countsfor-summer-26`**.

DBeaver on **`CountsFor_Summer_2026`** (`dpg-d8nqt2gk1i2s73dksaug-a`, ohio) may show **zero tables** while auth still “works” on the web service if:

1. You are looking at the **wrong database** (e.g. `countsfor-db` in oregon is where the *other* service writes), or
2. **`countsfor-summer-26` has not redeployed** latest code / bootstrap never ran on that service’s linked `DATABASE_URL`.

After redeploying latest `main`, `/health` should return:

```json
{"status":"ok","database":"connected","db_host":"dpg-d8nqt2gk1i2s73dksaug-a","tables":7}
```

**`db_host` in `/health` must match the hostname in DBeaver.** If it does not, you are inspecting the wrong Postgres instance.

---

## Canonical setup (one service, one DB)

| Resource | Keep | Delete / ignore |
|----------|------|-----------------|
| Web service | **`countsfor-summer-26`** (or rename to match repo) | **`countsfor-backend`** — suspend or delete after migrating |
| Postgres | **`CountsFor_Summer_2026`** (ohio, `dpg-d8nqt2gk1i2s73dksaug-a`) | **`countsfor-db`** (oregon) — old blueprint |
| Blueprint file | **`render.yaml` at repo root only** | `backend/render.yaml`, `backend/render.supabase.yaml` (removed from repo) |

---

## Houda Bouamor login

Directory email (correct): **`hbouamor@andrew.cmu.edu`** — not `houda@andrew.cmu.edu`.

1. Open **Create account** (not Sign in) on the live site.
2. Email: `hbouamor@andrew.cmu.edu`, set password, submit.
3. Log out → **Sign in** with the same password.

If you previously signed in with **Google**, there was no password on file until Create account runs once.

---

## DBeaver checklist

1. Render → **CountsFor_Summer_2026** → **Connect** → copy **External Database URL**.
2. DBeaver new connection → Postgres → paste URL → SSL required.
3. Schema: **`public`** (not empty catalog).
4. Compare host to `https://countsfor-summer-26.onrender.com/health` → field **`db_host`**.
5. SQL:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY 1;

SELECT email, password_hash IS NOT NULL AS has_password
FROM users WHERE email LIKE '%bouamor%' OR email LIKE '%houda%';
```

---

## Render Shell (populate tables now)

On **`countsfor-summer-26`** → Shell:

```bash
python -c "import os,re; u=os.environ.get('DATABASE_URL',''); print(re.sub(r'://([^:]+):([^@]+)@', r'://\1:***@', u))"
python -m backend.bootstrap_db
curl -s localhost:$PORT/health
```

Pre-deploy log must end with `Database bootstrap OK`.

---

## Repo blueprint commands (Settings must match)

| Setting | Value |
|---------|--------|
| Root Directory | *(empty)* |
| Pre-Deploy | `python -m backend.bootstrap_db` |
| Start | `SKIP_DB_BOOTSTRAP=1 gunicorn --workers=1 --bind 0.0.0.0:$PORT --timeout 120 --access-logfile - 'backend.app:create_app()'` |
| `DATABASE_URL` | Linked to **CountsFor_Summer_2026** |

Manual Deploy → **Clear build cache**.
