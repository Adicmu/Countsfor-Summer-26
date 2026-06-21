# Hosting the User table on Supabase

CountsFor uses **SQLAlchemy + Flask** with a standard Postgres connection string. Supabase is Postgres under the hood, so you do not need Supabase Auth or the Supabase JS client for this app. Google SSO stays in Flask; Supabase only stores the `users`, `flags`, and `wishlist_items` tables.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. Choose a region (closest to your backend deploy is fine).
3. Save the database password you set at creation time.

## 2. Get the connection string

In the Supabase dashboard:

**Project Settings → Database → Connection string → URI**

Use the **Session pooler** URI (port 5432) for SQLAlchemy/Gunicorn, not the transaction pooler unless you know you need it.

It looks like:

```
postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
```

Supabase may show `postgres://` — the backend already rewrites that to `postgresql://` in `backend/config.py`.

## 3. Point the Flask backend at Supabase

Set one env var wherever the backend runs (Render, Fly, local `.env`):

```
DATABASE_URL=postgresql://postgres.[project-ref]:[PASSWORD]@....pooler.supabase.com:5432/postgres
SECRET_KEY=<random 32+ byte string>
GOOGLE_CLIENT_ID=<your OAuth client id>
ADMIN_EMAILS=you@andrew.cmu.edu
FRONTEND_ORIGIN=https://adicmu.github.io,http://localhost:8765
ALLOWED_EMAIL_DOMAIN=andrew.cmu.edu
```

On first boot, `db.create_all()` plus `backend/migrate.py` create and upgrade the `users` table automatically.

## 4. Verify tables in Supabase

After the backend starts once:

**Table Editor → `users`**

You should see columns: `id`, `email`, `name`, `role`, `primary_program`, `minor_code`, `is_admin`, `profile_completed`, `last_login`, etc.

Sign in through the app once; a row should appear for your andrew email.

## 5. Seed faculty so they skip onboarding

Copy the example file:

```bash
cp backend/seed_users.example.json backend/seed_users.json
```

Edit emails/roles/programs, then set:

```
SEED_USERS_PATH=backend/seed_users.json
```

Or insert rows directly in Supabase Table Editor with `profile_completed = true` and the correct `role` / `primary_program`.

## 6. Render + Supabase (instead of Render Postgres)

In `backend/render.yaml`, remove the `databases:` block and set `DATABASE_URL` manually in the Render dashboard to your Supabase URI. Everything else stays the same.

## 7. Security notes

- Never commit `DATABASE_URL` or `SECRET_KEY` to git.
- Restrict Supabase **Database → Network** if you only deploy from known IPs (optional).
- Row Level Security (RLS) is **not** required for this setup because only the Flask backend connects to Postgres, not the browser.
- Use Supabase backups (paid plans) or periodic `pg_dump` for production.

## 8. Local dev against Supabase (optional)

You can keep local SQLite (`DATABASE_URL=sqlite:///countsfor.db`) for day to day dev and use Supabase only in production. That is the recommended split.
