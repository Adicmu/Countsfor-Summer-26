// ============================================================
// CountsFor — Main Application (Progressive Disclosure)
// ============================================================

const App = {
  // State
  courses: [],
  courseIndex: {},
  trees: {},          // { CS: tree, IS: tree, BA: tree, BS: tree }
  treeSections: {},   // { CS: { degree, gened }, ... }

  layoutMode: 'focused', // 'focused' | 'split'
  activeMajor: 'CS',
  selectedCourse: null,
  treeSearchQuery: '',
  locationFilter: 'all', // 'all' | 'qatar' | 'pittsburgh'
  activeSemester: 'F26',
  modalityFilter: 'all', // 'all' | 'in_person' | 'remote' | 'hybrid'
  minorCourseList: {},
  theme: loadStore('cf_theme', 'light'),
  expandedNodes: new Set(),
  highlightedPath: null,
  mobileLens: 'lookup', // 'lookup' | 'map'

  profile: null,

  // ── Init ──────────────────────────────────────────────────
  // Auth-aware boot:
  //   1. GET /api/me — if 200 with a complete profile, route to main app.
  //   2. If 200 but profile is incomplete (missing role/program), show the
  //      existing onboarding flow but PATCH /api/me on completion.
  //   3. If 401, render the login screen.
  //   4. If the backend is unreachable, fall back to localStorage demo mode
  //      so the GH-Pages-only deploy keeps working.
  authedUser: null,
  authMode: 'demo',
  authView: 'signin',
  resetEmail: '',
  resetToken: '',
  serverFlags: [],
  async init() {
    this.applyTheme();

    const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    const resetTok = params.get('token') || params.get('reset') || '';
    if (resetTok) {
      const qs = params.get('token')
        ? `token=${encodeURIComponent(resetTok)}`
        : `reset=${encodeURIComponent(resetTok)}`;
      location.href = `index.html?${qs}`;
      return;
    }

    const me = await apiGetMe();
    if (me.ok) {
      this._afterSignIn(me.data);
      return;
    }

    if (me.status === 0) {
      if (isBackendConfigured()) {
        location.href = 'index.html';
        return;
      }
      // No backend configured — demo mode preserves the public GH-Pages experience.
      this.authMode = 'demo';
      this.profile = loadProfile();
      if (!this.profile) {
        this.renderOnboarding(false);
        return;
      }
      this._afterAuthed();
      return;
    }

    // 401 / 403 / etc. — send to Heritage landing for sign-in.
    if (isBackendConfigured()) {
      location.href = 'index.html';
      return;
    }

    this.authMode = 'demo';
    this.profile = loadProfile();
    if (!this.profile) {
      this.renderOnboarding(false);
      return;
    }
    this._afterAuthed();
  },

  _afterAuthed() {
    if (this.profile && this.profile.primary && this.profile.primary !== 'AS') {
      this.activeMajor = this.profile.primary;
    }
    this.renderShell();
    this.bindGlobalEvents();
    // Best-effort one-time migration of localStorage data (idempotent on the
    // server — duplicate IDs / course codes return existing rows).
    this._syncLocalToServer();
    this.loadData();
  },

  // Push any local-only flags / wishlist entries to the backend after sign-in.
  // The server endpoints are idempotent so re-running this is safe.
  async _syncLocalToServer() {
    if (this.authMode !== 'authed' || !this.authedUser) return;
    const roleGroup = this.authedUser.role_group
      || (this.authedUser.role === 'student' ? 'student' : 'faculty');
    const role = this.authedUser.role;
    const synced = loadStore('cf_synced', false);

    // Flags — faculty / admin only (server assigns role_group; never trust client storage)
    if (roleGroup === 'faculty' && role !== 'student' && !synced) {
      const flags = this._getFlags();
      for (const f of flags) {
        const r = await apiCreateFlag(f);
        if (!r.ok && r.status !== 200 && r.status !== 201) {
          // Keep the local copy and bail — don't mark synced.
          return;
        }
      }
    }

    // Wishlist — student only
    if (roleGroup === 'student' && role === 'student' && !synced) {
      const items = this._getWishlistItems();
      for (const item of items) {
        await apiAddWishlist(item.course_code, item.note);
      }
      // Pull the canonical server list back so future renders reflect any
      // additions from another device.
      const r = await apiGetWishlist();
      if (r.ok && Array.isArray(r.data.items)) {
        this._saveWishlistItems(r.data.items.map(i => ({
          course_code: i.course_code,
          note: i.note || '',
        })));
      }
    }

    if (this.authMode === 'authed') {
      await this._loadServerFlags();
    }

    saveStore('cf_synced', true);
  },

  async _loadServerFlags() {
    if (this.authMode !== 'authed') return;
    const r = await apiListFlags('limit=200');
    if (r.ok && Array.isArray(r.data.items)) {
      this.serverFlags = r.data.items;
    }
  },

  _needsOnboarding(u) {
    if (!u || !u.role) return true;
    if (!u.profile_completed) return true;
    if (getRoleGroup(u) === 'student' && !u.primary_program) return true;
    if (getRoleGroup(u) !== 'student' && (!u.department || !u.primary_program)) return true;
    return false;
  },

  _serverProfileIsComplete(u) {
    return !this._needsOnboarding(u);
  },

  _hydrateProfileFromServer(u) {
    // Mirror the server user into the legacy `this.profile` shape so the
    // rest of the app keeps working unchanged.
    if (!u) { this.profile = null; return; }
    const scope = u.advisor_scope || null;
    let primary = u.primary_program || null;
    let secondary = null;
    let secondaries = Array.isArray(u.minor_codes) ? u.minor_codes.filter(Boolean) : [];
    if (!secondaries.length && u.minor_code) secondaries = [u.minor_code];
    secondary = secondaries[0] || null;
    // Advisor-minor scope stores the minor code in `primary` (per profile.js).
    if (u.role === 'advisor' && scope === 'minor' && u.minor_code) {
      primary = u.minor_code;
      secondary = null;
      secondaries = [];
    }
    this.profile = {
      role: u.role,
      primary,
      secondary,
      secondaries,
      scope,
    };
    // Server is source of truth in authed mode — keep localStorage aligned.
    if (this.authMode === 'authed' && u.profile_completed && validateProfile(this.profile)) {
      try { saveProfile(this.profile); } catch {}
    }
  },

  // ── Theme ─────────────────────────────────────────────────
  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme);
    const btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = this.theme === 'dark' ? '☀️' : '🌙';
  },
  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    saveStore('cf_theme', this.theme);
    this.applyTheme();
  },

  // ── Data Loading ──────────────────────────────────────────
  async loadData() {
    const body = document.getElementById('leftBody');
    const rBody = document.getElementById('rightBody');
    if (body) body.innerHTML = '<div class="empty-state"><div class="spinner"></div><div class="empty-text" style="margin-top:12px">Loading 1,700+ courses…</div></div>';
    if (rBody) rBody.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

    try {
      this.courses = await fetchAllCourses();
      this.courseIndex = buildCourseIndex(this.courses);
      try {
        this.minorCourseList = await fetchMinorCourses();
      } catch {
        this.minorCourseList = {};
      }

      // Profile-aware annotations
      annotateDoubleCounters(this.courses, this.profile, this.minorCourseList);
      annotateMultiProgram(this.courses);

      // Build trees for each major
      for (const m of MAJOR_ORDER) {
        const raw = buildRequirementTree(this.courses, m);
        this.trees[m] = normalizeTree(raw, m, 0);
        this.treeSections[m] = splitTreeSections(this.trees[m], m);
      }

      // Auto-expand first level of the default major
      this.autoExpandFirstLevel(this.activeMajor);

      this.renderLeftEmpty();
      this.renderTree();
    } catch (err) {
      console.error(err);
      if (body) body.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">Failed to load data: ${esc(err.message)}</div></div>`;
    }
  },

  autoExpandFirstLevel(major) {
    const sections = this.treeSections[major];
    if (!sections) return;
    for (const node of [...sections.degree, ...sections.gened]) {
      this.expandedNodes.add(major + '::' + node.path);
    }
  },

  // ══════════════════════════════════════════════════════════
  // ONBOARDING
  // ══════════════════════════════════════════════════════════

  _onboardingState: {
    role: null,
    roleGroup: null,
    facultyGroup: null,
    scope: null,
    primary: null,
    secondary: null,
    secondaries: [],
    isEdit: false,
  },

  renderOnboarding(isEdit) {
    // Self-service onboarding is STUDENT-ONLY. Faculty/staff roles come from
    // the seed file or an admin (users.py), never self-selection — so a
    // student can't claim to be faculty. Rostered/seeded faculty and admins
    // arrive with a complete profile and skip this screen entirely; editRole()
    // also blocks them.
    const p = this.profile;
    const keepStudent = !!(p && p.role === 'student');
    this._onboardingState = {
      role:         'student',
      roleGroup:    'student',
      facultyGroup: null,
      scope:        null,
      primary:      keepStudent ? p.primary : null,
      secondary:    keepStudent ? (getProfileMinors(p)[0] || null) : null,
      secondaries:  keepStudent ? getProfileMinors(p) : [],
      isEdit: !!isEdit,
    };
    this._renderOnboardingScreen();
  },

  _renderOnboardingScreen() {
    const s = this._onboardingState;

    // Self-service onboarding is student-only (see renderOnboarding): always
    // show the major picker, and the minor picker once a major is chosen.
    const majorSel       = (m) => s.primary === m ? 'selected' : '';

    const showMajorPicker = true;
    const showASOption    = false;             // students never pick Arts & Sciences
    const showMinorSelect = !!s.primary;

    // Validation — drives Continue button enablement.
    const candidate = {
      role: s.role,
      primary: s.primary,
      secondary: s.secondaries[0] || null,
      secondaries: s.roleGroup === 'student' ? s.secondaries : [],
      scope: s.scope,
    };
    const valid = !!s.role && validateProfile(candidate);

    const cancelHtml = s.isEdit
      ? '<button class="onboarding-cancel" onclick="App._cancelOnboarding()">Cancel</button>'
      : '';

    const majorBtns = MAJOR_LIST.map(p => {
      const pending = isProgramDataPending(p) ? '<span class="ob-pill-pending">data soon</span>' : '';
      return `<button class="ob-pill ${majorSel(p)}" onclick="App._obPickMajor('${p}')">${p}${pending}<span class="ob-pill-sub">${this._programFullName(p)}</span></button>`;
    }).join('');

    let asOptionHtml = '';
    if (showASOption) {
      const isASSelected = s.primary === 'AS';
      asOptionHtml = `<button class="ob-pill ob-pill-wide ${isASSelected ? 'selected' : ''}" onclick="App._obPickMajor('AS')">Arts &amp; Sciences<span class="ob-pill-sub">Cross-program grouping</span></button>`;
    }

    // Minor(s) — multi-add for students; single select for advisor-minor scope
    const studentMinors = s.secondaries || [];
    const minorPickOptions = MINOR_LIST.filter(m => {
      if (s.roleGroup !== 'student') return true;
      if (MAJOR_TO_MINOR_CODE[s.primary] === m.code) return false;
      return !studentMinors.includes(m.code);
    }).map(m => `<option value="${m.code}">${esc(m.label)}</option>`).join('');

    const minorChips = studentMinors.map(mc => `
      <span class="ob-minor-chip">${esc(getMinorLabel(mc))}
        <button type="button" class="ob-minor-chip-x" aria-label="Remove minor" onclick="App._obRemoveMinor('${mc}')">×</button>
      </span>`).join('');

    const advisorMinorOptions = MINOR_LIST.map(m => {
      const sel = s.primary === m.code ? 'selected' : '';
      return `<option value="${m.code}" ${sel}>${esc(m.label)}</option>`;
    }).join('');

    const majorLabel = 'MAJORING IN';

    document.getElementById('app').innerHTML = `
      <div class="auth-page auth-page-compact">
        <main class="auth-page-main auth-page-main--solo">
          <div class="auth-page-card">
            <div class="auth-panel-head">
              <p class="auth-panel-eyebrow">Almost there</p>
              <h2 class="auth-panel-title">Your major &amp; minor</h2>
              <p class="auth-panel-lead">We'll show you the courses that matter for your degree.</p>
            </div>

      ${showMajorPicker ? `
        <div class="ob-section">
          <div class="ob-section-label">${majorLabel}</div>
          <div class="ob-row-majors">${majorBtns}</div>
          ${asOptionHtml}
        </div>
      ` : ''}

      ${showMinorSelect && s.roleGroup === 'student' ? `
        <div class="ob-section">
          <div class="ob-section-label">MINOR(S) <span class="ob-optional">— optional</span></div>
          ${minorChips ? `<div class="ob-minor-chips">${minorChips}</div>` : ''}
          <div class="ob-select-wrap ob-minor-add-row">
            <select class="ob-select" id="obMinorPick" onchange="App._obAddMinor(this.value); this.value='';">
              <option value="">Add a minor…</option>
              ${minorPickOptions}
            </select>
          </div>
        </div>
      ` : ''}

      ${showMinorSelect && s.roleGroup !== 'student' ? `
        <div class="ob-section">
          <div class="ob-section-label">WHICH MINOR</div>
          <div class="ob-select-wrap">
            <select class="ob-select" onchange="App._obPickMinor(this.value)">
              <option value="" ${!s.primary ? 'selected' : ''}>— Choose a minor —</option>
              ${advisorMinorOptions}
            </select>
          </div>
        </div>
      ` : ''}

      <button class="onboarding-continue auth-submit" ${valid ? '' : 'disabled'} onclick="App._finishOnboarding()">Continue →</button>
          </div>
        </main>
        ${cancelHtml}
      </div>`;
  },

  _programFullName(p) {
    return PROGRAM_FULL_NAME[p] || p;
  },

  _majorSectionLabel(role) {
    if (role === 'professor') return 'I TEACH IN';
    if (role === 'student')   return 'MAJORING IN';
    if (role === 'advisor')   return 'I ADVISE STUDENTS IN';
    if (role === 'area_head' || role === 'associate_area_head') return 'I OVERSEE';
    return 'PROGRAM';
  },

  _obPickRoleGroup(group) {
    const s = this._onboardingState;
    const prev = s.roleGroup;
    s.roleGroup = group;
    if (group === 'student') {
      s.role = 'student';
      s.facultyGroup = null;
      s.scope = null;
    } else if (group !== prev) {
      // Entering faculty: clear sub-state so user picks intentionally.
      s.facultyGroup = null;
      s.role = null;
      s.scope = null;
    }
    if (group !== prev) {
      s.primary = null;
      s.secondary = null;
      s.secondaries = [];
    }
    this._renderOnboardingScreen();
  },

  _obPickFacultyGroup(group) {
    const s = this._onboardingState;
    const prev = s.facultyGroup;
    s.facultyGroup = group;
    if (group !== prev) {
      s.primary = null;
      s.secondary = null;
      s.secondaries = [];
      s.scope = null;
      // Set the precise role for groups that don't need a sub-pick.
      if (group === 'professor')      s.role = 'professor';
      else if (group === 'advisor')   s.role = 'advisor';
      else if (group === 'area_lead') s.role = 'area_head';   // default subrole
      else                            s.role = null;
    }
    this._renderOnboardingScreen();
  },

  _obPickSubrole(role) {
    this._onboardingState.role = role;
    this._renderOnboardingScreen();
  },

  _obPickScope(scope) {
    const s = this._onboardingState;
    s.scope = scope;
    s.primary = null;
    s.secondary = null;
    s.secondaries = [];
    this._renderOnboardingScreen();
  },

  _obPickMajor(program) {
    const s = this._onboardingState;
    s.primary = program;
    if (s.roleGroup === 'student') {
      const blocked = MAJOR_TO_MINOR_CODE[s.primary];
      s.secondaries = (s.secondaries || []).filter(mc => mc !== blocked);
      s.secondary = s.secondaries[0] || null;
    }
    this._renderOnboardingScreen();
  },

  _obAddMinor(code) {
    const s = this._onboardingState;
    if (!code || s.roleGroup !== 'student') return;
    if (MAJOR_TO_MINOR_CODE[s.primary] === code) return;
    s.secondaries = s.secondaries || [];
    if (s.secondaries.includes(code)) return;
    s.secondaries.push(code);
    s.secondary = s.secondaries[0] || null;
    this._renderOnboardingScreen();
  },

  _obRemoveMinor(code) {
    const s = this._onboardingState;
    s.secondaries = (s.secondaries || []).filter(mc => mc !== code);
    s.secondary = s.secondaries[0] || null;
    this._renderOnboardingScreen();
  },

  _obPickMinor(value) {
    const s = this._onboardingState;
    const v = value || null;
    if (s.roleGroup === 'student') {
      s.secondary = v;
    } else if (s.facultyGroup === 'advisor' && s.scope === 'minor') {
      // For advisor-minor scope, the minor code lives in `primary` (schema reuse).
      s.primary = v;
    }
    this._renderOnboardingScreen();
  },

  async _finishOnboarding() {
    const s = this._onboardingState;
    const minors = s.roleGroup === 'student' ? (s.secondaries || []) : [];
    const profile = {
      role:      s.role,
      primary:   s.primary,
      secondary: minors[0] || null,
      secondaries: minors,
      scope:     s.role === 'advisor' ? s.scope : null,
    };
    if (!validateProfile(profile)) {
      console.error('invalid profile, refusing to save', profile);
      return;
    }
    saveProfile(profile);

    // If signed in, persist to the backend too (source of truth in authed mode).
    if (this.authMode === 'authed') {
      // Map onboarding state → server schema. Advisor-minor stores minor in
      // `primary` locally; on the server we keep them in separate columns.
      const serverPatch = { role: profile.role };
      if (profile.role === 'advisor' && profile.scope === 'minor') {
        serverPatch.advisor_scope = 'minor';
        serverPatch.minor_code = profile.primary;
        serverPatch.primary_program = null;
      } else if (profile.role === 'advisor') {
        serverPatch.advisor_scope = profile.scope;
        serverPatch.primary_program = profile.primary;
        serverPatch.minor_code = null;
      } else if (profile.role === 'student') {
        serverPatch.primary_program = profile.primary;
        serverPatch.minor_codes = getProfileMinors(profile);
        serverPatch.minor_code = null;
        serverPatch.advisor_scope = null;
      } else {
        serverPatch.primary_program = profile.primary;
        serverPatch.minor_code = null;
        serverPatch.advisor_scope = null;
      }
      // Admin role is env-driven — store program context without changing role.
      if (this.authedUser && this.authedUser.role === 'admin') {
        delete serverPatch.role;
      }
      const r = await apiPatchMe(serverPatch);
      if (!r.ok) {
        showToast('Could not save profile to the server — using local copy.');
      } else {
        this.authedUser = r.data;
        this._hydrateProfileFromServer(r.data);
      }
    }

    const wasEdit = s.isEdit;
    this.profile = profile;
    if (this.profile.primary && this.profile.primary !== 'AS' && MAJOR_LIST.includes(this.profile.primary)) {
      this.activeMajor = this.profile.primary;
    }

    this.renderShell();
    this.bindGlobalEvents();

    if (wasEdit) {
      annotateDoubleCounters(this.courses, this.profile, this.minorCourseList);
      this.renderLeftEmpty();
      this.renderTree();
    } else {
      this.loadData();
    }
  },

  // ══════════════════════════════════════════════════════════
  // AUTH LANDING — Scotty hero + sign in / register
  // ══════════════════════════════════════════════════════════

  _isAndrewEmail(raw) {
    const e = (raw || '').trim().toLowerCase();
    return /^[^\s@]+@andrew\.cmu\.edu$/.test(e);
  },

  _isCmuEmail(raw) {
    const e = (raw || '').trim().toLowerCase();
    return /^[^\s@]+@(andrew\.cmu\.edu|cmu\.edu|qatar\.cmu\.edu)$/.test(e);
  },

  _renderAuthPage(panelHtml) {
    return `
      <div class="auth-page">
        <aside class="auth-page-visual" aria-hidden="true">
          <div class="auth-page-visual-inner">
            <div class="auth-scotty-wrap">
              <div class="auth-scotty-badge">
                <img class="auth-scotty-hero" src="assets/img/scotty-head.png" alt="" />
              </div>
            </div>
            <div class="auth-visual-copy">
              <p class="auth-visual-eyebrow">CMU-Q Curriculum Explorer</p>
              <h1 class="auth-visual-title">CountsFor</h1>
              <p class="auth-visual-tagline">See what every course counts for across CS, IS, Business, and Biological Sciences.</p>
              <ul class="auth-visual-features">
                <li>Sign in with your <strong>@andrew.cmu.edu</strong> email</li>
                <li>Faculty are recognized automatically from our directory</li>
                <li>Students pick a major once, then explore</li>
              </ul>
            </div>
          </div>
        </aside>
        <main class="auth-page-main">
          <div class="auth-page-card">
            ${panelHtml}
            <div class="auth-page-footer">
              <img src="assets/img/cmuq-wordmark.png" alt="Carnegie Mellon University in Qatar" />
            </div>
          </div>
        </main>
      </div>`;
  },

  _authPasswordField(id, label, opts = {}) {
    const hint = opts.hint
      ? `<p class="auth-field-msg is-hint" id="${id}Hint">${esc(opts.hint)}</p>`
      : '';
    return `
      <div class="auth-field-group">
        <label class="auth-label" for="${id}">${label}</label>
        <div class="auth-field">
          <input class="auth-input" id="${id}" type="password" autocomplete="${opts.autocomplete || 'new-password'}" minlength="${opts.minlength || 8}" required />
          <button type="button" class="auth-pass-toggle" aria-label="Show password" onclick="App._togglePassword('${id}', this)">Show</button>
        </div>
        ${hint}
        <p class="auth-field-msg" id="${id}Msg" role="alert"></p>
      </div>`;
  },

  _authEmailField(id, label) {
    return `
      <div class="auth-field-group">
        <label class="auth-label" for="${id}">${label}</label>
        <input class="auth-input" id="${id}" type="email" autocomplete="email" placeholder="you@andrew.cmu.edu" required />
        <p class="auth-field-msg" id="${id}Msg" role="alert"></p>
      </div>`;
  },

  _setFieldMsg(inputId, msgId, text, kind) {
    const input = document.getElementById(inputId);
    const msg = document.getElementById(msgId);
    if (msg) {
      msg.textContent = text || '';
      msg.className = 'auth-field-msg' + (kind ? ` is-${kind}` : '');
    }
    if (input) {
      input.classList.toggle('is-invalid', kind === 'error');
      input.classList.toggle('is-valid', kind === 'ok');
    }
  },

  _clearFieldMsg(inputId, msgId) {
    this._setFieldMsg(inputId, msgId, '', '');
  },

  _validateAndrewField(inputId, msgId) {
    const el = document.getElementById(inputId);
    if (!el) return true;
    const val = (el.value || '').trim();
    if (!val) {
      this._clearFieldMsg(inputId, msgId);
      return false;
    }
    if (!this._isAndrewEmail(val)) {
      this._setFieldMsg(inputId, msgId, 'Use your @andrew.cmu.edu email address.', 'error');
      return false;
    }
    this._clearFieldMsg(inputId, msgId);
    return true;
  },

  _validatePasswordMatch(passId, confirmId, msgId) {
    const pass = document.getElementById(passId)?.value || '';
    const confirm = document.getElementById(confirmId)?.value || '';
    if (!confirm) {
      this._clearFieldMsg(confirmId, msgId);
      return false;
    }
    if (pass !== confirm) {
      this._setFieldMsg(confirmId, msgId, 'Passwords do not match.', 'error');
      return false;
    }
    this._setFieldMsg(confirmId, msgId, 'Passwords match.', 'ok');
    return true;
  },

  _togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  },

  _setAuthFormError(text) {
    const box = document.getElementById('cfAuthFormError');
    if (!box) return;
    if (text) {
      box.textContent = text;
      box.hidden = false;
    } else {
      box.textContent = '';
      box.hidden = true;
    }
  },

  _setAuthLoading(loading, idleLabel) {
    const btn = document.getElementById('cfAuthSubmit');
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    if (loading) {
      btn.disabled = true;
      btn.innerHTML = `<span class="auth-submit-spinner" aria-hidden="true"></span><span>${idleLabel.replace(' →', '…')}</span>`;
    } else {
      btn.textContent = idleLabel;
      this._updateAuthSubmitState(this.authView);
    }
  },

  _updateAuthSubmitState(view) {
    const btn = document.getElementById('cfAuthSubmit');
    if (!btn) return;
    let ready = false;
    if (view === 'signin') {
      const email = (document.getElementById('cfLoginEmail')?.value || '').trim();
      const pass = document.getElementById('cfLoginPass')?.value || '';
      const emailOk = this._isAndrewEmail(email);
      ready = emailOk && pass.length > 0;
      if (email && !emailOk) this._validateAndrewField('cfLoginEmail', 'cfLoginEmailMsg');
    } else if (view === 'register') {
      const email = (document.getElementById('cfRegEmail')?.value || '').trim();
      const pass = document.getElementById('cfRegPass')?.value || '';
      const confirm = document.getElementById('cfRegPass2')?.value || '';
      const emailOk = this._isAndrewEmail(email);
      const passOk = pass.length >= 8;
      const matchOk = passOk && confirm.length > 0 && pass === confirm;
      ready = emailOk && passOk && matchOk;
      if (email && !emailOk) this._validateAndrewField('cfRegEmail', 'cfRegEmailMsg');
      if (confirm) this._validatePasswordMatch('cfRegPass', 'cfRegPass2', 'cfRegPass2Msg');
    } else if (view === 'forgot') {
      const email = (document.getElementById('cfForgotEmail')?.value || '').trim();
      ready = this._isAndrewEmail(email);
    } else if (view === 'reset') {
      const pass = document.getElementById('cfResetPass')?.value || '';
      const confirm = document.getElementById('cfResetPass2')?.value || '';
      ready = pass.length >= 8 && pass === confirm;
    }
    btn.dataset.empty = ready ? '0' : '1';
    btn.disabled = !ready || btn.classList.contains('is-loading');
  },

  _bindAuthForm(view) {
    const onInput = () => this._updateAuthSubmitState(view);
    const ids = {
      signin: ['cfLoginEmail', 'cfLoginPass'],
      register: ['cfRegName', 'cfRegEmail', 'cfRegPass', 'cfRegPass2'],
      forgot: ['cfForgotEmail'],
      reset: ['cfResetPass', 'cfResetPass2'],
    }[view] || [];

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', onInput);
      el.addEventListener('blur', () => {
        if (id === 'cfLoginEmail' || id === 'cfRegEmail' || id === 'cfForgotEmail') {
          this._validateAndrewField(id, id + 'Msg');
        }
        if (id === 'cfRegPass2' || id === 'cfResetPass2') {
          const passId = view === 'reset' ? 'cfResetPass' : 'cfRegPass';
          this._validatePasswordMatch(passId, id, id + 'Msg');
        }
        this._updateAuthSubmitState(view);
      });
    });

    if (view === 'register' || view === 'reset') {
      const passId = view === 'reset' ? 'cfResetPass' : 'cfRegPass';
      const confirmId = view === 'reset' ? 'cfResetPass2' : 'cfRegPass2';
      const passEl = document.getElementById(passId);
      if (passEl) {
        passEl.addEventListener('input', () => {
          const confirm = document.getElementById(confirmId);
          if (confirm && confirm.value) {
            this._validatePasswordMatch(passId, confirmId, confirmId + 'Msg');
          }
          this._updateAuthSubmitState(view);
        });
      }
    }

    this._updateAuthSubmitState(view);
  },

  _authTabsHtml(active) {
    const tab = (id, label) =>
      `<button type="button" class="auth-tab ${active === id ? 'active' : ''}" onclick="App._switchAuthView('${id}')">${label}</button>`;
    if (active === 'forgot' || active === 'reset') return '';
    return `<div class="auth-tabs">${tab('signin', 'Sign in')}${tab('register', 'Create account')}</div>`;
  },

  _switchAuthView(view) {
    this.authView = view;
    this.renderLogin();
  },

  renderLogin(opts = {}) {
    const v = this.authView;
    const backendWarn = opts.backendUnreachable
      ? `<div class="auth-alert">Could not reach the server — wait ~30s and refresh.</div>`
      : '';
    const formError = `<div class="auth-form-error" id="cfAuthFormError" hidden role="alert"></div>`;

    let panel = '';
    if (v === 'register') {
      panel = `
        <div class="auth-card-top">
          ${this._authTabsHtml('register')}
          <div class="auth-panel-head">
            <h2 class="auth-panel-title">Create your account</h2>
            <p class="auth-panel-lead">Use your <strong>@andrew.cmu.edu</strong> email. Faculty in our directory are recognized automatically; everyone else starts as a student.</p>
          </div>
          ${backendWarn}
        </div>
        <div class="auth-form-body">
          <form class="auth-form auth-form--scrollable" onsubmit="App._onRegister(event)">
            ${formError}
            <div class="auth-form-fields">
              <div class="auth-field-group">
                <label class="auth-label" for="cfRegName">Full name</label>
                <input class="auth-input" id="cfRegName" type="text" autocomplete="name" placeholder="Your name" />
              </div>
              ${this._authEmailField('cfRegEmail', 'Andrew email')}
              ${this._authPasswordField('cfRegPass', 'Password', { autocomplete: 'new-password', hint: 'At least 8 characters' })}
              ${this._authPasswordField('cfRegPass2', 'Confirm password', { autocomplete: 'new-password' })}
            </div>
            <div class="auth-form-actions">
              <button type="submit" class="auth-submit" id="cfAuthSubmit" disabled>Create account →</button>
            </div>
          </form>
        </div>`;
    } else if (v === 'forgot') {
      panel = `
        <div class="auth-card-top">
          <div class="auth-panel-head">
            <button type="button" class="auth-back" onclick="App._switchAuthView('signin')">← Back to sign in</button>
            <h2 class="auth-panel-title">Forgot password</h2>
          </div>
          ${backendWarn}
        </div>
        <div class="auth-form-body" id="cfForgotBody">
          <form class="auth-form" onsubmit="App._onForgotPassword(event)">
            ${formError}
            ${this._authEmailField('cfForgotEmail', 'Andrew email')}
            <button type="submit" class="auth-submit" id="cfAuthSubmit" disabled>Send reset link →</button>
          </form>
        </div>`;
    } else if (v === 'reset') {
      panel = `
        <div class="auth-card-top">
          <div class="auth-panel-head">
            <h2 class="auth-panel-title">Set a new password</h2>
            <p class="auth-panel-lead">Choose a new password for <strong>${esc(this.resetEmail || 'your account')}</strong>.</p>
          </div>
        </div>
        <div class="auth-form-body">
          <form class="auth-form" onsubmit="App._onResetPassword(event)">
            ${formError}
            ${this._authPasswordField('cfResetPass', 'New password', { autocomplete: 'new-password', hint: 'At least 8 characters' })}
            ${this._authPasswordField('cfResetPass2', 'Confirm password', { autocomplete: 'new-password' })}
            <button type="submit" class="auth-submit" id="cfAuthSubmit" disabled>Update password →</button>
          </form>
        </div>`;
    } else {
      panel = `
        <div class="auth-card-top">
          ${this._authTabsHtml('signin')}
          <div class="auth-panel-head auth-panel-head--signin">
            <h2 class="auth-panel-title">Welcome back</h2>
          </div>
          ${backendWarn}
        </div>
        <div class="auth-form-body">
          <form class="auth-form" onsubmit="App._onLogin(event)">
            ${formError}
            ${this._authEmailField('cfLoginEmail', 'Andrew email')}
            ${this._authPasswordField('cfLoginPass', 'Password', { autocomplete: 'current-password' })}
            <div class="auth-forgot-row">
              <button type="button" class="auth-link-btn" onclick="App._switchAuthView('forgot')">Forgot password?</button>
            </div>
            <button type="submit" class="auth-submit" id="cfAuthSubmit" disabled>Sign in →</button>
          </form>
        </div>`;
    }

    document.getElementById('app').innerHTML = this._renderAuthPage(panel);
    this._bindAuthForm(v);
    const focusId = v === 'register' ? 'cfRegEmail' : v === 'forgot' ? 'cfForgotEmail' : v === 'reset' ? 'cfResetPass' : 'cfLoginEmail';
    const el = document.getElementById(focusId);
    if (el) el.focus();
  },

  async _onLogin(event) {
    event.preventDefault();
    this._setAuthFormError('');
    const email = (document.getElementById('cfLoginEmail')?.value || '').trim();
    const password = document.getElementById('cfLoginPass')?.value || '';
    if (!this._validateAndrewField('cfLoginEmail', 'cfLoginEmailMsg')) return;
    if (!password) {
      this._setFieldMsg('cfLoginPass', 'cfLoginPassMsg', 'Enter your password.', 'error');
      return;
    }
    this._setAuthLoading(true, 'Sign in →');
    const normalizedEmail = (typeof normalizeCmuEmail === 'function' ? normalizeCmuEmail(email) : null) || email;
    const r = await apiLogin({ email: normalizedEmail, password });
    this._setAuthLoading(false, 'Sign in →');
    if (!r.ok) {
      const msg = (r.data && r.data.message) || 'Email or password is incorrect.';
      if (r.data && r.data.error === 'no_password_set') {
        this._setAuthFormError(msg);
        this._switchAuthView('register');
      } else if (r.status === 401) {
        this._setFieldMsg('cfLoginPass', 'cfLoginPassMsg', msg, 'error');
      } else {
        this._setAuthFormError(msg);
      }
      this._updateAuthSubmitState('signin');
      return;
    }
    this._afterSignIn(r.data);
  },

  async _onRegister(event) {
    event.preventDefault();
    this._setAuthFormError('');
    const name = (document.getElementById('cfRegName')?.value || '').trim();
    const email = (document.getElementById('cfRegEmail')?.value || '').trim();
    const password = document.getElementById('cfRegPass')?.value || '';
    const confirm = document.getElementById('cfRegPass2')?.value || '';
    if (!this._validateAndrewField('cfRegEmail', 'cfRegEmailMsg')) return;
    if (password.length < 8) {
      this._setFieldMsg('cfRegPass', 'cfRegPassMsg', 'Password must be at least 8 characters.', 'error');
      return;
    }
    if (!this._validatePasswordMatch('cfRegPass', 'cfRegPass2', 'cfRegPass2Msg')) return;
    this._setAuthLoading(true, 'Create account →');
    const normalizedEmail = (typeof normalizeCmuEmail === 'function' ? normalizeCmuEmail(email) : null) || email;
    const r = await apiRegister({ email: normalizedEmail, password, confirm_password: confirm, name: name || undefined });
    this._setAuthLoading(false, 'Create account →');
    if (!r.ok) {
      const msg = (r.data && r.data.message) || 'Registration failed.';
      if (r.data && r.data.error === 'email_taken') {
        this._setFieldMsg('cfRegEmail', 'cfRegEmailMsg', msg, 'error');
      } else {
        this._setAuthFormError(msg);
      }
      this._updateAuthSubmitState('register');
      return;
    }
    this._afterSignIn(r.data);
  },

  async _onForgotPassword(event) {
    event.preventDefault();
    this._setAuthFormError('');
    const email = (document.getElementById('cfForgotEmail')?.value || '').trim();
    if (!this._validateAndrewField('cfForgotEmail', 'cfForgotEmailMsg')) return;
    this._setAuthLoading(true, 'Send reset link →');
    const normalizedEmail = (typeof normalizeCmuEmail === 'function' ? normalizeCmuEmail(email) : null) || email;
    const r = await apiForgotPassword(normalizedEmail);
    this._setAuthLoading(false, 'Send reset link →');
    if (!r.ok) {
      this._setAuthFormError((r.data && r.data.message) || 'Request failed.');
      this._updateAuthSubmitState('forgot');
      return;
    }
    const msg = (r.data && r.data.message) || 'If an account exists for that email, a reset link has been sent.';
    const body = document.getElementById('cfForgotBody');
    if (body) {
      let extra = '';
      if (r.data && r.data.reset_token) {
        const url = `${location.origin}${location.pathname}?reset=${encodeURIComponent(r.data.reset_token)}&email=${encodeURIComponent(r.data.email || email)}`;
        extra = `<a class="auth-reset-link" href="${esc(url)}">Reset my password →</a>`;
        this.resetToken = r.data.reset_token;
        this.resetEmail = r.data.email || email;
      } else if (r.data && r.data.reset_url) {
        extra = `<a class="auth-reset-link" href="${esc(r.data.reset_url)}">Reset my password →</a>`;
        this.resetToken = r.data.reset_token || '';
      }
      body.innerHTML = `<p class="auth-reset-msg">${esc(msg)}</p>${extra}`;
    }
  },

  async _onResetPassword(event) {
    event.preventDefault();
    this._setAuthFormError('');
    const password = document.getElementById('cfResetPass')?.value || '';
    const confirm = document.getElementById('cfResetPass2')?.value || '';
    if (password.length < 8) {
      this._setFieldMsg('cfResetPass', 'cfResetPassMsg', 'Password must be at least 8 characters.', 'error');
      return;
    }
    if (!this._validatePasswordMatch('cfResetPass', 'cfResetPass2', 'cfResetPass2Msg')) return;
    this._setAuthLoading(true, 'Update password →');
    const r = await apiResetPassword({
      email: this.resetEmail,
      token: this.resetToken,
      password,
    });
    this._setAuthLoading(false, 'Update password →');
    if (!r.ok) {
      this._setAuthFormError((r.data && r.data.message) || 'Reset failed.');
      this._updateAuthSubmitState('reset');
      return;
    }
    showToast('Password updated — sign in with your new password.');
    this.authView = 'signin';
    if (typeof history !== 'undefined') history.replaceState({}, '', location.pathname);
    this.renderLogin();
  },

  async _onEmailLogin(event) {
    return this._onLogin(event);
  },

  _afterSignIn(user) {
    this.authedUser = user;
    this.authMode = 'authed';
    // Server is source of truth for role / role_group — UI branches via isFaculty(profile).
    if (this._needsOnboarding(user)) {
      clearProfile();
      this.profile = null;
      this.renderOnboarding(false);
      return;
    }
    this._hydrateProfileFromServer(user);
    this._afterAuthed();
  },

  async _onGoogleCredential(response) {
    if (!response || !response.credential) {
      showToast('Google sign-in was cancelled.');
      return;
    }
    const r = await apiSignInWithGoogle(response.credential);
    if (!r.ok) {
      const msg = (r.data && r.data.message) || 'Sign-in failed.';
      showToast(msg);
      return;
    }
    this._afterSignIn(r.data);
  },

  async signOut() {
    // Best-effort sync of any locally-saved-but-unsynced data BEFORE we
    // clear it. If the user is offline / backend unreachable, the sync
    // attempt will just no-op and we proceed to local cleanup.
    if (this.authMode === 'authed' && this.authedUser) {
      try { await this._syncLocalToServer(); } catch {}
    }

    await apiLogout();
    if (typeof clearAuthToken === 'function') clearAuthToken();
    try { sessionStorage.removeItem('cf_auth_token'); } catch {}
    clearProfile();
    // Clear per-user local caches so a different account on the same browser
    // doesn't inherit them. The cf_synced flag must reset for next sign-in.
    try {
      localStorage.removeItem('cf_synced');
      localStorage.removeItem('cf_flags');
      localStorage.removeItem('cf_wishlist');
    } catch {}
    this.authedUser = null;
    this.authMode = 'login';
    this.profile = null;
    this.selectedCourse = null;
    location.href = 'index.html';
  },

  _cancelOnboarding() {
    if (!this._onboardingState.isEdit) return;  // not allowed during first-run
    this.renderShell();
    this.bindGlobalEvents();
    this.renderLeftEmpty();
    this.renderTree();
  },

  _roleBadgeHtml() {
    const p = this.profile;
    if (!p) return '';
    const PROGRAM_LABEL = { CS: 'CS', IS: 'IS', BA: 'BA', BS: 'BS', AI: 'AI', GS: 'GS', AS: 'A&S' };
    const meta = ROLE_META[p.role];
    const roleLabel = meta ? meta.label : p.role;

    // Admin — distinct badge, no program affiliation
    if (p.role === 'admin') {
      return `
        <button class="role-badge rb-ah" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">Admin <span class="rb-suffix">· Curriculum data</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    // Area Head with no specific major (legacy "all programs" path)
    if (p.role === 'area_head' && (!p.primary || p.primary === 'AS')) {
      return `
        <button class="role-badge rb-ah" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">${esc(roleLabel)} <span class="rb-suffix">· All programs</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    // Professor teaching A&S (cross-program faculty)
    if (p.role === 'professor' && p.primary === 'AS') {
      return `
        <button class="role-badge rb-as" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">Arts &amp; Sciences <span class="rb-suffix">· Faculty</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    const primaryLower = (p.primary || '').toLowerCase();
    const secondaryLower = (p.secondary || '').toLowerCase();

    // Student with one or more minors
    const studentMinors = getProfileMinors(p);
    if (p.role === 'student' && studentMinors.length) {
      const cls = 'rb-' + primaryLower + (studentMinors.length === 1 ? '-' + studentMinors[0] : '-multi');
      if (studentMinors.length === 1) {
        const minorLabel = getMinorLabel(studentMinors[0]);
        return `
        <button class="role-badge rb-${primaryLower} ${cls}" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">${PROGRAM_LABEL[p.primary]} <span class="rb-suffix">major</span></span>
          <span class="rb-divider"></span>
          <span class="rb-segment rb-secondary">${esc(minorLabel)} <span class="rb-suffix">minor</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
      }
      const minorLabels = studentMinors.map(mc => esc(getMinorLabel(mc))).join('<span class="rb-minor-sep"> · </span>');
      return `
        <button class="role-badge rb-${primaryLower} ${cls}" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">${PROGRAM_LABEL[p.primary]} <span class="rb-suffix">major</span></span>
          <span class="rb-divider"></span>
          <span class="rb-segment rb-secondary rb-secondary-compact">${minorLabels} <span class="rb-suffix">minors</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    // Advisor — scope-aware badge
    if (p.role === 'advisor') {
      const scopeLabel = getAdvisorScopeLabel(p.scope);
      let targetLabel;
      if (p.scope === 'major' && p.primary) {
        targetLabel = `${PROGRAM_LABEL[p.primary]} Advisor`;
      } else if (p.scope === 'minor' && p.primary) {
        targetLabel = `${esc(getMinorLabel(p.primary))} minor — Advisor`;
      } else if (p.scope === 'arts_sciences') {
        targetLabel = 'Arts &amp; Sciences Advisor';
      } else {
        targetLabel = 'Advisor <span class="rb-suffix">· All programs</span>';
      }
      const cls = (p.scope === 'major' && p.primary) ? 'rb-' + p.primary.toLowerCase() : 'rb-ah';
      return `
        <button class="role-badge ${cls}" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">${targetLabel}</span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    // Faculty-with-assigned-program (not "major")
    if (isFaculty(p) && p.primary && getRoleGroup(p) !== 'student') {
      const progLabel = getProgramLabel(p.primary) || p.primary;
      return `
        <button class="role-badge rb-${primaryLower}" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">${esc(progLabel)} <span class="rb-suffix">${esc(roleLabel)}</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    // Plain student (no minor) — fallback
    return `
      <button class="role-badge rb-${primaryLower}" onclick="App.editRole()" title="Click to change role">
        <span class="rb-segment rb-primary">${PROGRAM_LABEL[p.primary]} <span class="rb-suffix">major</span></span>
        <span class="rb-edit-hint">Edit</span>
      </button>`;
  },

  editRole() {
    // Admins and faculty have server-assigned roles (ADMIN_EMAILS / seed file
    // / users.py) and can't self-edit them. Show a non-destructive notice
    // instead of walking them through a student-only flow that would fail on
    // PATCH. Only students reach the editable onboarding.
    if (this.authedUser && this.authedUser.role === 'admin') {
      showToast('Admin role is managed via the ADMIN_EMAILS env var on the server.');
      return;
    }
    if (isFaculty(this.profile)) {
      showToast('Your role is set by the CountsFor admin. Contact them to change it.');
      return;
    }
    this.renderOnboarding(true);
  },

  _visibleMajors() {
    const vm = computeViewMode(this.profile);
    if (vm === 'cross-program') {
      const p = this.profile;
      // Advisor with minor scope: highlight the analogous major (if any).
      let leadMajor = null;
      if (p && p.role === 'advisor' && p.scope === 'minor') {
        leadMajor = MINOR_CODE_TO_MAJOR[p.primary] || null;
      } else if (p && p.primary && p.primary !== 'AS' && MAJOR_ORDER.includes(p.primary)) {
        leadMajor = p.primary;
      }
      if (leadMajor) return [leadMajor, ...MAJOR_ORDER.filter(m => m !== leadMajor)];
      return MAJOR_ORDER.slice();
    }
    if (vm === 'focused-dual') {
      const minorMajor = getMinorAsMajorCode(this.profile);
      return minorMajor ? [this.profile.primary, minorMajor] : [this.profile.primary];
    }
    if (vm === 'focused-single') return [this.profile.primary];
    return MAJOR_ORDER.slice();
  },

  // ── Shell Rendering ───────────────────────────────────────
  renderShell() {
    const isSplit = this.layoutMode === 'split';
    const hasCourse = !!this.selectedCourse;

    const headerHtml = hasCourse ? `
      <div class="panel-header">
        <div class="search-row">
          <div class="search-wrapper">
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" id="courseSearch" placeholder='Try "15-122" or "Probability"' autocomplete="off" />
            <div class="typeahead" id="typeahead"></div>
          </div>
          <button class="explore-btn-inline" id="exploreInlineBtn" onclick="App.enterExplorer()" style="display:none;" title="Open requirement map"><span aria-hidden="true">🗂</span> <span class="explore-btn-inline-label">Explore other courses</span></button>
        </div>
      </div>
    ` : '';

    document.getElementById('app').innerHTML = `
      <nav class="navbar">
        <div class="navbar-brand" onclick="App.reset()"><img class="navbar-scotty" src="assets/img/scotty-head.png" alt="" aria-hidden="true" /><span class="navbar-wordmark">CountsFor</span> <span class="subtitle">CMU-Q</span></div>
        ${this._roleBadgeHtml()}
        ${this._navbarWishlistHtml()}
        <div class="navbar-right">
          <div class="navbar-semester">
            <label class="sr-only" for="semesterSelect">Semester</label>
            <select id="semesterSelect" class="semester-select" onchange="App.setSemester(this.value)">
              ${SEMESTER_OPTIONS.map(s => `<option value="${s.code}" ${this.activeSemester===s.code?'selected':''}>${esc(s.label)}</option>`).join('')}
            </select>
          </div>
          <div class="navbar-location-toggle">
            <button class="loc-btn ${this.locationFilter==='all'?'active':''}" onclick="App.setLocation('all')">All</button>
            <button class="loc-btn ${this.locationFilter==='qatar'?'active':''}" onclick="App.setLocation('qatar')">🇶🇦 Qatar</button>
            <button class="loc-btn ${this.locationFilter==='pittsburgh'?'active':''}" onclick="App.setLocation('pittsburgh')">🇺🇸 Pittsburgh</button>
          </div>
          <div class="navbar-modality-toggle">
            ${MODALITY_OPTIONS.map(m => `<button class="mod-btn ${this.modalityFilter===m.id?'active':''}" onclick="App.setModalityFilter('${m.id}')">${esc(m.label)}</button>`).join('')}
          </div>
          <button class="theme-toggle" id="themeBtn" onclick="App.toggleTheme()" title="Toggle theme">${this.theme==='dark'?'☀️':'🌙'}</button>
          ${canManageUsers(this.authedUser) ? '<button class="nav-admin" onclick="App.showUserManagement()" title="Manage user roles">Users</button>' : ''}
          ${(canFlagCourses(this.profile) && this.authMode === 'authed') ? '<button class="nav-admin" onclick="App.showFlagReview()" title="Review and resolve course flags">Flag review</button>' : ''}
          ${(isFaculty(this.profile) && this.authMode === 'authed') ? '<button class="nav-admin" onclick="App.showStudentFavorites()" title="View student saved courses and notes">Student favorites</button>' : ''}
          ${this.authMode === 'authed' ? '<button class="nav-signout" onclick="App.signOut()" title="Sign out" aria-label="Sign out">Sign out</button>' : ''}
        </div>
      </nav>

      <div class="mobile-lens-toggle ${isSplit?'split-active':''}" id="mobileLensToggle">
        <button class="mobile-lens-btn ${this.mobileLens==='lookup'?'active':''}" onclick="App.setMobileLens('lookup')">🔍 Course Lookup</button>
        <button class="mobile-lens-btn ${this.mobileLens==='map'?'active':''}" onclick="App.setMobileLens('map')">🗂 Requirement Map</button>
      </div>

      <div class="main-layout ${isSplit?'layout-split':'layout-focused'}" id="mainLayout">
        <div class="panel panel-left ${isSplit && this.mobileLens==='map'?'hidden-mobile':''}" id="panelLeft">
          ${headerHtml}
          <div class="panel-body" id="leftBody"></div>
        </div>

        <div class="panel-resizer" id="panelResizer" role="separator" aria-orientation="vertical" aria-label="Resize panels — drag left or right" tabindex="0">
          <span class="panel-resizer-grip" aria-hidden="true"></span>
        </div>

        <div class="panel panel-right ${isSplit && this.mobileLens==='lookup'?'hidden-mobile':''}" id="panelRight">
          <div class="major-tabs" id="majorTabs">
            <div class="major-tabs-scroll">
              ${this._renderMajorTabs()}
            </div>
            <button class="panel-close" onclick="App.exitExplorer()" title="Close">&times;</button>
          </div>
          <div class="tree-search">
            <input type="text" id="treeSearchInput" placeholder="Filter requirements…" />
          </div>
          <div class="panel-body" id="rightBody"></div>
        </div>
      </div>
      ${(canManageDirectory(this.profile) && this.authMode === 'authed') ? `
        <button type="button" class="directory-fab" onclick="App.toggleDirectoryPanel()" title="Directory — manage faculty access">📋 Directory</button>
        <div id="directoryPanelRoot" class="directory-panel-root" hidden></div>
      ` : ''}
    `;
    this.applyTheme();
    this._initPanelResizer();
  },

  _initPanelResizer() {
    const resizer = document.getElementById('panelResizer');
    const layout = document.getElementById('mainLayout');
    if (!resizer || !layout) return;

    const saved = loadStore('cf_split_left_px', null);
    if (saved && Number(saved) > 0) {
      layout.style.setProperty('--split-left-width', saved + 'px');
    }
    if (resizer._panelResizeBound) return;

    const minPanel = 280;
    const resizerWidth = 12;
    let dragging = false;

    const clampSplit = (px) => {
      const max = layout.getBoundingClientRect().width - minPanel - resizerWidth;
      return Math.max(minPanel, Math.min(max, px));
    };

    const applySplit = (px) => {
      const clamped = clampSplit(px);
      layout.style.setProperty('--split-left-width', clamped + 'px');
      return clamped;
    };

    const onMove = (clientX) => {
      if (!dragging || this.layoutMode !== 'split') return;
      const rect = layout.getBoundingClientRect();
      applySplit(clientX - rect.left);
    };

    const stopDrag = () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('is-dragging');
      document.body.classList.remove('is-resizing-panels');
      const val = layout.style.getPropertyValue('--split-left-width');
      const px = parseInt(val, 10);
      if (px > 0) saveStore('cf_split_left_px', px);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', stopDrag);
      document.removeEventListener('pointercancel', stopDrag);
    };

    const onPointerMove = (e) => {
      if (e.pointerId !== resizer._dragPointerId) return;
      e.preventDefault();
      onMove(e.clientX);
    };

    const startDrag = (e) => {
      if (this.layoutMode !== 'split' || window.innerWidth <= 860) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      resizer._dragPointerId = e.pointerId;
      resizer.classList.add('is-dragging');
      document.body.classList.add('is-resizing-panels');
      onMove(e.clientX);
      try { resizer.setPointerCapture(e.pointerId); } catch {}
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', stopDrag);
      document.addEventListener('pointercancel', stopDrag);
    };

    resizer._panelResizeBound = true;

    resizer.addEventListener('pointerdown', startDrag);

    resizer.addEventListener('keydown', (e) => {
      if (this.layoutMode !== 'split') return;
      const step = e.shiftKey ? 48 : 16;
      const current = parseInt(layout.style.getPropertyValue('--split-left-width'), 10)
        || Math.round(layout.getBoundingClientRect().width * 0.42);
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const px = applySplit(current - step);
        saveStore('cf_split_left_px', px);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const px = applySplit(current + step);
        saveStore('cf_split_left_px', px);
      }
    });

    resizer.addEventListener('dblclick', () => {
      layout.style.removeProperty('--split-left-width');
      saveStore('cf_split_left_px', null);
    });
  },

  // ── Events ────────────────────────────────────────────────
  _globalEventsBound: false,
  bindGlobalEvents() {
    if (this._globalEventsBound) return;
    this._globalEventsBound = true;
    document.addEventListener('input', (e) => {
      if (e.target.id === 'courseSearch') this.handleSearch(e.target.value);
      if (e.target.id === 'categorySearch') this.handleCategorySearch(e.target.value);
      if (e.target.id === 'treeSearchInput') {
        this.treeSearchQuery = e.target.value.trim().toLowerCase();
        this.renderTree();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.id === 'courseSearch') this.handleSearchKeydown(e);
      if (e.target.id === 'categorySearch') this.handleCategoryKeydown(e);
    });

    document.addEventListener('click', (e) => {
      // Close typeaheads if clicking outside any search bar
      const insideSearch = e.target.closest('.search-wrapper, .home-search');
      if (!insideSearch) {
        const ta = document.getElementById('typeahead');
        if (ta) ta.classList.remove('visible');
        const cta = document.getElementById('categoryTypeahead');
        if (cta) cta.classList.remove('visible');
      }

      // Per-row action buttons (wishlist / flag) — intercept BEFORE course-row click
      // so toggling the bookmark or opening the flag modal doesn't also navigate.
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        const code = actionBtn.dataset.courseCode;
        if (action === 'download-req') {
          this.downloadRequirementExcel(actionBtn.dataset.treeMajor, actionBtn.dataset.treePath);
          return;
        }
        if (action === 'wishlist') this.toggleWishlist(code);
        if (action === 'flag')     this.openFlagModal(code);
        return;
      }

      // Handle cf-row clicks — enter explorer and navigate to the requirement
      const cfRow = e.target.closest('[data-nav-major]');
      if (cfRow) {
        const major = cfRow.dataset.navMajor;
        const path = cfRow.dataset.navPath;
        if (major && path) this.enterExplorer(major, path);
      }

      // Handle tree node toggle via data attributes
      const treeRow = e.target.closest('[data-tree-path]');
      if (treeRow && !e.target.closest('.tr-leaf')) {
        const major = treeRow.dataset.treeMajor;
        const path = treeRow.dataset.treePath;
        if (major && path) this.toggleNode(major, path);
      }

      // Handle tree course click (not wishlist note rows — those reuse course codes)
      const treeCourse = e.target.closest('[data-course-code]');
      if (treeCourse && !e.target.closest('[data-action]') && !e.target.closest('.wl-view')) {
        this.selectCourseFromTree(treeCourse.dataset.courseCode);
      }
    });

    // ESC closes modals / overlays
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeFlagModal();
        this.closeDirectoryPanel();
      }
    });
  },

  _filterParams() {
    return {
      semesterCode: this.activeSemester,
      locationFilter: this.locationFilter,
      modalityFilter: this.modalityFilter,
    };
  },

  setSemester(code) {
    this.activeSemester = code;
    this._refreshFilters();
    showToast('Showing ' + semesterLabel(code));
  },

  setModalityFilter(mod) {
    this.modalityFilter = mod;
    document.querySelectorAll('.mod-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.trim() === (MODALITY_OPTIONS.find(m => m.id === mod) || {}).label);
    });
    this._refreshFilters();
    const label = (MODALITY_OPTIONS.find(m => m.id === mod) || {}).label || mod;
    showToast('Modality: ' + label);
  },

  _refreshFilters() {
    if (this.selectedCourse) {
      if (!this.filterByLocation(this.selectedCourse) && (this.locationFilter !== 'all' || this.modalityFilter !== 'all')) {
        this.renderCourseCard(this.selectedCourse);
      } else {
        this.renderCourseCard(this.selectedCourse);
      }
    }
    this.renderTree();
  },

  // ── Location filter ───────────────────────────────────────
  setLocation(loc) {
    this.locationFilter = loc;
    document.querySelectorAll('.loc-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.includes(loc === 'all' ? 'All' : loc === 'qatar' ? 'Qatar' : 'Pittsburgh'));
    });
    this._refreshFilters();
    showToast(loc === 'all' ? 'Showing all campuses' : loc === 'qatar' ? 'Showing Qatar only' : 'Showing Pittsburgh only');
  },

  filterByLocation(courseOrLeaf) {
    if (!courseOrLeaf) return true;
    const full = lookupCourse(this.courseIndex, courseOrLeaf.course_code || courseOrLeaf.code) || courseOrLeaf;
    return courseHasMatchingOffering(full, this._filterParams());
  },

  // ── Mobile lens toggle ────────────────────────────────────
  setMobileLens(lens) {
    this.mobileLens = lens;
    document.querySelectorAll('.mobile-lens-btn').forEach(b => {
      b.classList.toggle('active', (lens === 'lookup' && b.textContent.includes('Lookup')) || (lens === 'map' && b.textContent.includes('Map')));
    });
    document.getElementById('panelLeft').classList.toggle('hidden-mobile', lens === 'map');
    document.getElementById('panelRight').classList.toggle('hidden-mobile', lens === 'lookup');
  },

  reset() {
    this.selectedCourse = null;
    if (this.layoutMode === 'split') {
      this.exitExplorer();   // resets internal flags; the DOM mutations it makes get rebuilt by renderShell()
    }
    const input = document.getElementById('courseSearch');
    if (input) input.value = '';
    this.renderShell();        // re-render shell so the panel-header disappears
    this.renderLeftEmpty();
  },

  // ── Explorer Mode (progressive disclosure) ─────────────────
  enterExplorer(major, path) {
    if (this.layoutMode === 'split') {
      // Already in split mode — just navigate
      if (major && path) this.navigateToReqNode(major, path);
      return;
    }
    this.layoutMode = 'split';
    const layout = document.getElementById('mainLayout');
    if (layout) {
      layout.classList.remove('layout-focused');
      layout.classList.add('layout-split');
    }
    // Show mobile toggle
    const mobileToggle = document.getElementById('mobileLensToggle');
    if (mobileToggle) mobileToggle.classList.add('split-active');
    // Show right panel
    const rightPanel = document.getElementById('panelRight');
    if (rightPanel) rightPanel.style.display = 'flex';
    this._initPanelResizer();
    // Hide inline explore button in split mode
    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = 'none';
    // Render tree if not yet rendered
    this.renderTree();
    // Navigate to specific node if provided
    if (major && path) {
      setTimeout(() => this.navigateToReqNode(major, path), 100);
    }
  },

  exitExplorer() {
    this.layoutMode = 'focused';
    const layout = document.getElementById('mainLayout');
    if (layout) {
      layout.classList.remove('layout-split');
      layout.classList.add('layout-focused');
    }
    // Force-hide right panel so it doesn't leak below
    const rightPanel = document.getElementById('panelRight');
    if (rightPanel) rightPanel.style.display = 'none';
    // Hide mobile toggle
    const mobileToggle = document.getElementById('mobileLensToggle');
    if (mobileToggle) mobileToggle.classList.remove('split-active');
    // Ensure left panel is visible
    const leftPanel = document.getElementById('panelLeft');
    if (leftPanel) leftPanel.classList.remove('hidden-mobile');
    // Re-render the course card to show the Explore button again
    if (this.selectedCourse) this.renderCourseCard(this.selectedCourse);
  },

  // ══════════════════════════════════════════════════════════
  // LEFT PANEL — COURSE LOOKUP
  // ══════════════════════════════════════════════════════════

  _searchIdx: -1,
  _searchResults: [],

  handleSearch: debounce(function(query) {
    const ta = document.getElementById('typeahead');
    if (!ta) return;
    const q = query.trim().toLowerCase().replace(/-/g, '');
    if (q.length < 2) { ta.classList.remove('visible'); return; }

    let results = App.courses.filter(c => {
      const code = c.course_code.replace(/-/g, '').toLowerCase();
      const name = (c.course_name || '').toLowerCase();
      if (code.includes(q) || name.includes(q)) return true;
      // Search requirement paths and category names
      if (c.requirements) {
        for (const majorCode of MAJOR_ORDER) {
          const reqs = c.requirements[majorCode] || [];
          for (const req of reqs) {
            if (req.requirement && req.requirement.toLowerCase().includes(q)) return true;
          }
        }
      }
      // Search department name
      const dept = getDeptName(c.course_code).toLowerCase();
      if (dept.includes(q)) return true;
      return false;
    });

    // Apply location filter
    results = results.filter(c => App.filterByLocation(c));

    results = results.slice(0, 8);
    App._searchResults = results;
    App._searchIdx = -1;

    if (results.length === 0) {
      ta.innerHTML = '<div class="typeahead-item" style="cursor:default;color:var(--text-tertiary);font-size:0.8rem;">No courses found</div>';
    } else {
      ta.innerHTML = results.map((c, i) => {
        // Show matching context for requirement/category searches
        let matchHint = '';
        const codeMatch = c.course_code.replace(/-/g, '').toLowerCase().includes(q);
        const nameMatch = (c.course_name || '').toLowerCase().includes(q);
        if (!codeMatch && !nameMatch && c.requirements) {
          for (const majorCode of MAJOR_ORDER) {
            const reqs = c.requirements[majorCode] || [];
            for (const req of reqs) {
              if (req.requirement && req.requirement.toLowerCase().includes(q)) {
                const parts = req.requirement.split('---');
                matchHint = '<span class="typeahead-hint">' + majorCode + ': ' + esc(parts[parts.length - 1]) + '</span>';
                break;
              }
            }
            if (matchHint) break;
          }
        }
        const vm = computeViewMode(App.profile);
        let dcTag = '';
        if (vm === 'focused-dual' && c._doubleCounter) {
          const mm = getMinorAsMajorCode(App.profile);
          if (mm) dcTag = '<span class="tr-leaf-tag tr-leaf-tag-' + mm.toLowerCase() + '" style="margin-left:6px">' + mm + '</span>';
        }
        return '<div class="typeahead-item" data-idx="' + i + '" onclick="App.selectSearchResult(' + i + ')">' +
          '<span class="typeahead-code">' + esc(c.course_code) + '</span>' +
          '<span class="typeahead-name">' + esc(c.course_name) + '</span>' +
          matchHint +
          dcTag +
          '<span class="typeahead-units">' + (c.units || '?') + ' u</span>' +
        '</div>';
      }).join('');
    }
    ta.classList.add('visible');
  }, 180),

  handleSearchKeydown(e) {
    const ta = document.getElementById('typeahead');
    if (!ta || !ta.classList.contains('visible')) return;
    const items = ta.querySelectorAll('.typeahead-item[data-idx]');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._searchIdx = Math.min(this._searchIdx + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('focused', i === this._searchIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._searchIdx = Math.max(this._searchIdx - 1, 0);
      items.forEach((it, i) => it.classList.toggle('focused', i === this._searchIdx));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this._searchIdx >= 0 && this._searchIdx < this._searchResults.length) {
        this.selectSearchResult(this._searchIdx);
      } else if (this._searchResults.length > 0) {
        this.selectSearchResult(0);
      }
    } else if (e.key === 'Escape') {
      ta.classList.remove('visible');
    }
  },

  _selectCourse(course) {
    if (!course) return;
    const wasEmpty = !this.selectedCourse;
    this.selectedCourse = course;
    if (wasEmpty) this.renderShell();
    const input = document.getElementById('courseSearch');
    if (input) input.value = course.course_code;
    this.renderCourseCard(course);
  },

  selectSearchResult(idx) {
    const course = this._searchResults[idx];
    if (!course) return;
    const wasEmpty = !this.selectedCourse;
    if (!wasEmpty) {
      const ta = document.getElementById('typeahead');
      if (ta) ta.classList.remove('visible');
    }
    this._selectCourse(course);
  },

  // ── Category search (home bar #2) ─────────────────────────
  _categoryIndex: null,
  _categoryResults: [],
  _categoryIdx: -1,

  _buildCategoryIndex() {
    if (this._categoryIndex) return this._categoryIndex;
    const seen = new Map();
    for (const c of this.courses) {
      if (!c.requirements) continue;
      for (const major of MAJOR_ORDER) {
        const reqs = c.requirements[major] || [];
        for (const req of reqs) {
          const path = req.requirement;
          if (!path) continue;
          const key = major + '|' + path;
          if (!seen.has(key)) {
            const parts = path.split('---');
            seen.set(key, {
              major,
              path,
              parts,
              leaf: parts[parts.length - 1],
              count: 0
            });
          }
          seen.get(key).count++;
        }
      }
    }
    this._categoryIndex = Array.from(seen.values());
    return this._categoryIndex;
  },

  handleCategorySearch: debounce(function(query) {
    const ta = document.getElementById('categoryTypeahead');
    if (!ta) return;
    const q = query.trim().toLowerCase();
    if (q.length < 2) { ta.classList.remove('visible'); return; }

    const idx = App._buildCategoryIndex();
    let results = idx.filter(entry => {
      if (entry.leaf.toLowerCase().includes(q)) return true;
      return entry.parts.some(p => p.toLowerCase().includes(q));
    });

    results.sort((a, b) => {
      const aLeaf = a.leaf.toLowerCase().includes(q) ? 0 : 1;
      const bLeaf = b.leaf.toLowerCase().includes(q) ? 0 : 1;
      if (aLeaf !== bLeaf) return aLeaf - bLeaf;
      return b.count - a.count;
    });

    results = results.slice(0, 8);
    App._categoryResults = results;
    App._categoryIdx = -1;

    if (results.length === 0) {
      ta.innerHTML = '<div class="typeahead-item" style="cursor:default;color:var(--text-tertiary);font-size:0.8rem;">No categories found</div>';
    } else {
      ta.innerHTML = results.map((r, i) => {
        const breadcrumb = r.parts.length > 1 ? esc(r.parts.slice(0, -1).join(' › ')) : '';
        return '<div class="typeahead-item" data-cat-idx="' + i + '" onclick="App.selectCategoryResult(' + i + ')">' +
          '<span class="typeahead-cat-major typeahead-cat-major-' + r.major.toLowerCase() + '">' + r.major + '</span>' +
          '<span class="typeahead-name"><strong>' + esc(r.leaf) + '</strong>' +
            (breadcrumb ? '<span class="typeahead-cat-crumb"> · ' + breadcrumb + '</span>' : '') +
          '</span>' +
          '<span class="typeahead-units">' + r.count + ' ' + (r.count === 1 ? 'course' : 'courses') + '</span>' +
        '</div>';
      }).join('');
    }
    ta.classList.add('visible');
  }, 180),

  handleCategoryKeydown(e) {
    const ta = document.getElementById('categoryTypeahead');
    if (!ta || !ta.classList.contains('visible')) return;
    const items = ta.querySelectorAll('.typeahead-item[data-cat-idx]');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._categoryIdx = Math.min(this._categoryIdx + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('focused', i === this._categoryIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._categoryIdx = Math.max(this._categoryIdx - 1, 0);
      items.forEach((it, i) => it.classList.toggle('focused', i === this._categoryIdx));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this._categoryIdx >= 0 && this._categoryIdx < this._categoryResults.length) {
        this.selectCategoryResult(this._categoryIdx);
      } else if (this._categoryResults.length > 0) {
        this.selectCategoryResult(0);
      }
    } else if (e.key === 'Escape') {
      ta.classList.remove('visible');
    }
  },

  selectCategoryResult(idx) {
    const r = this._categoryResults[idx];
    if (!r) return;
    const ta = document.getElementById('categoryTypeahead');
    if (ta) ta.classList.remove('visible');
    this.enterExplorer(r.major, r.path);
  },

  renderLeftEmpty() {
    const el = document.getElementById('leftBody');
    if (!el) return;
    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = 'none';
    this._homeView = 'home';
    el.innerHTML = this._renderHome();
    // Faculty home — flag queue summary; students — flagged courses read-only
    if (canFlagCourses(this.profile) && this.authMode === 'authed') {
      this._loadMyFlagsSummary();
    } else if (isStudent(this.profile) && this.authMode === 'authed') {
      this._loadStudentFlagsSummary();
    }
  },

  _renderHome() {
    const vm = computeViewMode(this.profile);
    const p = this.profile && this.profile.primary;
    const minorMajor = getMinorAsMajorCode(this.profile);
    const minorLabel = (this.profile && this.profile.secondary) ? getMinorLabel(this.profile.secondary) : null;

    // Lead sentence per spec § 4.3
    let lead;
    if (vm === 'focused-dual') {
      lead = `See what it counts for in your ${p} major and ${esc(minorLabel)} minor.`;
    } else if (vm === 'focused-single' && this.profile.role === 'professor') {
      lead = `See what it counts for in the program you teach.`;
    } else if (vm === 'focused-single' && isFaculty(this.profile) && p) {
      lead = `See what it counts for across programs, with ${p} highlighted.`;
    } else if (vm === 'focused-single') {
      lead = `See what it counts for in your ${p} program.`;
    } else {
      lead = `See what it counts for across CS, IS, BA, and BS.`;
    }

    // Browse-button subtitle
    let browseSub;
    if (vm === 'focused-dual') browseSub = `${p} + ${minorMajor} requirement tree — find courses by slot`;
    else if (vm === 'focused-single') browseSub = `${p} requirement tree`;
    else browseSub = `CS · IS · BA · BS requirement tree`;

    // The major to open when Browse is clicked
    const browseMajor = (vm === 'cross-program') ? this.activeMajor : (p || this.activeMajor);

    // Double-counter banner (focused-dual only)
    let dcBannerHtml = '';
    if (vm === 'focused-dual') {
      const dcCount = this.courses.filter(c => c._doubleCounter).length;
      dcBannerHtml = `
        <div class="home-insight home-insight-compact" onclick="App.showDoubleCounterList()">
          <div class="home-insight-num">${dcCount}</div>
          <div class="home-insight-col">
            <div class="home-insight-label">${p} MAJOR + ${minorMajor} MINOR</div>
            <div class="home-insight-text">courses count for both — pick these first</div>
          </div>
          <span class="home-insight-cta">See all →</span>
        </div>
      `;
    }

    // Multi-program lane (cross-program only) replaces the dc banner
    let mpBannerHtml = '';
    if (vm === 'cross-program') {
      const mpCount = this.courses.filter(c => (c._programCount || 0) >= 3).length;
      const majorForBrowse = this.activeMajor || 'CS';
      mpBannerHtml = `
        <div class="home-insight home-insight-mp home-insight-compact" onclick="App.enterExplorer('${majorForBrowse}')">
          <div class="home-insight-num">${mpCount}</div>
          <div class="home-insight-col">
            <div class="home-insight-label">CROSS-PROGRAM</div>
            <div class="home-insight-text">courses count for 3+ programs</div>
          </div>
          <span class="home-insight-cta">Browse →</span>
        </div>
      `;
    }

    return `
      <div class="home">
        <div class="home-plaid" aria-hidden="true"></div>

        <header class="home-head">
          <h1 class="home-hero">Find a course.</h1>
          <p class="home-lead">${lead}</p>
        </header>

        <section class="home-strip" aria-label="Search and browse">
          <div class="home-strip-search">
            <label class="home-strip-label" for="courseSearch">Course</label>
            <div class="home-search">
              <span class="home-search-icon">🔍</span>
              <input type="text" class="home-search-input" id="courseSearch" placeholder='15-122 or Probability' autocomplete="off" />
              <div class="typeahead" id="typeahead"></div>
            </div>
          </div>

          <div class="home-strip-search">
            <label class="home-strip-label" for="categorySearch">Category</label>
            <div class="home-search">
              <span class="home-search-icon">🔍</span>
              <input type="text" class="home-search-input" id="categorySearch" placeholder='Contextual Thinking' autocomplete="off" />
              <div class="typeahead" id="categoryTypeahead"></div>
            </div>
          </div>

          <button type="button" class="home-strip-browse" onclick="App.enterExplorer('${browseMajor}')" title="Browse ${browseSub}">
            <span class="home-strip-browse-icon">🗂</span>
            <span class="home-strip-browse-text">
              <span class="home-strip-browse-title">Browse</span>
              <span class="home-strip-browse-sub">${browseSub}</span>
            </span>
            <span class="home-strip-browse-arrow">→</span>
          </button>
        </section>

        <section class="home-lanes">
          ${this._renderWishlistEntry()}
          ${this._renderStudentFlaggedPanel()}
          ${this._renderMyFlagsPanel()}
        </section>

        ${dcBannerHtml || mpBannerHtml ? `<section class="home-banners">${dcBannerHtml}${mpBannerHtml}</section>` : ''}

        <footer class="home-foot">
          <a class="home-foot-logo" href="https://www.qatar.cmu.edu/" target="_blank" rel="noopener" aria-label="Carnegie Mellon University Qatar">
            <img src="assets/img/cmuq-wordmark.png" alt="" />
          </a>
          <span class="home-foot-note">A curriculum explorer for the CMU-Q community.</span>
        </footer>
      </div>
    `;
  },

  _navbarWishlistHtml() {
    if (!isStudent(this.profile)) return '';
    const count = this._getWishlist().length;
    const countChip = count > 0 ? `<span class="nav-wish-count">${count}</span>` : '';
    const label = count > 0 ? 'Saved' : 'Save courses';
    return `
      <button class="nav-wish" onclick="App.showWishlistView()" title="View your saved courses" aria-label="View saved courses">
        ${this._iconBookmarkFilled()}
        <span class="nav-wish-label">${label}</span>
        ${countChip}
      </button>`;
  },

  // Refresh just the navbar count without re-rendering the whole shell.
  _refreshNavWishCount() {
    const btn = document.querySelector('.nav-wish');
    if (!btn) return;
    const count = this._getWishlist().length;
    const existing = btn.querySelector('.nav-wish-count');
    const label = btn.querySelector('.nav-wish-label');
    if (count > 0) {
      if (label) label.textContent = 'Saved';
      if (existing) existing.textContent = String(count);
      else btn.insertAdjacentHTML('beforeend', `<span class="nav-wish-count">${count}</span>`);
    } else {
      if (label) label.textContent = 'Save courses';
      if (existing) existing.remove();
    }
  },

  _renderWishlistEntry() {
    if (!isStudent(this.profile)) return '';
    const count = this._getWishlistItems().length;
    const subtext = count === 0
      ? 'Tap the bookmark on any course to add it here.'
      : `${count} course${count === 1 ? '' : 's'} saved — open to add notes.`;
    return `
      <button type="button" class="home-tile home-tile-wish" onclick="App.showWishlistView()">
        <span class="home-tile-icon">${this._iconBookmarkFilled()}</span>
        <span class="home-tile-body">
          <span class="home-tile-title">Saved courses</span>
          <span class="home-tile-sub">${subtext}</span>
        </span>
        <span class="home-tile-arrow">→</span>
      </button>`;
  },

  // ── Faculty flag queue (all faculty + admin) ───────────────
  _myFlagsState: null,
  _myFlagsView:  { status: 'pending', items: [], total: 0 },
  _studentFlagsState: null,

  _renderStudentFlaggedPanel() {
    if (!isStudent(this.profile) || this.authMode !== 'authed') return '';
    const st = this._studentFlagsState;
    if (!st || !st.loaded) {
      return `<div class="home-tile home-tile-flag" id="homeStudentFlags"><span class="home-tile-title">Flagged courses</span><span class="home-tile-sub">Loading…</span></div>`;
    }
    const n = (st.items || []).length;
    if (n === 0) {
      return `<div class="home-tile home-tile-flag home-tile-muted" id="homeStudentFlags"><span class="home-tile-title">Flagged courses</span><span class="home-tile-sub">No open flags right now</span></div>`;
    }
    const preview = st.items.slice(0, 2).map(f => f.course_code).join(' · ');
    return `
      <button type="button" class="home-tile home-tile-flag" id="homeStudentFlags" onclick="App.showStudentFlagsView()">
        <span class="home-tile-icon">⚑</span>
        <span class="home-tile-body">
          <span class="home-tile-title">Flagged <span class="home-tile-badge">${n}</span></span>
          <span class="home-tile-sub">${esc(preview)}</span>
        </span>
        <span class="home-tile-arrow">→</span>
      </button>`;
  },

  async _loadStudentFlagsSummary() {
    const r = await apiListFlags('limit=100');
    if (!r.ok) {
      this._studentFlagsState = { loaded: true, items: [] };
    } else {
      this._studentFlagsState = { loaded: true, items: (r.data && r.data.items) || [] };
      this.serverFlags = this._studentFlagsState.items;
    }
    if (this._homeView === 'home') {
      const node = document.getElementById('homeStudentFlags');
      if (node) node.outerHTML = this._renderStudentFlaggedPanel();
    }
  },

  _renderMyFlagsPanel() {
    if (!canFlagCourses(this.profile)) return '';

    if (this.authMode !== 'authed') {
      return `
        <div class="home-myflags home-myflags-offline">
          <span class="home-myflags-title">Course flags</span>
          <span class="home-myflags-sub">Sign in to review and resolve faculty-reported course issues.</span>
        </div>`;
    }

    const st = this._myFlagsState;
    if (!st || !st.loaded) {
      return `
        <div class="home-myflags" id="homeMyFlags">
          <span class="home-myflags-title">Course flags</span>
          <span class="home-myflags-sub">Loading…</span>
        </div>`;
    }
    if (st.error) {
      return `
        <div class="home-myflags" id="homeMyFlags">
          <span class="home-myflags-title">Course flags</span>
          <span class="home-myflags-sub">Couldn't load flags right now.</span>
        </div>`;
    }

    const c = st.counts;
    const total = c.pending + c.reviewed + c.resolved + c.dismissed;
    if (total === 0) {
      return `
        <div class="home-myflags" id="homeMyFlags">
          <span class="home-myflags-title">Course flags</span>
          <span class="home-myflags-sub">No flags yet. Use “Flag course issue” on a course to report one.</span>
        </div>`;
    }

    const chip = (n, label, status, cls) => `
      <button class="home-myflags-chip ${cls}" onclick="App.showFlagReview(); App._switchFlagStatus('${status}')">
        <span class="home-myflags-num">${n}</span>
        <span class="home-myflags-label">${label}</span>
      </button>`;

    return `
      <div class="home-myflags" id="homeMyFlags">
        <div class="home-myflags-head">
          <span class="home-myflags-title">Course flags</span>
          <button class="home-myflags-all" onclick="App.showFlagReview()">Review queue →</button>
        </div>
        <div class="home-myflags-chips">
          ${chip(c.pending,   'Pending',   'pending',   'mf-pending')}
          ${chip(c.reviewed,  'Reviewed',  'reviewed',  'mf-reviewed')}
          ${chip(c.resolved,  'Resolved',  'resolved',  'mf-resolved')}
          ${chip(c.dismissed, 'Dismissed', 'dismissed', 'mf-dismissed')}
        </div>
      </div>`;
  },

  async _loadMyFlagsSummary() {
    const r = await apiListFlags('limit=200');
    if (!r.ok) {
      this._myFlagsState = { loaded: true, error: true, counts: summarizeFlagsByStatus([]), items: [] };
    } else {
      const items = (r.data && r.data.items) || [];
      this._myFlagsState = { loaded: true, error: false, counts: summarizeFlagsByStatus(items), items };
    }
    if (this._homeView === 'home') {
      const node = document.getElementById('homeMyFlags');
      if (node) node.outerHTML = this._renderMyFlagsPanel();
    }
  },

  async showMyFlagsView(status) {
    if (!isFaculty(this.profile) || this.authMode !== 'authed') {
      showToast('Sign in as faculty to view your flags.');
      return;
    }
    if (this.authedUser && this.authedUser.role === 'admin') return this.showFlagReview();

    this._homeView = 'myflags';
    this._myFlagsView = { status: status || 'pending', items: [], total: 0 };
    const el = document.getElementById('leftBody');
    if (!el) return;
    el.innerHTML = '<div class="empty-state"><div class="spinner"></div><div class="empty-text" style="margin-top:12px">Loading your flags…</div></div>';
    await this._loadMyFlagsView();
  },

  async _loadMyFlagsView() {
    const s = this._myFlagsView;
    const r = await apiGetMyFlags('status=' + encodeURIComponent(s.status) + '&limit=100');
    const el = document.getElementById('leftBody');
    if (!el) return;
    if (!r.ok) {
      el.innerHTML = `<div class="empty-state"><div class="empty-text">Could not load your flags: ${esc((r.data && r.data.message) || r.error || 'error')}</div></div>`;
      return;
    }
    s.items = r.data.items || [];
    s.total = r.data.total || 0;
    this._renderMyFlagsView();
  },

  _renderMyFlagsView() {
    const el = document.getElementById('leftBody');
    if (!el) return;
    const s = this._myFlagsView;

    const tab = (status, label) => `
      <button class="adm-tab ${s.status === status ? 'active' : ''}" onclick="App._switchMyFlagsStatus('${status}')">${label}</button>
    `;
    const rowsHtml = (s.items && s.items.length)
      ? s.items.map(f => this._renderFlagRow(f, { readOnly: true })).join('')
      : `<div class="empty-state"><div class="empty-text">No flags with status “${esc(s.status)}”.</div></div>`;

    el.innerHTML = `
      <div class="adm-view">
        <div class="adm-header">
          <button class="dc-back-link" onclick="App.renderLeftEmpty()">← Back to home</button>
          <div class="adm-title">Your flags <span class="adm-count">· ${s.total || 0}</span></div>
        </div>
        <div class="adm-tabs">
          ${tab('pending',   'Pending')}
          ${tab('reviewed',  'Reviewed')}
          ${tab('resolved',  'Resolved')}
          ${tab('dismissed', 'Dismissed')}
        </div>
        <div class="adm-list">${rowsHtml}</div>
      </div>
    `;
  },

  async _switchMyFlagsStatus(status) {
    this._myFlagsView.status = status;
    await this._loadMyFlagsView();
  },

  showDoubleCounterList() {
    if (computeViewMode(this.profile) !== 'focused-dual') return;
    const el = document.getElementById('leftBody');
    if (!el) return;

    const p = this.profile.primary;
    const s = getMinorAsMajorCode(this.profile);
    if (!s) return;
    const pLower = p.toLowerCase();
    const sLower = s.toLowerCase();

    const list = this.courses.filter(c => c._doubleCounter);

    const lastSegment = (req) => {
      const parts = (req || '').split('---');
      return parts[parts.length - 1] || req || '';
    };

    const rowsHtml = list.map(c => {
      const pReqs = (c.requirements[p] || []).map(r => esc(lastSegment(r.requirement))).slice(0, 2);
      const sReqs = (c.requirements[s] || []).map(r => esc(lastSegment(r.requirement))).slice(0, 2);
      const fills = [
        ...pReqs.map(r => `<span class="dc-row-fill"><strong style="color:var(--major-${pLower})">${p}:</strong> ${r}</span>`),
        ...sReqs.map(r => `<span class="dc-row-fill"><strong style="color:var(--major-${sLower})">${s}:</strong> ${r}</span>`),
      ].join('');
      return `
        <div class="dc-row" onclick="App.selectCourseFromTree('${esc(c.course_code)}')">
          <div class="dc-row-code">${esc(c.course_code)}</div>
          <div class="dc-row-main">
            <div class="dc-row-name">${esc(c.course_name)}</div>
            <div class="dc-row-fills">${fills}</div>
          </div>
          <div class="dc-row-side">
            <span class="dc-mini-badge dc-mini-${pLower}">${p}</span>
            <span class="dc-mini-badge dc-mini-${sLower}">${s}</span>
            <span class="dc-row-units">${c.units || '?'}u</span>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="dc-list-view">
        <div class="dc-list-header">
          <button class="dc-back-link" onclick="App.renderLeftEmpty()">← Back to home</button>
          <div class="dc-list-count">${list.length} courses count for both ${p} and ${s}</div>
        </div>
        <div class="dc-list">${rowsHtml || '<div class="empty-state"><div class="empty-text">No double-counter courses found.</div></div>'}</div>
      </div>
    `;
  },

  renderCourseCard(course) {
    const el = document.getElementById('leftBody');
    if (!el) return;

    const deptName = getDeptName(course.course_code);
    const semesters = sortSemesters(course.offered || []);
    const prereq = formatPrereq(course.prerequisites);
    const profile = this.profile;
    const facultyView = isFaculty(profile);
    const mappings = getCourseMappings(course, { full: facultyView });
    const sections = filterOfferings(getCourseOfferings(course), this._filterParams());
    const semLabel = semesterLabel(this.activeSemester);
    const isDoubleCounter = !!course._doubleCounter;
    const pLower = profile && profile.primary ? profile.primary.toLowerCase() : 'cs';
    const minorMajor = getMinorAsMajorCode(profile);
    const sLower = minorMajor ? minorMajor.toLowerCase() : 'cs';

    // Where string
    const whereParts = [];
    if (course.offered_qatar) whereParts.push('Qatar');
    if (course.offered_pitts) whereParts.push('Pittsburgh');
    const whereStr = whereParts.length ? whereParts.join(' &amp; ') : '—';

    // Slim DC banner (spec § 4.4) — student lens only; faculty get the full
    // cross-program grid instead of a "double-counter for you" framing.
    let dcBannerHtml = '';
    if (!facultyView && isDoubleCounter && profile && minorMajor) {
      dcBannerHtml = `
        <div class="cc-dc-strip">
          <span class="cc-dc-badge cc-dc-${pLower}">${profile.primary}</span>
          <span class="cc-dc-badge cc-dc-${sLower}">${minorMajor}</span>
          <span class="cc-dc-text">Double-counter</span>
        </div>`;
    }

    // About column rows
    const aboutRows = `
      <div class="cc-kv"><span class="cc-k">Dept</span><span class="cc-v">${esc(deptName)} (${esc(course.course_code.split('-')[0])})</span></div>
      <div class="cc-kv"><span class="cc-k">Offered</span><span class="cc-v">${semesters.length ? semesters.map(esc).join(' · ') : '—'}</span></div>
      <div class="cc-kv"><span class="cc-k">Where</span><span class="cc-v">${whereStr}</span></div>
      <div class="cc-kv"><span class="cc-k">Prereq</span><span class="cc-v">${prereq ? esc(prereq) : '<em>None</em>'}</span></div>
    `;

    // Schedule rows for active semester + campus + modality
    let filtered = sections.slice();
    let schedHtml = '';
    if (filtered.length === 0) {
      const campus = this.locationFilter === 'qatar' ? 'Qatar' : this.locationFilter === 'pittsburgh' ? 'Pittsburgh' : 'this filter';
      const mod = this.modalityFilter !== 'all' ? (' · ' + (MODALITY_OPTIONS.find(m => m.id === this.modalityFilter) || {}).label) : '';
      schedHtml = `<div class="cc-empty">No matching sections for ${esc(semLabel)}${mod ? esc(mod) : ''}${this.locationFilter !== 'all' ? ' · ' + esc(campus) : ''}</div>`;
    } else {
      const inline = filtered.slice(0, 4).map(s => this._renderSchedRow(s)).join('');
      const extraCount = filtered.length - 4;
      const more = extraCount > 0
        ? `<button class="cc-more" onclick="App.expandScheduleV2(event)" id="cc-sched-more" data-expanded="0">+${extraCount} more sections</button>
           <div id="cc-sched-extra" style="display:none;margin-top:6px"></div>`
        : '';
      schedHtml = inline + more;
    }

    // Counts For — columns per major. Order depends on role: students lead
    // with their own program(s); faculty see the canonical cross-program order.
    const cfOrder = orderCfColumns(mappings, profile);
    const cfCols = [];
    for (const majorCode of cfOrder) {
      const majorMappings = mappings[majorCode];
      if (!majorMappings || majorMappings.length === 0) continue;
      const lc = majorCode.toLowerCase();
      const itemsHtml = majorMappings.map(m => {
        const typeLabel = m.isGenEd ? 'GenEd' : 'Required';
        const typeCls = m.isGenEd ? 'gened' : 'req';
        const safePath = m.fullPath.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `
          <div class="cc-cf-item" data-nav-major="${majorCode}" data-nav-path="${safePath}">
            <span class="cc-cf-item-label">${esc(m.shortLabel)}</span>
            <span class="cc-cf-item-type cc-cf-item-type-${typeCls}">${typeLabel}</span>
          </div>`;
      }).join('');
      cfCols.push(`
        <div class="cc-cf-col cc-cf-col-${lc}">
          <div class="cc-cf-col-head">
            <span class="cc-cf-badge cc-cf-${lc}">${majorCode}</span>
            <span class="cc-cf-col-count">${majorMappings.length} ${majorMappings.length === 1 ? 'slot' : 'slots'}</span>
          </div>
          <div class="cc-cf-col-body">${itemsHtml}</div>
        </div>`);
    }
    const cfHtml = cfCols.length
      ? `<div class="cc-cf-grid">${cfCols.join('')}</div>`
      : '<div class="cc-empty">This course does not count toward any tracked major requirements.</div>';

    // Top-right card actions (role-gated)
    const cardActions = this._renderCardActions(course);
    const wishlistNoteHtml = (isStudent(this.profile) && this._isInWishlist(course.course_code))
      ? `
        <div class="cc-wishlist-note">
          <label class="wl-note-wrap">
            <span class="wl-note-label">Your note on this course</span>
            <textarea class="wl-note-input" data-wl-note="${esc(course.course_code)}" placeholder="Why you saved this course…" rows="2">${esc(this._getWishlistNote(course.course_code))}</textarea>
          </label>
        </div>`
      : '';

    el.innerHTML = `
      <div class="cc-card">
        ${dcBannerHtml}
        <div class="cc-head">
          <div class="cc-head-main">
            <div class="cc-code">${esc(course.course_code)}</div>
            <div class="cc-name">${esc(course.course_name)} · ${course.units || '?'} units</div>
          </div>
          ${cardActions}
        </div>
        ${wishlistNoteHtml}

        <div class="cc-cols">
          <div class="cc-section">
            <div class="cc-h4">ABOUT</div>
            ${aboutRows}
          </div>
          <div class="cc-section">
            <div class="cc-h4">${esc(semLabel.toUpperCase())}</div>
            ${this._renderOfferingPredictionHtml(course, this.activeSemester ? this.activeSemester[0] : 'F')}
            ${schedHtml}
          </div>
        </div>

        <div class="cc-section cc-section-cf">
          <div class="cc-h4">COUNTS FOR${(facultyView && cfOrder.length) ? ` <span class="cc-cf-summary">· ${cfOrder.length} program${cfOrder.length === 1 ? '' : 's'}</span>` : ''}</div>
          ${cfHtml}
        </div>

        ${course.description ? `
          <div class="cc-section">
            <div class="cc-h4">DESCRIPTION</div>
            <div class="cc-desc">${esc(course.description)}</div>
          </div>
        ` : ''}
      </div>
    `;

    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = this.layoutMode === 'focused' ? 'flex' : 'none';

    this._bindWishlistNoteInputs(el);
    this._schedSections = filtered;  // used by expand handler
  },

  _renderSchedRow(s) {
    const time = (s.days_times && s.days_times !== 'TBA')
      ? esc(s.days_times)
      : ((s.begin_time && s.begin_time !== 'TBA')
        ? `${esc(s.days || 'TBA')} ${esc(s.begin_time)}–${esc(s.end_time)}`
        : 'TBA');
    const dmCls = (dm) => {
      const d = (dm || '').toLowerCase();
      if (d.includes('remote')) return 'cc-dm-remote';
      if (d.includes('in person') || d.includes('in-person')) return 'cc-dm-inperson';
      return 'cc-dm-other';
    };
    const mod = s.modality || s.delivery_mode || '';
    const campusBadge = s.campus ? `<span class="cc-campus-pill">${esc(s.campus)}</span>` : '';
    const dm = mod ? `<span class="cc-dm-pill ${dmCls(mod)}">${esc(mod).toUpperCase()}</span>` : '';
    return `<div class="cc-kv"><span class="cc-k">Sec ${esc(s.section)}</span><span class="cc-v">${time} ${campusBadge} ${dm}</span></div>`;
  },

  expandScheduleV2(e) {
    e.stopPropagation();
    const btn = document.getElementById('cc-sched-more');
    const extra = document.getElementById('cc-sched-extra');
    if (!btn || !extra) return;
    const expanded = btn.dataset.expanded === '1';
    const sections = (this._schedSections || []).slice(4);
    if (!expanded) {
      extra.style.display = 'block';
      extra.innerHTML = sections.map(s => this._renderSchedRow(s)).join('');
      btn.textContent = 'Hide extra sections';
      btn.dataset.expanded = '1';
    } else {
      extra.style.display = 'none';
      btn.textContent = '+' + sections.length + ' more sections';
      btn.dataset.expanded = '0';
    }
  },

  // ══════════════════════════════════════════════════════════
  // RIGHT PANEL — REQUIREMENT MAP
  // ══════════════════════════════════════════════════════════

  _renderMajorTabs() {
    const visible = this._visibleMajors();
    const p = this.profile;
    const minorMajor = getMinorAsMajorCode(p);
    const facultyMajor = (isFaculty(p) && p.primary && p.primary !== 'AS' && MAJOR_LIST.includes(p.primary))
      ? p.primary : null;

    // Advisor-with-minor: the minor maps to a major (if we have the data).
    const advisorMinorMajor = (p && p.role === 'advisor' && p.scope === 'minor')
      ? (MINOR_CODE_TO_MAJOR[p.primary] || null)
      : null;

    return visible.map(m => {
      const isActive = m === this.activeMajor;
      const isMinor = minorMajor === m && p.primary !== m;
      const isYourMajor = p && p.role === 'student' && p.primary === m;
      const isFacultyOwn = facultyMajor === m;
      const isAdvisorMinor = advisorMinorMajor === m;

      let suffix = '';
      let suffixCls = '';
      if (isYourMajor)        { suffix = 'Your major';      suffixCls = 'major-tab-suffix-major'; }
      else if (isMinor)       { suffix = 'Your minor';      suffixCls = 'major-tab-suffix-minor'; }
      else if (isAdvisorMinor){ suffix = 'You advise';      suffixCls = 'major-tab-suffix-faculty'; }
      else if (isFacultyOwn)  { suffix = getRoleLabel(p) || 'Assigned'; suffixCls = 'major-tab-suffix-faculty'; }

      const name = this._programFullName(m);
      const pending = isProgramDataPending(m) ? '<span class="major-tab-pending">soon</span>' : '';

      return `
        <button class="major-tab ${isActive ? 'active' : ''}" data-major="${m}" onclick="App.switchMajor('${m}')">
          <span class="major-tab-row">
            <span class="major-tab-code">${m}</span>${pending}
            ${suffix ? `<span class="major-tab-suffix ${suffixCls}">${esc(suffix)}</span>` : ''}
          </span>
          <span class="major-tab-name">${esc(name)}</span>
        </button>`;
    }).join('');
  },

  switchMajor(major) {
    this.activeMajor = major;
    this.treeSearchQuery = '';
    const treeInput = document.getElementById('treeSearchInput');
    if (treeInput) treeInput.value = '';

    // Update tab UI
    document.querySelectorAll('.major-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.major === major);
    });

    // Auto-expand first level
    this.autoExpandFirstLevel(major);
    this.renderTree();
  },

  toggleNode(major, path) {
    const key = major + '::' + path;
    if (this.expandedNodes.has(key)) {
      this.expandedNodes.delete(key);
    } else {
      this.expandedNodes.add(key);
    }
    this.renderTree();
  },

  isExpanded(major, path) {
    return this.expandedNodes.has(major + '::' + path);
  },

  renderTree() {
    const rightBody = document.getElementById('rightBody');
    if (!rightBody) return;
    const sections = this.treeSections[this.activeMajor];
    if (!sections) {
      const pending = isProgramDataPending(this.activeMajor);
      const full = this._programFullName(this.activeMajor);
      if (pending) {
        rightBody.innerHTML = `
          <div class="empty-state-pending">
            <img class="empty-state-pending-illustration" src="assets/img/scotty-full.png" alt="" aria-hidden="true" />
            <span class="empty-state-pending-tag">Coming soon</span>
            <div class="empty-state-pending-title" style="margin-top:14px">${esc(full)} requirements</div>
            <div class="empty-state-pending-body">
              The official requirement list for ${esc(full)} is still being collected.
              Once it lands, courses will automatically count toward this program.
            </div>
            <a class="empty-state-pending-help" href="mailto:cmuq-curriculum@andrew.cmu.edu?subject=${encodeURIComponent('CountsFor — ' + full + ' requirement data')}">
              Have official data? Email us
            </a>
          </div>`;
      } else {
        rightBody.innerHTML = `<div class="empty-state"><img class="empty-illustration" src="assets/img/scotty-full.png" alt="" aria-hidden="true" /><div class="empty-text">No data</div></div>`;
      }
      return;
    }
    let html = '';
    // degree + gened both render as a flat list of cards — no separate section headers
    for (const node of [...sections.degree, ...sections.gened]) {
      html += this.renderTreeNode(node, this.activeMajor, 0);
    }
    rightBody.innerHTML = html;
  },

  renderTreeNode(node, major, depth) {
    const hasChildren = node.children && node.children.length > 0;
    const hasCourses = node.courses && node.courses.length > 0;
    const isExpandable = hasChildren || hasCourses;
    const expanded = this.isExpanded(major, node.path);
    const isHighlighted = this.highlightedPath === node.path;

    const matchesSearch = this.nodeMatchesSearch(node);
    if (this.treeSearchQuery && !matchesSearch) return '';

    const filteredCourses = (node.courses || []).filter(c => this.filterByLocation(c));
    const filteredTotalCourses = this.countFilteredCourses(node);

    const ruleHtml = node.rule ? `<span class="tr-rule">${esc(node.rule.label)}</span>` : '';
    const countHtml = (!expanded && filteredTotalCourses > 0 && isExpandable)
      ? `<span class="tr-count">${filteredTotalCourses} course${filteredTotalCourses === 1 ? '' : 's'}</span>`
      : '';
    const safePath = node.path.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const downloadBtn = filteredTotalCourses > 0
      ? this._renderReqDownloadBtn(major, safePath)
      : '';

    // ── Depth 0: render as a card ─────────────────────────────
    if (depth === 0) {
      const accent = pickAccentColor(node.label, major);
      const openCls = expanded ? 'open' : '';
      const cardHead = `
        <div class="tr-card-head ${isHighlighted ? 'highlighted' : ''}" data-tree-major="${major}" data-tree-path="${safePath}">
          <span class="tr-arrow ${expanded ? 'expanded' : ''}">▶</span>
          <span class="tr-accent" style="background:${accent}"></span>
          <span class="tr-card-title">${esc(node.label)}</span>
          <span class="tr-card-meta">${ruleHtml}${countHtml}${downloadBtn}</span>
        </div>`;
      let body = '';
      if (isExpandable && expanded) {
        let inner = '';
        if (hasChildren) {
          for (const child of node.children) inner += this.renderTreeNode(child, major, depth + 1);
        }
        if (hasCourses) {
          for (const c of filteredCourses) inner += this._renderLeafCourse(c, major);
        }
        body = `<div class="tr-card-body">${inner}</div>`;
      }
      return `<div class="tr-card ${openCls}" style="--tr-accent:${accent}">${cardHead}${body}</div>`;
    }

    // ── Depth ≥ 1: regular sub-node ──────────────────────────
    const indent = (depth - 1) * 14;
    let html = `<div class="tr-sub" style="padding-left:${indent}px">`;
    html += `<div class="tr-sub-row ${isHighlighted ? 'highlighted' : ''}" data-tree-major="${major}" data-tree-path="${safePath}">`;
    html += `<span class="tr-arrow ${expanded ? 'expanded' : ''} ${!isExpandable ? 'leaf' : ''}">▶</span>`;
    html += `<span class="tr-sub-label">${esc(node.label)}</span>`;
    html += ruleHtml;
    html += countHtml;
    html += downloadBtn;
    html += `</div>`;
    if (isExpandable) {
      html += `<div class="tr-children ${expanded ? '' : 'collapsed'}">`;
      if (hasChildren) {
        for (const child of node.children) html += this.renderTreeNode(child, major, depth + 1);
      }
      if (hasCourses) {
        for (const c of filteredCourses) html += this._renderLeafCourse(c, major);
      }
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  },

  _renderReqDownloadBtn(major, safePath) {
    return `<button type="button" class="tr-download" data-action="download-req" data-tree-major="${esc(major)}" data-tree-path="${safePath}" title="Download courses for Excel" aria-label="Download courses for Excel">⬇</button>`;
  },

  downloadRequirementExcel(major, path) {
    const node = findTreeNode(this.trees[major], path);
    if (!node) {
      showToast('Requirement not found.');
      return;
    }
    const filterFn = (leaf) => {
      const full = lookupCourse(this.courseIndex, leaf.code) || leaf;
      return this.filterByLocation(full);
    };
    const courses = collectCoursesForRequirement(node, filterFn);
    if (!courses.length) {
      showToast('No courses match your current campus filter.');
      return;
    }

    const pathLabel = formatRequirementPath(node.path);
    const majorLabel = (MAJOR_META[major] && MAJOR_META[major].label) || major;
    const headers = ['Course Code', 'Course Name', 'Units', 'Department', 'Type', 'Qatar', 'Pittsburgh', 'Prerequisites'];
    const rows = courses.map(leaf => {
      const full = lookupCourse(this.courseIndex, leaf.code) || leaf;
      return [
        leaf.code,
        leaf.name || full.course_name || '',
        leaf.units || full.units || '',
        typeof getDeptName === 'function' ? getDeptName(leaf.code) : (full.department || ''),
        leaf.type ? 'GenEd' : 'Core',
        full.offered_qatar ? 'Yes' : 'No',
        full.offered_pitts ? 'Yes' : 'No',
        full.prerequisites || '',
      ];
    });

    const filterNote = this.locationFilter === 'all'
      ? 'All campuses'
      : (this.locationFilter === 'qatar' ? 'Qatar only' : 'Pittsburgh only');
    const metaRows = [
      ['CountsFor course export'],
      ['Major', majorLabel],
      ['Requirement', pathLabel],
      ['Campus filter', filterNote],
      ['Courses', String(courses.length)],
      ['Exported', new Date().toLocaleString()],
    ];
    const filename = `CountsFor_${major}_${slugifyFilename(node.label)}.xls`;
    downloadExcelSheet(filename, node.label, headers, rows, metaRows);
    showToast(`Downloaded ${courses.length} courses`);
  },

  _renderLeafCourse(c, major) {
    const fullCourse = lookupCourse(this.courseIndex, c.code) || c;
    const isActive = this.selectedCourse && this.selectedCourse.course_code === c.code;
    const vm = computeViewMode(this.profile);
    const minorMajor = getMinorAsMajorCode(this.profile);

    let dcTag = '';
    if (vm === 'focused-dual' && fullCourse._doubleCounter && minorMajor) {
      const other = (minorMajor === major) ? this.profile.primary : minorMajor;
      if (other) dcTag = `<span class="tr-leaf-tag tr-leaf-tag-${other.toLowerCase()}">${other}</span>`;
    }
    let mpChip = '';
    if (vm === 'cross-program' && (fullCourse._programCount || 0) >= 3) {
      mpChip = `<span class="tr-mp-chip">${fullCourse._programCount} programs</span>`;
    }
    const alsoMajors = (vm !== 'focused-dual' && vm !== 'cross-program') ? getAlsoCountsFor(fullCourse, major) : [];
    const alsoHtml = alsoMajors.length
      ? `<span class="tr-also">${alsoMajors.map(m => `<span class="tr-leaf-tag tr-leaf-tag-${m.toLowerCase()}">${m}</span>`).join('')}</span>`
      : '';

    return `
      <div class="tr-leaf ${isActive ? 'active' : ''}" data-course-code="${esc(c.code)}">
        <span class="tr-leaf-code">${esc(c.code)}</span>
        <span class="tr-leaf-name">${esc(c.name)}</span>
        ${c.units ? `<span class="tr-leaf-units">${c.units}u</span>` : ''}
        ${alsoHtml}${dcTag}${mpChip}
        ${this._renderRowActions(fullCourse)}
      </div>`;
  },

  // ── Per-row inline actions (wishlist + flag) ───────────────
  // Compact, hover-revealed buttons so the row stays clean for everyone but
  // stays one click away for the relevant audience.
  _renderRowActions(course) {
    const acts = [];
    if (isStudent(this.profile)) {
      const saved = this._isInWishlist(course.course_code);
      acts.push(`<button class="tr-leaf-action tr-leaf-wishlist ${saved ? 'is-saved' : ''}" data-action="wishlist" data-course-code="${esc(course.course_code)}" title="${saved ? 'Remove from wishlist' : 'Save for later'}" aria-label="${saved ? 'Remove from wishlist' : 'Save for later'}">${saved ? this._iconBookmarkFilled() : this._iconBookmarkOutline()}</button>`);
    }
    if (canFlagCourses(this.profile)) {
      acts.push(`<button class="tr-leaf-action tr-leaf-flag" data-action="flag" data-course-code="${esc(course.course_code)}" title="Flag course data issue" aria-label="Flag course data issue">${this._iconFlag()}</button>`);
    } else if (isStudent(this.profile) && this._courseHasVisibleFlag(course.course_code)) {
      acts.push(`<span class="tr-leaf-flag-badge" title="Faculty-flagged course">${this._iconFlag()}</span>`);
    }
    if (!acts.length) return '';
    return `<span class="tr-leaf-actions">${acts.join('')}</span>`;
  },

  // Course-card (detail view) actions — wishlist save toggle + flag link.
  // Labeled buttons here (vs icon-only on row) since the card has space.
  // Subtle offering-likelihood pill — appears under a semester header.
  // Silent for 'mixed' and 'unknown' to avoid noise.
  _renderOfferingPredictionHtml(course, season) {
    if (typeof predictOffering !== 'function') return '';
    const pred = predictOffering(course, season);
    if (!pred || pred.state === 'mixed' || pred.state === 'unknown') return '';
    return `
      <div class="cc-offer-pred cc-offer-pred-${pred.state}" title="${esc(pred.reason)}">
        <span class="cc-offer-pred-dot"></span>
        <span>${esc(pred.reason)}</span>
      </div>`;
  },

  _renderCardActions(course) {
    const parts = [];
    if (isStudent(this.profile)) {
      const saved = this._isInWishlist(course.course_code);
      parts.push(`
        <button class="cc-action cc-action-wishlist ${saved ? 'is-saved' : ''}" data-action="wishlist" data-course-code="${esc(course.course_code)}" aria-label="${saved ? 'Remove from saved courses' : 'Save this course for later'}">
          ${saved ? this._iconBookmarkFilled() : this._iconBookmarkOutline()}
          <span>${saved ? 'Saved ✓' : 'Save course'}</span>
        </button>`);
    }
    if (canFlagCourses(this.profile)) {
      parts.push(`
        <button class="cc-action cc-action-flag" data-action="flag" data-course-code="${esc(course.course_code)}" title="Report a data issue with this course" aria-label="Flag course issue">
          ${this._iconFlag()}
          <span>Flag course issue</span>
        </button>`);
    } else if (isStudent(this.profile) && this._courseHasVisibleFlag(course.course_code)) {
      parts.push(`<span class="cc-flag-badge">Faculty flagged · ${esc(this._courseFlagStatus(course.course_code))}</span>`);
    }
    if (!parts.length) return '';
    return `<div class="cc-head-actions">${parts.join('')}</div>`;
  },

  _iconBookmarkOutline() {
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3.5 2.5h9v11l-4.5-3-4.5 3z" stroke-linejoin="round"/></svg>';
  },
  _iconBookmarkFilled() {
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M3.5 2.5h9v11l-4.5-3-4.5 3z"/></svg>';
  },
  _iconFlag() {
    return '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3 2v12"/><path d="M3 2.5h8.5L9.7 5.2 11.5 8H3"/></svg>';
  },

  countFilteredCourses(node) {
    let count = (node.courses || []).filter(c => this.filterByLocation(c)).length;
    if (node.children) {
      for (const child of node.children) {
        count += this.countFilteredCourses(child);
      }
    }
    return count;
  },

  nodeMatchesSearch(node) {
    if (!this.treeSearchQuery) return true;
    const q = this.treeSearchQuery;

    // Check label
    if (node.label.toLowerCase().includes(q)) return true;
    if (node.rawLabel && node.rawLabel.toLowerCase().includes(q)) return true;

    // Check courses
    if (node.courses) {
      for (const c of node.courses) {
        if (c.code.toLowerCase().replace(/-/g, '').includes(q.replace(/-/g, ''))) return true;
        if (c.name && c.name.toLowerCase().includes(q)) return true;
      }
    }

    // Check children recursively
    if (node.children) {
      for (const child of node.children) {
        if (this.nodeMatchesSearch(child)) return true;
      }
    }

    return false;
  },

  // ── Cross-linking ─────────────────────────────────────────
  selectCourseFromTree(code) {
    const course = lookupCourse(this.courseIndex, code);
    if (!course) return;
    this._selectCourse(course);

    // On mobile, switch to lookup lens
    if (window.innerWidth <= 860) {
      this.setMobileLens('lookup');
    }

    // Scroll left panel to top
    const leftBody = document.getElementById('leftBody');
    if (leftBody) leftBody.scrollTop = 0;
  },

  // ══════════════════════════════════════════════════════════
  // WISHLIST (students only)
  // ══════════════════════════════════════════════════════════
  // Storage: localStorage['cf_wishlist'] = [{ course_code, note }, ...]

  _getWishlistItems() {
    const raw = loadStore('cf_wishlist', []);
    return raw.map(x => (typeof x === 'string'
      ? { course_code: x, note: '' }
      : { course_code: x.course_code, note: x.note || '' }));
  },

  _saveWishlistItems(list) {
    saveStore('cf_wishlist', list);
  },

  _getWishlist() {
    return this._getWishlistItems().map(i => i.course_code);
  },

  _saveWishlist(list) {
    const notes = {};
    this._getWishlistItems().forEach(i => { notes[i.course_code] = i.note; });
    this._saveWishlistItems(list.map(code => ({ course_code: code, note: notes[code] || '' })));
  },

  _getWishlistNote(code) {
    const item = this._getWishlistItems().find(i => i.course_code === code);
    return item ? (item.note || '') : '';
  },

  _isInWishlist(code) {
    return this._getWishlistItems().some(i => i.course_code === code);
  },

  async toggleWishlist(code) {
    if (!isStudent(this.profile)) {
      showToast('Wishlist is available to students only.');
      return;
    }
    if (!code) return;
    const list = this._getWishlistItems();
    const idx = list.findIndex(i => i.course_code === code);
    if (idx === -1) {
      list.push({ course_code: code, note: '' });
      this._saveWishlistItems(list);
      if (this.authMode === 'authed') {
        const r = await apiAddWishlist(code);
        if (!r.ok) {
          // Drop the synced flag so next sign-in retries the migration loop.
          try { localStorage.removeItem('cf_synced'); } catch {}
          showToast('Saved locally — sync to server failed.');
        }
      }
      showToast('Saved for later');
    } else {
      list.splice(idx, 1);
      this._saveWishlistItems(list);
      if (this.authMode === 'authed') {
        const r = await apiRemoveWishlist(code);
        if (!r.ok && r.status !== 404) {
          try { localStorage.removeItem('cf_synced'); } catch {}
          showToast('Removed locally — sync to server failed.');
        }
      }
      showToast('Removed from wishlist');
    }
    // Re-render any visible surfaces that show wishlist state
    if (this.selectedCourse && this.selectedCourse.course_code === code) {
      this.renderCourseCard(this.selectedCourse);
    }
    // Quick re-render of leaf rows (affects bookmark fill state)
    this.renderTree();
    // Update the navbar count chip in place
    this._refreshNavWishCount();
    // Re-render home if it's the wishlist view or shows the entry tile
    if (this._homeView === 'wishlist') this.showWishlistView();
    else if (this._homeView === 'home') this.renderLeftEmpty();
  },

  showWishlistView() {
    if (!isStudent(this.profile)) return;
    this._homeView = 'wishlist';
    const el = document.getElementById('leftBody');
    if (!el) return;

    const items = this._getWishlistItems();
    const courses = items
      .map(i => ({ item: i, course: lookupCourse(this.courseIndex, i.course_code) }))
      .filter(x => x.course);

    let rowsHtml;
    if (courses.length === 0) {
      rowsHtml = `
        <div class="wl-empty">
          <div class="wl-empty-icon">${this._iconBookmarkOutline()}</div>
          <div class="wl-empty-title">No saved courses yet</div>
          <div class="wl-empty-hint">Tap the bookmark on any course to save it here for planning later.</div>
        </div>`;
    } else {
      rowsHtml = courses.map(({ item, course: c }) => {
        const flagWarn = this._hasUnavailabilityFlag(c.course_code)
          ? `<span class="wl-warn" title="Flagged by a faculty member as possibly no longer offered">${this._iconWarn()} Possibly unavailable</span>`
          : '';
        const where = [];
        if (c.offered_qatar) where.push('Qatar');
        if (c.offered_pitts) where.push('Pittsburgh');
        return `
          <div class="wl-row" data-course-code="${esc(c.course_code)}">
            <span class="wl-code">${esc(c.course_code)}</span>
            <span class="wl-main">
              <span class="wl-name">${esc(c.course_name)}</span>
              <span class="wl-meta">${c.units || '?'} units${where.length ? ' · ' + where.join(' & ') : ''}${flagWarn ? ' · ' + flagWarn : ''}</span>
              <label class="wl-note-wrap">
                <span class="wl-note-label">Your note</span>
                <textarea class="wl-note-input" data-wl-note="${esc(c.course_code)}" placeholder="Why you saved this course…" rows="2">${esc(item.note || '')}</textarea>
              </label>
            </span>
            <button class="wl-remove" data-action="wishlist" data-course-code="${esc(c.course_code)}" title="Remove from wishlist" aria-label="Remove from wishlist">Remove</button>
          </div>`;
      }).join('');
    }

    el.innerHTML = `
      <div class="wl-view">
        <div class="wl-header">
          <button class="dc-back-link" onclick="App.renderLeftEmpty()">← Back to home</button>
          <div class="wl-title">Saved courses${courses.length ? ` <span class="wl-count">· ${courses.length}</span>` : ''}</div>
          <p class="wl-hint">Add a note on each course — faculty advisors can read these when you share favorites.</p>
        </div>
        <div class="wl-list">${rowsHtml}</div>
      </div>
    `;
    this._bindWishlistNoteInputs(el);
  },

  _bindWishlistNoteInputs(container) {
    if (!container) return;
    container.querySelectorAll('.wl-note-input').forEach(ta => {
      if (ta.dataset.wlBound) return;
      ta.dataset.wlBound = '1';
      ta.addEventListener('click', e => e.stopPropagation());
      ta.addEventListener('mousedown', e => e.stopPropagation());
      let timer;
      const persist = () => this._saveWishlistNote(ta.dataset.wlNote, ta.value);
      ta.addEventListener('blur', persist);
      ta.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(persist, 700);
      });
    });
  },

  async _saveWishlistNote(code, note) {
    const items = this._getWishlistItems();
    const idx = items.findIndex(i => i.course_code === code);
    if (idx === -1) return;
    items[idx].note = (note || '').trim();
    this._saveWishlistItems(items);
    if (this.authMode === 'authed') {
      const r = await apiUpdateWishlistNote(code, items[idx].note);
      if (!r.ok) {
        try { localStorage.removeItem('cf_synced'); } catch {}
        showToast('Note saved on this device — could not sync to server.');
      }
    }
  },

  async showStudentFlagsView() {
    if (!isStudent(this.profile) || this.authMode !== 'authed') return;
    this._homeView = 'studentflags';
    const el = document.getElementById('leftBody');
    if (!el) return;
    await this._loadServerFlags();
    const items = this.serverFlags || [];
    const rows = items.length
      ? items.map(f => `
        <div class="adm-row adm-row-readonly">
          <div class="adm-course"><span class="adm-course-code">${esc(f.course_code)}</span><span class="adm-course-name">${esc(f.course_name)}</span></div>
          <span class="adm-status adm-status-${esc(f.status)}">${esc(f.status)}</span>
          <div class="adm-reason">${esc(f.reason_label)}</div>
          ${f.admin_notes ? `<div class="adm-notes adm-notes-admin">${esc(f.admin_notes)}</div>` : ''}
        </div>`).join('')
      : '<div class="empty-state"><div class="empty-text">No flagged courses right now.</div></div>';
    el.innerHTML = `
      <div class="adm-view">
        <div class="adm-header">
          <button class="dc-back-link" onclick="App.renderLeftEmpty()">← Back to home</button>
          <div class="adm-title">Flagged courses <span class="adm-count">· ${items.length}</span></div>
        </div>
        <p class="adm-hint">Read-only — students cannot submit flags. Faculty report and resolve issues.</p>
        <div class="adm-list">${rows}</div>
      </div>`;
  },

  async showStudentFavorites() {
    if (!isFaculty(this.profile) || this.authMode !== 'authed') {
      showToast('Faculty access required.');
      return;
    }
    this._homeView = 'studentfavs';
    const el = document.getElementById('leftBody');
    if (!el) return;
    el.innerHTML = '<div class="empty-state"><div class="spinner"></div><div class="empty-text" style="margin-top:12px">Loading student favorites…</div></div>';
    const r = await apiGetWishlistRoster();
    if (!r.ok) {
      el.innerHTML = `<div class="empty-state"><div class="empty-text">Could not load favorites: ${esc((r.data && r.data.message) || 'error')}</div></div>`;
      return;
    }
    const students = (r.data && r.data.students) || [];
    const blocks = students.length ? students.map(s => {
      const rows = (s.items || []).map(i => `
        <li><strong>${esc(i.course_code)}</strong>${i.note ? ` — <em>${esc(i.note)}</em>` : ''}</li>`).join('') || '<li class="sf-empty">No saved courses</li>';
      return `
        <div class="sf-student">
          <div class="sf-student-head"><strong>${esc(s.name)}</strong> <span class="sf-email">${esc(s.email)}</span>${s.primary_program ? ` · ${esc(s.primary_program)}` : ''}</div>
          <ul class="sf-courses">${rows}</ul>
        </div>`;
    }).join('') : '<div class="empty-state"><div class="empty-text">No students have saved courses yet.</div></div>';
    el.innerHTML = `
      <div class="adm-view">
        <div class="adm-header">
          <button class="dc-back-link" onclick="App.renderLeftEmpty()">← Back to home</button>
          <div class="adm-title">Student favorites <span class="adm-count">· ${students.length} students</span></div>
        </div>
        <div class="sf-list">${blocks}</div>
      </div>`;
  },

  // ══════════════════════════════════════════════════════════
  // COURSE FLAGGING (faculty only)
  // ══════════════════════════════════════════════════════════
  // Reasons are codified so admin review tooling can group/filter later.

  FLAG_REASONS: [
    { code: 'not_offered',         label: 'Course is no longer offered' },
    { code: 'campus_wrong',        label: 'Course campus availability is incorrect',         hint: 'Listed for the wrong campus (Doha / Pittsburgh).' },
    { code: 'metadata_outdated',   label: 'Course title, number, or units are outdated' },
    { code: 'prereq_wrong',        label: 'Prerequisites or corequisites are incorrect/missing' },
    { code: 'requirement_mismatch',label: 'Course is mapped to the wrong requirement/category', hint: 'Counting under the wrong major/minor requirement.' },
    { code: 'requirement_newly_counts', label: 'This course now counts toward a requirement it did not count for previously.' },
    { code: 'should_be_equivalent',label: 'Course should be added as an equivalent/substitute option' },
    { code: 'wrong_semester',      label: 'Course is listed as available in the wrong semester/year' },
    { code: 'restrictions_missing',label: 'Course restrictions are missing or incorrect',     hint: 'Permission required, major-only, class-year restriction, etc.' },
    { code: 'duplicate',           label: 'Duplicate or conflicting course entry' },
    { code: 'other',               label: 'Other issue' },
  ],

  _getFlags() {
    return loadStore('cf_flags', []);
  },
  _saveFlags(list) {
    saveStore('cf_flags', list);
  },
  _hasUnavailabilityFlag(code) {
    const flags = (this.serverFlags && this.serverFlags.length)
      ? this.serverFlags
      : this._getFlags();
    return flags.some(f =>
      f.course_code === code &&
      (f.reason_code === 'not_offered' || f.reason_code === 'campus_wrong') &&
      f.status !== 'dismissed'
    );
  },

  _courseHasVisibleFlag(code) {
    const flags = this.serverFlags || [];
    return flags.some(f => f.course_code === code && f.status !== 'dismissed');
  },

  _courseFlagStatus(code) {
    const f = (this.serverFlags || []).find(x => x.course_code === code && x.status !== 'dismissed');
    return f ? f.status : '';
  },

  openFlagModal(courseCode) {
    if (!canFlagCourses(this.profile)) {
      showToast('Only faculty can flag course issues.');
      return;
    }
    if (this.authMode !== 'authed') {
      showToast('Sign in to flag a course.');
      return;
    }
    const course = lookupCourse(this.courseIndex, courseCode);
    if (!course) return;
    this._flagModalState = { courseCode, reason: null, notes: '' };

    const reasonItems = this.FLAG_REASONS.map(r => `
      <label class="cf-flag-reason">
        <input type="radio" name="cfReason" value="${r.code}">
        <span class="cf-flag-reason-text">
          <span class="cf-flag-reason-label">${esc(r.label)}</span>
          ${r.hint ? `<span class="cf-flag-reason-hint">${esc(r.hint)}</span>` : ''}
        </span>
      </label>
    `).join('');

    const modal = document.createElement('div');
    modal.className = 'cf-modal-backdrop';
    modal.id = 'cfFlagModalRoot';
    modal.innerHTML = `
      <div class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cfFlagTitle">
        <header class="cf-modal-head">
          <div>
            <h3 id="cfFlagTitle" class="cf-modal-title">Flag a course</h3>
            <div class="cf-modal-sub">Help us keep course data accurate. Any faculty member can review and resolve flags.</div>
          </div>
          <button class="cf-modal-x" aria-label="Close" onclick="App.closeFlagModal()">×</button>
        </header>
        <div class="cf-modal-body">
          <div class="cf-modal-course">
            <span class="cf-modal-course-code">${esc(course.course_code)}</span>
            <span class="cf-modal-course-name">${esc(course.course_name)}</span>
          </div>
          <fieldset class="cf-flag-fieldset">
            <legend class="cf-flag-legend">What's the issue?</legend>
            <div class="cf-flag-reasons">${reasonItems}</div>
          </fieldset>
          <label class="cf-flag-notes-wrap">
            <span class="cf-flag-notes-label">Additional context <span class="cf-flag-notes-opt">— optional</span></span>
            <textarea class="cf-flag-notes" id="cfFlagNotes" placeholder="Anything else admins should know — e.g., 'Last offered Spring 2024 in Doha.'"></textarea>
          </label>
          <div class="cf-flag-attribution">
            <strong>Filed as:</strong> ${esc(getRoleLabel(this.profile))}${this.profile.primary ? ' · ' + esc(this.profile.primary) : ''}
          </div>
        </div>
        <footer class="cf-modal-foot">
          <button class="cf-btn cf-btn-secondary" onclick="App.closeFlagModal()">Cancel</button>
          <button class="cf-btn cf-btn-primary" id="cfFlagSubmit" disabled onclick="App.submitFlag()">Submit flag</button>
        </footer>
      </div>
    `;
    document.body.appendChild(modal);

    // Wire up reason selection → enables submit
    modal.addEventListener('change', (e) => {
      if (e.target.name === 'cfReason') {
        this._flagModalState.reason = e.target.value;
        const btn = document.getElementById('cfFlagSubmit');
        if (btn) btn.disabled = false;
      }
    });
    modal.addEventListener('input', (e) => {
      if (e.target.id === 'cfFlagNotes') this._flagModalState.notes = e.target.value;
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeFlagModal();
    });
  },

  closeFlagModal() {
    const root = document.getElementById('cfFlagModalRoot');
    if (root) root.remove();
    this._flagModalState = null;
  },

  async submitFlag() {
    const s = this._flagModalState;
    if (!s || !s.reason) return;
    const course = lookupCourse(this.courseIndex, s.courseCode);
    if (!course) return;

    const reasonMeta = this.FLAG_REASONS.find(r => r.code === s.reason);
    const flag = {
      id: 'flg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      course_code: course.course_code,
      course_name: course.course_name,
      reason_code: s.reason,
      reason_label: reasonMeta ? reasonMeta.label : s.reason,
      notes: (s.notes || '').trim(),
      role: this.profile.role,
      role_label: getRoleLabel(this.profile),
      primary: this.profile.primary || null,
      secondary: this.profile.secondary || null,
      timestamp: Date.now(),
      status: 'pending',
    };

    // Persist locally first so the action is reflected even if the network
    // is slow / offline — the server submission is best-effort sync.
    const flags = this._getFlags();
    flags.push(flag);
    this._saveFlags(flags);

    let toast = 'Flag submitted — admins will review';
    if (this.authMode === 'authed') {
      const r = await apiCreateFlag(flag);
      if (!r.ok) {
        try { localStorage.removeItem('cf_synced'); } catch {}
        toast = 'Saved locally — sync to server failed (will retry next sign-in).';
      }
    } else {
      toast = 'Flag saved (offline) — sign in to submit for admin review.';
    }

    this.closeFlagModal();
    showToast(toast);
    this.renderTree();
  },

  // ══════════════════════════════════════════════════════════
  // FACULTY — Staff directory (Postgres + JSON merge)
  // ══════════════════════════════════════════════════════════
  _staffDirState: { items: [], form: { name: '', email: '', role: 'professor', department: '', primary_program: '' } },

  _staffInitials(name, email) {
    const src = (name || email || '?').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return src.slice(0, 2).toUpperCase();
  },

  _avatarHtml(name, email, pictureUrl) {
    const initials = this._staffInitials(name, email);
    if (pictureUrl) {
      return `<div class="person-avatar" aria-hidden="true">
        <img class="person-avatar-img" src="${esc(pictureUrl)}" alt="" loading="lazy" decoding="async"
          onerror="this.classList.add('person-avatar-img--hidden'); this.nextElementSibling.classList.add('person-avatar-fallback--show');">
        <span class="person-avatar-fallback">${esc(initials)}</span>
      </div>`;
    }
    const imgSrc = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(name || email) + '&background=C41230&color=fff&size=80&bold=true';
    return `<div class="person-avatar" aria-hidden="true">
      <img class="person-avatar-img" src="${esc(imgSrc)}" alt="" loading="lazy" decoding="async"
        onerror="this.classList.add('person-avatar-img--hidden'); this.nextElementSibling.classList.add('person-avatar-fallback--show');">
      <span class="person-avatar-fallback">${esc(initials)}</span>
    </div>`;
  },

  _staffAvatarHtml(name, email, pictureUrl) {
    return this._avatarHtml(name, email, pictureUrl);
  },

  _directoryPanelOpen: false,

  closeDirectoryPanel() {
    if (!this._directoryPanelOpen) return;
    this._directoryPanelOpen = false;
    const root = document.getElementById('directoryPanelRoot');
    if (!root) return;
    root.hidden = true;
    root.innerHTML = '';
    root.onclick = null;
  },

  toggleDirectoryPanel() {
    if (!canManageDirectory(this.profile) || this.authMode !== 'authed') return;
    if (this._directoryPanelOpen) {
      this.closeDirectoryPanel();
      return;
    }
    this._directoryPanelOpen = true;
    const root = document.getElementById('directoryPanelRoot');
    if (!root) return;
    root.hidden = false;
    root.innerHTML = '<div class="directory-panel"><div class="empty-state"><div class="spinner"></div></div></div>';
    root.onclick = (e) => {
      if (!e.target.closest('.directory-panel')) this.closeDirectoryPanel();
    };
    this._loadDirectoryPanel();
  },

  async _loadDirectoryPanel() {
    const r = await apiListStaffDirectory();
    const root = document.getElementById('directoryPanelRoot');
    if (!root || !this._directoryPanelOpen) return;
    if (!r.ok) {
      root.innerHTML = `<div class="directory-panel"><p class="empty-text">${esc((r.data && r.data.message) || 'Could not load directory.')}</p></div>`;
      return;
    }
    this._staffDirState.items = r.data.items || [];
    this._renderDirectoryPanel();
  },

  _renderDirectoryPanel() {
    const root = document.getElementById('directoryPanelRoot');
    if (!root) return;
    const items = this._staffDirState.items;
    const f = this._staffDirState.form;
    const roleOpts = ['advisor', 'professor', 'area_head', 'associate_area_head', 'admin']
      .map(r => `<option value="${r}" ${f.role === r ? 'selected' : ''}>${esc((ROLE_META[r] && ROLE_META[r].label) || r)}</option>`).join('');
    const deptOpts = DEPARTMENT_LIST.map(d => `<option value="${esc(d)}" ${f.department === d ? 'selected' : ''}>${esc(d)}</option>`).join('');
    const progOpts = VALID_PROGRAMS.map(p => `<option value="${p}" ${f.primary_program === p ? 'selected' : ''}>${esc(getProgramLabel(p))}</option>`).join('');
    const rows = items.map(row => `
      <div class="staff-row">
        ${this._staffAvatarHtml(row.name, row.email, row.picture_url)}
        <div class="staff-row-body">
          <div class="staff-row-name">${esc(row.name)}</div>
          <div class="staff-row-meta">${esc(row.email)} · ${esc((ROLE_META[row.role] && ROLE_META[row.role].label) || row.role)} · ${esc(row.department || '')}${row.primary_program ? ' · ' + esc(getProgramLabel(row.primary_program)) : ''}</div>
        </div>
        <div class="staff-row-actions">
          <button type="button" class="adm-btn" onclick="App._editDirectoryRow('${esc(row.email)}')">Edit</button>
          <button type="button" class="adm-btn" onclick="App._revokeDirectoryRow('${esc(row.email)}', '${esc(row.name)}')">Remove</button>
        </div>
      </div>`).join('') || '<p class="empty-text">No elevated access entries yet.</p>';

    root.innerHTML = `
      <div class="directory-panel" role="dialog" aria-label="Directory management">
        <header class="directory-panel-head">
          <h3>Directory</h3>
          <button type="button" class="directory-panel-close" onclick="App.toggleDirectoryPanel()" aria-label="Close">×</button>
        </header>
        <div class="staff-add-card">
          <div class="staff-add-title">${f.editEmail ? 'Edit person' : 'Add person'}</div>
          <div class="staff-add-fields">
            <label>Name<input class="adm-search" id="staffAddName" value="${esc(f.name)}" placeholder="Full name" /></label>
            <label>Email<input class="adm-search" id="staffAddEmail" value="${esc(f.email)}" placeholder="name@andrew.cmu.edu" ${f.editEmail ? 'readonly' : ''} /></label>
            <label>Role<select class="adm-select" id="staffAddRole">${roleOpts}</select></label>
            <label>Department<select class="adm-select" id="staffAddDept"><option value="">—</option>${deptOpts}</select></label>
            <label>Program<select class="adm-select" id="staffAddProgram"><option value="">—</option>${progOpts}</select></label>
          </div>
          <button class="adm-btn adm-btn-resolve" onclick="App._submitDirectoryForm()">${f.editEmail ? 'Save changes' : 'Add to directory'}</button>
          ${f.editEmail ? '<button type="button" class="adm-btn" onclick="App._staffDirState.form={name:\'\',email:\'\',role:\'professor\',department:\'\',primary_program:\'\'};App._renderDirectoryPanel()">Cancel edit</button>' : ''}
        </div>
        <div class="staff-list">${rows}</div>
      </div>`;
  },

  _editDirectoryRow(email) {
    const row = (this._staffDirState.items || []).find(r => r.email === email);
    if (!row) return;
    this._staffDirState.form = {
      name: row.name,
      email: row.email,
      editEmail: row.email,
      role: row.role,
      department: row.department || '',
      primary_program: row.primary_program || '',
    };
    this._renderDirectoryPanel();
  },

  async _revokeDirectoryRow(email, name) {
    if (!confirm('Remove elevated access for ' + email + '?')) return;
    const r = await apiRevokeDirectoryAccess({ email, name });
    if (!r.ok) {
      showToast((r.data && r.data.message) || 'Could not remove.');
      return;
    }
    showToast('Access updated.');
    await this._loadDirectoryPanel();
  },

  async _submitDirectoryForm() {
    const f = this._staffDirState.form;
    const body = {
      name: (document.getElementById('staffAddName')?.value || '').trim(),
      email: (document.getElementById('staffAddEmail')?.value || '').trim(),
      role: document.getElementById('staffAddRole')?.value || 'professor',
      department: document.getElementById('staffAddDept')?.value || '',
      primary_program: document.getElementById('staffAddProgram')?.value || '',
    };
    const r = f.editEmail
      ? await apiUpsertDirectoryByEmail(body)
      : await apiAddStaffMember(body);
    if (!r.ok) {
      showToast((r.data && r.data.message) || 'Could not save.');
      return;
    }
    showToast(f.editEmail ? 'Directory updated.' : 'Person added — they get faculty access on next login.');
    this._staffDirState.form = { name: '', email: '', role: 'professor', department: '', primary_program: '' };
    await this._loadDirectoryPanel();
  },

  // ══════════════════════════════════════════════════════════
  // ADMIN — User role management
  // ══════════════════════════════════════════════════════════
  _userAdminState: { items: [], search: '' },

  async showUserManagement() {
    if (!canManageUsers(this.authedUser)) {
      showToast('Admin access required.');
      return;
    }
    this._homeView = 'users';
    const el = document.getElementById('leftBody');
    if (!el) return;
    el.innerHTML = '<div class="empty-state"><div class="spinner"></div><div class="empty-text" style="margin-top:12px">Loading users…</div></div>';
    await this._loadUserAdmin();
  },

  async _loadUserAdmin() {
    const q = this._userAdminState.search ? 'search=' + encodeURIComponent(this._userAdminState.search) : '';
    const r = await apiListUsers(q);
    const el = document.getElementById('leftBody');
    if (!r.ok) {
      if (el) el.innerHTML = `<div class="empty-state"><div class="empty-text">Could not load users: ${esc((r.data && r.data.message) || r.error || 'error')}</div></div>`;
      return;
    }
    this._userAdminState.items = r.data.items || [];
    this._renderUserAdmin();
  },

  _renderUserAdmin() {
    const el = document.getElementById('leftBody');
    if (!el) return;
    const items = this._userAdminState.items;
    const rows = items.length === 0
      ? '<div class="empty-state"><div class="empty-text">No users found.</div></div>'
      : items.map(u => this._renderUserAdminRow(u)).join('');

    el.innerHTML = `
      <div class="adm-view">
        <div class="adm-header">
          <button class="dc-back-link" onclick="App.renderLeftEmpty()">← Back to home</button>
          <div class="adm-title">User roles <span class="adm-count">· ${items.length}</span></div>
        </div>
        <div class="adm-search-row">
          <input type="search" class="adm-search" placeholder="Search by email or name" value="${esc(this._userAdminState.search)}"
            onkeydown="if(event.key==='Enter'){App._userAdminState.search=this.value;App._loadUserAdmin();}" />
          <button class="adm-btn" onclick="App._userAdminState.search=document.querySelector('.adm-search').value;App._loadUserAdmin();">Search</button>
        </div>
        <div class="adm-list">${rows}</div>
      </div>
    `;
  },

  _renderUserAdminRow(u) {
    const rg = getRoleGroup(u);
    const isStudent = rg === 'student';
    const progLabel = getProgramLabel(u.primary_program) || u.primary_program || '—';
    const minors = Array.isArray(u.minor_codes) ? u.minor_codes : (u.minor_code ? [u.minor_code] : []);
    const minorSummary = minors.length ? minors.map(mc => getMinorLabel(mc)).join(', ') : '';
    const summary = isStudent
      ? `${esc(u.name)} · student · ${esc(u.primary_program || '—')}${minorSummary ? ' · minors ' + esc(minorSummary) : ''}`
      : `${esc(u.name)} · ${esc(u.role)} · ${esc(progLabel)}`;
    const roleOpts = ['student', 'professor', 'area_head', 'associate_area_head', 'advisor', 'admin']
      .map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${esc((ROLE_META[r] && ROLE_META[r].label) || r)}</option>`)
      .join('');
    const majorOpts = MAJOR_LIST.map(m => `<option value="${m}" ${u.primary_program === m ? 'selected' : ''}>${m}</option>`).join('');
    const programOpts = VALID_PROGRAMS.map(p => `<option value="${p}" ${u.primary_program === p ? 'selected' : ''}>${esc(getProgramLabel(p))}</option>`).join('');
    const deptOpts = DEPARTMENT_LIST.map(d => `<option value="${esc(d)}" ${u.department === d ? 'selected' : ''}>${esc(d)}</option>`).join('');
    const minorChips = minors.map(mc => `
      <span class="adm-minor-chip" data-code="${esc(mc)}">${esc(getMinorLabel(mc))}
        <button type="button" class="adm-minor-chip-x" onclick="App._adminRemoveMinor(${u.id}, '${esc(mc)}')">×</button>
      </span>`).join('');
    const minorAddOpts = MINOR_LIST.filter(m => !minors.includes(m.code))
      .map(m => `<option value="${m.code}">${esc(m.label)}</option>`).join('');
    const studentFields = `
          <label>Major<select class="adm-select" id="major-${u.id}"><option value="">—</option>${majorOpts}</select></label>
          <label>Minor(s)<div class="adm-minor-chips" id="minors-${u.id}">${minorChips || '<span class="adm-minor-empty">—</span>'}</div>
            <select class="adm-select adm-minor-add" id="minor-add-${u.id}" onchange="App._adminAddMinor(${u.id}, this.value); this.value='';">
              <option value="">Add minor…</option>${minorAddOpts}
            </select></label>`;
    const facultyFields = `
          <label>Department<select class="adm-select" id="dept-${u.id}"><option value="">—</option>${deptOpts}</select></label>
          <label>Program<select class="adm-select" id="program-${u.id}"><option value="">—</option>${programOpts}</select></label>`;
    return `
      <div class="adm-row adm-user-row" data-user-id="${u.id}">
        <div class="adm-row-head">
          <div>
            <div class="adm-course-code">${esc(u.email)}</div>
            <div class="adm-course-name">${summary}</div>
          </div>
        </div>
        <div class="adm-user-fields">
          <label>Role<select class="adm-select" id="role-${u.id}">${roleOpts}</select></label>
          <div id="role-fields-${u.id}">${isStudent ? studentFields : facultyFields}</div>
        </div>
        <div class="adm-actions">
          <button class="adm-btn adm-btn-resolve" onclick="App._saveUserAdmin(${u.id})">Save</button>
        </div>
      </div>`;
  },

  _adminMinorCodes(userId) {
    const chipRoot = document.getElementById('minors-' + userId);
    if (!chipRoot) return [];
    return [...chipRoot.querySelectorAll('.adm-minor-chip')].map(el => el.getAttribute('data-code')).filter(Boolean);
  },

  _adminAddMinor(userId, code) {
    if (!code) return;
    const codes = this._adminMinorCodes(userId);
    if (codes.includes(code)) return;
    codes.push(code);
    this._renderAdminMinorChips(userId, codes);
  },

  _adminRemoveMinor(userId, code) {
    const codes = this._adminMinorCodes(userId).filter(c => c !== code);
    this._renderAdminMinorChips(userId, codes);
  },

  _renderAdminMinorChips(userId, codes) {
    const chipRoot = document.getElementById('minors-' + userId);
    if (!chipRoot) return;
    chipRoot.innerHTML = codes.length
      ? codes.map(mc => `<span class="adm-minor-chip" data-code="${esc(mc)}">${esc(getMinorLabel(mc))}
        <button type="button" class="adm-minor-chip-x" onclick="App._adminRemoveMinor(${userId}, '${esc(mc)}')">×</button></span>`).join('')
      : '<span class="adm-minor-empty">—</span>';
    const addEl = document.getElementById('minor-add-' + userId);
    if (addEl) {
      addEl.innerHTML = '<option value="">Add minor…</option>' + MINOR_LIST.filter(m => !codes.includes(m.code))
        .map(m => `<option value="${m.code}">${esc(m.label)}</option>`).join('');
    }
  },

  async _saveUserAdmin(userId) {
    const roleEl = document.getElementById('role-' + userId);
    const role = roleEl ? roleEl.value : 'student';
    const patch = { role };
    if (getRoleGroup(role) === 'student') {
      const majorEl = document.getElementById('major-' + userId);
      patch.primary_program = majorEl ? majorEl.value : undefined;
      patch.minor_codes = this._adminMinorCodes(userId);
      patch.department = null;
    } else {
      const deptEl = document.getElementById('dept-' + userId);
      const progEl = document.getElementById('program-' + userId);
      patch.department = deptEl ? deptEl.value : undefined;
      patch.primary_program = progEl ? progEl.value : undefined;
      patch.minor_codes = [];
    }
    const r = await apiPatchUser(userId, patch);
    if (!r.ok) {
      showToast((r.data && r.data.message) || 'Could not save user.');
      return;
    }
    showToast('User updated.');
    await this._loadUserAdmin();
  },

  // ══════════════════════════════════════════════════════════
  // ADMIN — Flag review
  // ══════════════════════════════════════════════════════════
  _adminState: { status: 'pending', items: [], total: 0 },

  async showFlagReview() {
    if (!canFlagCourses(this.profile)) {
      showToast('Faculty access required.');
      return;
    }
    this._homeView = 'admin';
    const el = document.getElementById('leftBody');
    if (!el) return;
    el.innerHTML = '<div class="empty-state"><div class="spinner"></div><div class="empty-text" style="margin-top:12px">Loading flag review…</div></div>';
    await this._loadFlagReview();
  },

  async _loadFlagReview() {
    const s = this._adminState;
    const r = await apiListFlags('status=' + encodeURIComponent(s.status) + '&limit=100');
    if (!r.ok) {
      const el = document.getElementById('leftBody');
      if (el) el.innerHTML = `<div class="empty-state"><div class="empty-text">Could not load flags: ${esc((r.data && r.data.message) || r.error || 'error')}</div></div>`;
      return;
    }
    s.items = r.data.items || [];
    s.total = r.data.total || 0;
    this._renderFlagReview();
  },

  _renderFlagReview() {
    const el = document.getElementById('leftBody');
    if (!el) return;
    const s = this._adminState;

    const tab = (status, label) => `
      <button class="adm-tab ${s.status === status ? 'active' : ''}" onclick="App._switchFlagStatus('${status}')">${label}</button>
    `;

    const rowsHtml = s.items.length === 0
      ? `<div class="empty-state"><div class="empty-text">No flags with status “${esc(s.status)}”.</div></div>`
      : s.items.map(f => this._renderFlagRow(f)).join('');

    el.innerHTML = `
      <div class="adm-view">
        <div class="adm-header">
          <button class="dc-back-link" onclick="App.renderLeftEmpty()">← Back to home</button>
          <div class="adm-title">Flag review <span class="adm-count">· ${s.total}</span></div>
        </div>
        <div class="adm-tabs">
          ${tab('pending',   'Pending')}
          ${tab('reviewed',  'Reviewed')}
          ${tab('resolved',  'Resolved')}
          ${tab('dismissed', 'Dismissed')}
        </div>
        <div class="adm-list">${rowsHtml}</div>
      </div>
    `;
  },

  _renderFlagRow(f, opts = {}) {
    const readOnly = !!opts.readOnly;
    const when = f.created_at ? new Date(f.created_at).toLocaleDateString() : '';
    const submitter = `${esc(f.submitted_by_name || f.submitted_by_email || 'Unknown')} <span class="adm-role">· ${esc(f.submitted_by_role || '')}${f.submitted_program ? ' · ' + esc(f.submitted_program) : ''}</span>`;
    const notes = f.notes ? `<div class="adm-notes"><strong>Notes:</strong> ${esc(f.notes)}</div>` : '';
    const adminNotes = f.admin_notes ? `<div class="adm-notes adm-notes-admin"><strong>Admin:</strong> ${esc(f.admin_notes)}</div>` : '';
    // Read-only rows (faculty "My flags") show status + admin feedback but no
    // review controls — only admins can change a flag's state.
    const actions = readOnly ? '' : ((f.status === 'pending' || f.status === 'reviewed') ? `
      <div class="adm-actions">
        <button class="adm-btn adm-btn-resolve"  onclick="App._setFlagStatus('${esc(f.id)}','resolved')">Resolve</button>
        <button class="adm-btn adm-btn-review"   onclick="App._setFlagStatus('${esc(f.id)}','reviewed')">Mark reviewed</button>
        <button class="adm-btn adm-btn-dismiss"  onclick="App._setFlagStatus('${esc(f.id)}','dismissed')">Dismiss</button>
        <button class="adm-btn adm-btn-note"     onclick="App._promptFlagNote('${esc(f.id)}')">Add note…</button>
      </div>` : `
      <div class="adm-actions">
        <button class="adm-btn" onclick="App._setFlagStatus('${esc(f.id)}','pending')">Reopen as pending</button>
        <button class="adm-btn adm-btn-note" onclick="App._promptFlagNote('${esc(f.id)}')">Add note…</button>
      </div>`);
    return `
      <div class="adm-row">
        <div class="adm-row-head">
          <div class="adm-course">
            <span class="adm-course-code">${esc(f.course_code)}</span>
            <span class="adm-course-name">${esc(f.course_name)}</span>
          </div>
          <span class="adm-status adm-status-${esc(f.status)}">${esc(f.status)}</span>
        </div>
        <div class="adm-reason">${esc(f.reason_label || f.reason_code)}</div>
        ${notes}
        ${adminNotes}
        <div class="adm-meta">By ${submitter} · ${esc(when)}</div>
        ${actions}
      </div>`;
  },

  async _switchFlagStatus(status) {
    this._adminState.status = status;
    await this._loadFlagReview();
  },

  async _setFlagStatus(id, status) {
    const r = await apiUpdateFlag(id, { status });
    if (!r.ok) {
      showToast((r.data && r.data.message) || 'Update failed.');
      return;
    }
    showToast('Flag marked ' + status);
    await this._loadFlagReview();
  },

  async _promptFlagNote(id) {
    const note = window.prompt('Admin note for this flag (leave empty to clear):', '');
    if (note === null) return;  // cancelled
    const r = await apiUpdateFlag(id, { admin_notes: note });
    if (!r.ok) {
      showToast((r.data && r.data.message) || 'Update failed.');
      return;
    }
    showToast('Note saved');
    await this._loadFlagReview();
  },

  _iconWarn() {
    return '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M8 1.5l7 13H1l7-13zM8 6v4M8 11.5v.5" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>';
  },

  navigateToReqNode(major, fullPath) {
    // Switch to the right major
    if (this.activeMajor !== major) {
      this.activeMajor = major;
      document.querySelectorAll('.major-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.major === major);
      });
      this.autoExpandFirstLevel(major);
    }

    // Expand the path to this node
    const parts = fullPath.split('---');
    let pathSoFar = '';
    for (const part of parts) {
      pathSoFar = pathSoFar ? pathSoFar + '---' + part : part;
      this.expandedNodes.add(major + '::' + pathSoFar);
    }

    // Set highlight
    this.highlightedPath = fullPath;
    setTimeout(() => { this.highlightedPath = null; }, 2500);

    // On mobile, switch to map lens
    if (window.innerWidth <= 860) {
      this.setMobileLens('map');
    }

    this.renderTree();

    // Scroll to highlighted node
    setTimeout(() => {
      const highlighted = document.querySelector('.tr-card-head.highlighted, .tr-sub-row.highlighted');
      if (highlighted) {
        highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  },
};

// ── Bootstrap ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('cf_theme') && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    App.theme = 'dark';
  }
  App.init();
});
