# Deploy checklist — Hind (Render + GitHub Pages)

Repo: [github.com/Hindjendara/Countsfor-Summer-26](https://github.com/Hindjendara/Countsfor-Summer-26)  
Admin email: `hjendara@andrew.cmu.edu`  
Front end URL: **https://hindjendara.github.io/Countsfor-Summer-26/**

---

## Part A — Render backend (do this first)

You are already signed in to Render. Connect the GitHub repo:

1. [Render Dashboard](https://dashboard.render.com) → **New +** → **Blueprint**.
2. Connect GitHub if prompted → select **`Hindjendara/Countsfor-Summer-26`**.
3. Render reads `backend/render.yaml`. Click **Apply**.
4. Wait until both services show **Live**:
   - `countsfor-backend` (web)
   - `countsfor-db` (Postgres)

5. Open **`countsfor-backend`** → **Environment**. Set only this if missing:

   | Key | Value |
   |-----|--------|
   | `GOOGLE_CLIENT_ID` | `378923997481-bgnvhg3gsgka5ptijjjsb80q4k7kc2vg.apps.googleusercontent.com` |

   (`ADMIN_EMAILS`, `FRONTEND_ORIGIN`, `DATABASE_URL`, `SECRET_KEY` are already set from the blueprint.)

6. **Manual Deploy → Deploy latest commit** if you changed env vars.

7. Copy your backend URL from the Render service page (top right). Test:

   ```
   https://YOUR-SERVICE.onrender.com/health
   ```

   Expected: `{"status":"ok"}`

8. In **`index.html`**, set (commit + push):

   ```html
   <meta name="cf-backend-url" content="https://YOUR-SERVICE.onrender.com" />
   ```

---

## Part B — Google OAuth origins

In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), edit the OAuth client used by CountsFor.

**Authorized JavaScript origins** must include exactly:

- `http://localhost:8765`
- `https://hindjendara.github.io`

Save. No redirect URIs needed (popup flow).

---

## Part C — GitHub Pages front end

1. Open [github.com/Hindjendara/Countsfor-Summer-26/settings/pages](https://github.com/Hindjendara/Countsfor-Summer-26/settings/pages).
2. **Build and deployment → Source:** **GitHub Actions**.
3. Push your latest code to `main` (including `cf-backend-url` filled in).
4. **Actions** tab → run **Deploy frontend to GitHub Pages** if it did not start automatically.
5. When done, open: **https://hindjendara.github.io/Countsfor-Summer-26/**

You should see **Sign in with Google**, not the old demo-only flow.

---

## Part D — Verify as admin

Sign in with **hjendara@andrew.cmu.edu**:

- [ ] Login screen appears (not demo mode)
- [ ] After first sign in you are **admin** (from `ADMIN_EMAILS`)
- [ ] Navbar shows **Flag review** and **Users**
- [ ] Sign out → login screen again
- [ ] Sign in again → no repeated onboarding if profile is complete

In Render → **countsfor-db** → connect or use dashboard to confirm a row in **`users`** for your email.

---

## Part E — Seed faculty (optional)

So professors skip onboarding on first login:

```bash
cp backend/seed_users.example.json backend/seed_users.json
```

Add entries with real andrew emails, commit, push. Render already sets `SEED_USERS_PATH=backend/seed_users.json`.

---

## If something breaks

| Symptom | Fix |
|---------|-----|
| Demo mode / no login | Empty `cf-backend-url` or backend asleep. Wait 30s and refresh. |
| Sign-in failed | `GOOGLE_CLIENT_ID` on Render must match `index.html`. |
| CORS error | `FRONTEND_ORIGIN` must include `https://hindjendara.github.io` (already in render.yaml). |
| Not admin | Sign out and back in after deploy; email must be `hjendara@andrew.cmu.edu`. |

---

## Free tier notes

- Render web service **sleeps after 15 min idle**; first hit may take ~30 seconds.
- Render Postgres **free tier expires after 90 days**; upgrade or export before then.
