# Backend API Contract (draft)

This document is the agreement between the **frontend** (static, deployed to
GitHub Pages) and the **future Python backend** (see `backend/`). The frontend
is built to migrate cleanly to this contract — when the backend ships, only
the `API_BASE` constant in `js/api.js` needs to change.

**Status**: design-only. Auth + persistence are deferred per the May 26
meeting. Implement these endpoints in order: auth → wishlist → flags → admin
review.

All endpoints are JSON over HTTPS. Use signed-cookie sessions (Flask-Login).
CSRF: use the double-submit cookie pattern, or rely on `SameSite=Lax` for v1.

## Conventions

- Errors: `{ "error": "<code>", "message": "<human>" }`, HTTP 4xx/5xx.
- Timestamps: ISO-8601 UTC strings (e.g. `"2026-05-26T13:45:12Z"`).
- The session user is always implicit from the cookie — never accepted in a
  request body for authorization decisions.

---

## 1. Auth

### `POST /api/auth/signup`

Public. Creates a user.

**Request**

```json
{
  "name": "Houda Bouamor",
  "email": "houda@andrew.cmu.edu",
  "password": "…",
  "role": "associate_area_head",
  "primary_program": "IS",
  "minor_code": null,
  "advisor_scope": null,
  "department_scope": "IS at CMU-Q"
}
```

**Response** `201`

```json
{ "id": 42, "name": "…", "email": "…", "role": "associate_area_head", "primary_program": "IS" }
```

Server validates `role` ∈ frontend's `VALID_ROLES`. Returns `409` on duplicate
email; `400` on missing fields.

### `POST /api/auth/login`

```json
{ "email": "…", "password": "…" }
```

Sets the session cookie. Returns the same user object as signup.

### `POST /api/auth/logout`

Empty body. Clears the session.

### `GET /api/me`

Returns the logged-in user, or `401` if not signed in. The frontend calls this
on every page load to drive routing (replaces the current `loadProfile()`
localStorage lookup).

---

## 2. Wishlist (students)

### `GET /api/wishlist`

Returns the current student's saved course codes.

```json
{ "items": [ { "course_code": "15-122", "added_at": "2026-05-26T13:45:12Z" } ] }
```

`403` for non-students.

### `POST /api/wishlist`

```json
{ "course_code": "15-122" }
```

Idempotent — re-saving an existing course is a no-op (the schema has a
`UNIQUE(user_id, course_code)` constraint).

### `DELETE /api/wishlist/:course_code`

Removes the entry. `204` on success, `404` if it wasn't saved.

---

## 3. Flags (faculty + admin)

### `POST /api/flags`

Faculty-only. Mirrors the in-browser localStorage shape exactly (see
`schema.sql`):

```json
{
  "course_code": "15-122",
  "course_name": "Principles of Imperative Computation",
  "reason_code": "metadata_outdated",
  "reason_label": "Course title, number, or units are outdated",
  "notes": "Units changed from 10 to 12 in Spring 2025."
}
```

Server snapshots the user's name/email/role/program at submit time so the
record stays self-contained if the user is later deleted. Returns `201` with
the saved flag.

### `GET /api/flags` (admin)

```
GET /api/flags?status=pending&course=15-122&page=1&limit=20
```

Returns paged flags with submitter snapshots. `403` for non-admins.

### `PATCH /api/flags/:id` (admin)

Update status and admin notes.

```json
{ "status": "resolved", "admin_notes": "Corrected in courses.json — see PR #123." }
```

---

## 4. Role-check semantics

The backend's `@require_role(...)` decorator must accept either:

- A single role (e.g. `@require_role('admin')`)
- A set (e.g. `@require_role({'professor', 'area_head', 'associate_area_head', 'advisor', 'admin'})`)

The frontend's `isFaculty()` helper (`js/profile.js`) is the canonical
mapping — keep this list in sync.

---

## 5. Out of scope (v1)

- OAuth / Andrew SSO — leave a clean integration point in `auth.py` but ship
  email+password first.
- Real-time updates — page reload is sufficient.
- Admin user-management UI — the schema supports it, but flags-review is
  the priority surface.
