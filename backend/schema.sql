-- ============================================================
-- CountsFor — Database schema (draft)
-- Target: SQLite for local dev, Postgres for production
-- Drafted 2026-05-26. No backend code lives yet — see README.md.
-- ============================================================

-- ----- Users ------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL,
  email               TEXT    NOT NULL UNIQUE,
  password_hash       TEXT    NOT NULL,             -- bcrypt cost ≥ 12
  role                TEXT    NOT NULL,
  -- Precise sub-role: 'student' | 'professor' | 'area_head'
  -- | 'associate_area_head' | 'advisor' | 'admin'
  primary_program     TEXT,                          -- 'CS','IS','BA','BS','AI','GS','AS', or NULL
  minor_code          TEXT,                          -- student's PRIMARY minor (= first of minor_codes); advisor-minor scope reuses this
  minor_codes         TEXT,                          -- student's minors as a JSON list (up to 3); NULL for non-students
  advisor_scope       TEXT,                          -- 'major'|'minor'|'arts_sciences'|'all_programs'
  department_scope    TEXT,                          -- free text for faculty assignment notes
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (role IN ('student','professor','area_head','associate_area_head','advisor','admin'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ----- Flags ------------------------------------------------
-- Mirrors the frontend `cf_flags` localStorage schema for 1:1 import.
CREATE TABLE IF NOT EXISTS flags (
  id                  TEXT    PRIMARY KEY,           -- 'flg-<base36 ts>-<rand>'
  course_code         TEXT    NOT NULL,
  course_name         TEXT    NOT NULL,
  reason_code         TEXT    NOT NULL,
  -- one of: gened_not_counting, not_offered, campus_wrong, metadata_outdated,
  -- prereq_wrong, requirement_mismatch, should_be_equivalent, wrong_semester,
  -- restrictions_missing, duplicate, other
  reason_label        TEXT    NOT NULL,              -- human-readable copy at submit time
  notes               TEXT,                          -- optional context
  submitted_by_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_by_name   TEXT,                          -- snapshot at submit time (for deleted accounts)
  submitted_by_email  TEXT,
  submitted_by_role   TEXT    NOT NULL,
  submitted_program   TEXT,                          -- snapshot of primary_program at submit
  submitted_minor     TEXT,                          -- snapshot of minor_code at submit
  status              TEXT    NOT NULL DEFAULT 'pending',
  -- pending → reviewed → resolved | dismissed
  admin_notes         TEXT,                          -- filled by admin during review
  resolved_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (status IN ('pending','reviewed','resolved','dismissed'))
);
CREATE INDEX IF NOT EXISTS idx_flags_course  ON flags(course_code);
CREATE INDEX IF NOT EXISTS idx_flags_status  ON flags(status);
CREATE INDEX IF NOT EXISTS idx_flags_user    ON flags(submitted_by_id);

-- ----- Wishlist items ---------------------------------------
CREATE TABLE IF NOT EXISTS wishlist_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code  TEXT    NOT NULL,
  added_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, course_code)  -- prevents duplicate saves
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items(user_id);

-- ----- Sessions (Flask-Login uses signed cookies, but keep an
--                option for server-side session rows) --------
-- Skipped: Flask-Login + a secret-rotated cookie is sufficient v1.
-- Add a sessions table later only if we want forced-logout / device list.
