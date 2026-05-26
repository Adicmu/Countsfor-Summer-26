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
  theme: loadStore('cf_theme', 'light'),
  expandedNodes: new Set(),
  highlightedPath: null,
  mobileLens: 'lookup', // 'lookup' | 'map'

  profile: null,

  // ── Init ──────────────────────────────────────────────────
  async init() {
    this.applyTheme();
    this.profile = loadProfile();
    if (!this.profile) {
      this.renderOnboarding(false);
      return;
    }
    if (this.profile.primary && this.profile.primary !== 'AS') {
      this.activeMajor = this.profile.primary;
    }
    this.renderShell();
    this.bindGlobalEvents();
    await this.loadData();
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

      // Profile-aware annotations
      annotateDoubleCounters(this.courses, this.profile);
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
    role: null,         // precise role (area_head vs associate_area_head distinct)
    roleGroup: null,    // 'student' | 'faculty' — top-level toggle
    facultyGroup: null, // 'professor' | 'area_lead' | 'advisor' — under faculty
    scope: null,        // advisor scope: 'major'|'minor'|'arts_sciences'|'all_programs'
    primary: null,
    secondary: null,
    isEdit: false,
  },

  renderOnboarding(isEdit) {
    const p = this.profile;
    const existingRole = p ? p.role : null;
    const grp = existingRole ? getRoleGroup(existingRole) : null;
    this._onboardingState = {
      role:         existingRole,
      roleGroup:    existingRole ? (existingRole === 'student' ? 'student' : 'faculty') : null,
      facultyGroup: (grp && grp !== 'student') ? grp : null,
      scope:        (p && p.scope) || null,
      primary:      p ? p.primary : null,
      secondary:    p ? p.secondary : null,
      isEdit: !!isEdit,
    };
    this._renderOnboardingScreen();
  },

  _renderOnboardingScreen() {
    const s = this._onboardingState;

    const groupSel       = (g) => s.roleGroup === g ? 'selected' : '';
    const facultyGrpSel  = (g) => s.facultyGroup === g ? 'selected' : '';
    const subroleSel     = (r) => s.role === r ? 'selected' : '';
    const scopeSel       = (sc) => s.scope === sc ? 'selected' : '';
    const majorSel       = (m) => s.primary === m ? 'selected' : '';

    const showFacultySubgroups = s.roleGroup === 'faculty';
    const showAreaSubrole      = s.facultyGroup === 'area_lead';
    const showAdvisorScope     = s.facultyGroup === 'advisor';
    const showProfessorPicker  = s.facultyGroup === 'professor';
    const showAreaPicker       = s.facultyGroup === 'area_lead' && !!s.role;  // wait for subrole

    // Major picker visible for: student, professor, area_lead (after subrole), advisor major scope
    const showMajorPicker =
      s.roleGroup === 'student' ||
      showProfessorPicker ||
      showAreaPicker ||
      (showAdvisorScope && s.scope === 'major');

    const showASOption = showProfessorPicker || showAreaPicker; // AS only for prof and area_lead

    const showMinorSelect =
      (s.roleGroup === 'student' && !!s.primary) ||
      (showAdvisorScope && s.scope === 'minor');

    // Validation — drives Continue button enablement.
    const candidate = {
      role: s.role,
      primary: s.primary,
      secondary: s.roleGroup === 'student' ? s.secondary : null,
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

    // Minor picker — same select used by student and advisor-minor scope
    const minorOptions = MINOR_LIST.map(m => {
      // Only disable matching minor for students (collision rule).
      const disabled = (s.roleGroup === 'student' && MAJOR_TO_MINOR_CODE[s.primary] === m.code) ? 'disabled' : '';
      const value = s.roleGroup === 'student' ? s.secondary : s.primary;
      const sel = value === m.code ? 'selected' : '';
      return `<option value="${m.code}" ${disabled} ${sel}>${esc(m.label)}</option>`;
    }).join('');

    const minorOnChange = (s.roleGroup === 'student') ? 'App._obPickMinor(this.value)' : 'App._obPickMinor(this.value)';

    // Faculty group chips — top row of faculty branch
    const facultyGroupChips = `
      <button class="ob-chip ${facultyGrpSel('professor')}" onclick="App._obPickFacultyGroup('professor')">Professor</button>
      <button class="ob-chip ${facultyGrpSel('area_lead')}" onclick="App._obPickFacultyGroup('area_lead')">Area / Associate Area Head</button>
      <button class="ob-chip ${facultyGrpSel('advisor')}" onclick="App._obPickFacultyGroup('advisor')">Advisor</button>
    `;

    // Area-lead subrole radio (Area Head vs Associate Area Head)
    const areaSubroleHtml = showAreaSubrole ? `
      <div class="ob-section-label ob-section-label-inline">Which role exactly?</div>
      <div class="ob-radio-row">
        <label class="ob-radio ${subroleSel('area_head')}">
          <input type="radio" name="ob-subrole" value="area_head" ${s.role === 'area_head' ? 'checked' : ''} onchange="App._obPickSubrole('area_head')">
          <span>Area Head</span>
        </label>
        <label class="ob-radio ${subroleSel('associate_area_head')}">
          <input type="radio" name="ob-subrole" value="associate_area_head" ${s.role === 'associate_area_head' ? 'checked' : ''} onchange="App._obPickSubrole('associate_area_head')">
          <span>Associate Area Head</span>
        </label>
      </div>` : '';

    // Advisor scope segmented control
    const scopeHtml = showAdvisorScope ? `
      <div class="ob-section-label ob-section-label-inline">I advise within</div>
      <div class="ob-seg">
        <button class="ob-seg-btn ${scopeSel('major')}"         onclick="App._obPickScope('major')">A major</button>
        <button class="ob-seg-btn ${scopeSel('minor')}"         onclick="App._obPickScope('minor')">A minor</button>
        <button class="ob-seg-btn ${scopeSel('arts_sciences')}" onclick="App._obPickScope('arts_sciences')">Arts &amp; Sciences</button>
        <button class="ob-seg-btn ${scopeSel('all_programs')}"  onclick="App._obPickScope('all_programs')">All programs</button>
      </div>` : '';

    // Section label for the major picker depends on context
    let majorLabel = '';
    if (s.roleGroup === 'student')             majorLabel = 'MAJORING IN';
    else if (showProfessorPicker)              majorLabel = 'I TEACH IN';
    else if (showAreaPicker)                   majorLabel = 'AREA / PROGRAM';
    else if (showAdvisorScope && s.scope === 'major') majorLabel = 'WHICH MAJOR';

    document.getElementById('app').innerHTML = `
      <div class="onboarding-splash">
        <div class="onboarding-card">
          <img class="onboarding-scotty" src="assets/img/scotty-head.png" alt="" aria-hidden="true" />
          <div class="onboarding-brand">CountsFor</div>
          <div class="onboarding-brand-sub">CMU-Q Curriculum Explorer</div>

          <div class="ob-heading">Tell us who you are.</div>
          <div class="ob-sub">We'll tailor the curriculum view to your role.</div>

          <div class="ob-section">
            <div class="ob-section-label">I AM A</div>
            <div class="ob-row2">
              <button class="ob-pill ${groupSel('student')}" onclick="App._obPickRoleGroup('student')">Student</button>
              <button class="ob-pill ${groupSel('faculty')}" onclick="App._obPickRoleGroup('faculty')">Faculty &amp; Staff</button>
            </div>
            ${showFacultySubgroups ? `
              <div class="ob-chip-row">${facultyGroupChips}</div>
              ${areaSubroleHtml}
              ${scopeHtml}
            ` : ''}
          </div>

          ${showMajorPicker ? `
            <div class="ob-section">
              <div class="ob-section-label">${majorLabel}</div>
              <div class="ob-row-majors">${majorBtns}</div>
              ${asOptionHtml}
            </div>
          ` : ''}

          ${showMinorSelect ? `
            <div class="ob-section">
              <div class="ob-section-label">${s.roleGroup === 'student' ? 'WITH A MINOR IN <span class="ob-optional">— optional</span>' : 'WHICH MINOR'}</div>
              <div class="ob-select-wrap">
                <select class="ob-select" onchange="${minorOnChange}">
                  <option value="" ${(s.roleGroup === 'student' ? !s.secondary : !s.primary) ? 'selected' : ''}>— ${s.roleGroup === 'student' ? 'No minor' : 'Choose a minor'} —</option>
                  ${minorOptions}
                </select>
              </div>
            </div>
          ` : ''}

          <button class="onboarding-continue" ${valid ? '' : 'disabled'} onclick="App._finishOnboarding()">Continue →</button>

          <div class="onboarding-institutional">
            <span class="onboarding-institutional-label">An initiative of</span>
            <img class="onboarding-cmuq" src="assets/img/cmuq-wordmark.png" alt="Carnegie Mellon University Qatar" />
          </div>
        </div>
        ${cancelHtml}
      </div>
    `;
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
    // Reset target since the picker shape changed.
    s.primary = null;
    s.secondary = null;
    this._renderOnboardingScreen();
  },

  _obPickMajor(program) {
    const s = this._onboardingState;
    s.primary = program;
    // Drop colliding minor for students.
    if (s.roleGroup === 'student' && s.secondary && MAJOR_TO_MINOR_CODE[s.primary] === s.secondary) {
      s.secondary = null;
    }
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

  _finishOnboarding() {
    const s = this._onboardingState;
    const profile = {
      role:      s.role,
      primary:   s.primary,
      secondary: s.roleGroup === 'student' ? s.secondary : null,
      scope:     s.role === 'advisor' ? s.scope : null,
    };
    if (!validateProfile(profile)) {
      console.error('invalid profile, refusing to save', profile);
      return;
    }
    saveProfile(profile);
    const wasEdit = s.isEdit;
    this.profile = profile;
    // Active major: for students/profs/area_lead → primary if it's a real major.
    if (this.profile.primary && this.profile.primary !== 'AS' && MAJOR_LIST.includes(this.profile.primary)) {
      this.activeMajor = this.profile.primary;
    }

    this.renderShell();
    this.bindGlobalEvents();

    if (wasEdit) {
      annotateDoubleCounters(this.courses, this.profile);
      this.renderLeftEmpty();
      this.renderTree();
    } else {
      this.loadData();
    }
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

    // Student with minor: two-segment badge (major + minor)
    if (p.role === 'student' && p.secondary) {
      const cls = 'rb-' + primaryLower + '-' + secondaryLower;
      const minorLabel = getMinorLabel(p.secondary);
      return `
        <button class="role-badge rb-${primaryLower} ${cls}" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">${PROGRAM_LABEL[p.primary]} <span class="rb-suffix">major</span></span>
          <span class="rb-divider"></span>
          <span class="rb-segment rb-secondary">${esc(minorLabel)} <span class="rb-suffix">minor</span></span>
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

    // Faculty-with-assigned-major (professor/area_head/associate_area_head)
    if (isFaculty(p) && p.primary) {
      return `
        <button class="role-badge rb-${primaryLower}" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">${PROGRAM_LABEL[p.primary]} <span class="rb-suffix">${esc(roleLabel)}</span></span>
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
          <div class="navbar-location-toggle">
            <button class="loc-btn ${this.locationFilter==='all'?'active':''}" onclick="App.setLocation('all')">All</button>
            <button class="loc-btn ${this.locationFilter==='qatar'?'active':''}" onclick="App.setLocation('qatar')">🇶🇦 Qatar</button>
            <button class="loc-btn ${this.locationFilter==='pittsburgh'?'active':''}" onclick="App.setLocation('pittsburgh')">🇺🇸 Pittsburgh</button>
          </div>
          <button class="theme-toggle" id="themeBtn" onclick="App.toggleTheme()" title="Toggle theme">${this.theme==='dark'?'☀️':'🌙'}</button>
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
    `;
    this.applyTheme();
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

      // Handle tree course click
      const treeCourse = e.target.closest('[data-course-code]');
      if (treeCourse && !e.target.closest('[data-action]')) {
        this.selectCourseFromTree(treeCourse.dataset.courseCode);
      }
    });

    // ESC closes the flag modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeFlagModal();
    });
  },

  // ── Location filter ───────────────────────────────────────
  setLocation(loc) {
    this.locationFilter = loc;
    // Re-render navbar buttons
    document.querySelectorAll('.loc-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.includes(loc === 'all' ? 'All' : loc === 'qatar' ? 'Qatar' : 'Pittsburgh'));
    });
    // If there's a selected course, check if it's offered at the selected campus
    if (this.selectedCourse) {
      if (!this.filterByLocation(this.selectedCourse) && loc !== 'all') {
        const campus = loc === 'qatar' ? '\ud83c\uddf6\ud83c\udde6 Qatar' : '\ud83c\uddfa\ud83c\uddf8 Pittsburgh';
        const el = document.getElementById('leftBody');
        if (el) el.innerHTML = '<div class="empty-state"><div class="empty-icon">\ud83d\udeab</div><div class="empty-text">' + esc(this.selectedCourse.course_code) + ' is not offered at the ' + campus + ' campus</div><div class="empty-hint">Try switching to "All" to see this course, or search for another.</div></div>';
      } else {
        this.renderCourseCard(this.selectedCourse);
      }
    }
    // Re-render tree
    this.renderTree();
    showToast(loc === 'all' ? 'Showing all courses' : loc === 'qatar' ? 'Showing Qatar courses only' : 'Showing Pittsburgh courses only');
  },

  filterByLocation(courseOrLeaf) {
    if (this.locationFilter === 'all') return true;
    if (this.locationFilter === 'qatar') return courseOrLeaf.offered_qatar;
    if (this.locationFilter === 'pittsburgh') return courseOrLeaf.offered_pitts;
    return true;
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
        <div class="home-insight" onclick="App.showDoubleCounterList()">
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
        <div class="home-insight home-insight-mp" onclick="App.enterExplorer('${majorForBrowse}')">
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
        <h1 class="home-hero">Find a course.</h1>
        <p class="home-lead">${lead}</p>

        <div class="home-search-grid">
          <div class="home-search-cell">
            <label class="home-search-label" for="courseSearch">Search by course</label>
            <div class="home-search">
              <span class="home-search-icon">🔍</span>
              <input type="text" class="home-search-input" id="courseSearch" placeholder='Try "15-122" or "Probability"' autocomplete="off" />
              <div class="typeahead" id="typeahead"></div>
            </div>
          </div>

          <div class="home-search-cell">
            <label class="home-search-label" for="categorySearch">Search by category</label>
            <div class="home-search">
              <span class="home-search-icon">🔍</span>
              <input type="text" class="home-search-input" id="categorySearch" placeholder='Try "Contextual Thinking" or "Arts"' autocomplete="off" />
              <div class="typeahead" id="categoryTypeahead"></div>
            </div>
          </div>

          <div class="home-search-cell">
            <span class="home-search-label">Browse by major</span>
            <button class="home-browse" onclick="App.enterExplorer('${browseMajor}')">
              <span class="home-browse-icon">🗂</span>
              <span class="home-browse-text">
                <span class="home-browse-title">Browse requirements</span>
                <span class="home-browse-sub">${browseSub}</span>
              </span>
              <span class="home-browse-arrow">→</span>
            </button>
          </div>
        </div>

        ${this._renderWishlistEntry()}
        ${dcBannerHtml}${mpBannerHtml}

        <footer class="home-footer">
          <a class="home-footer-cmuq" href="https://www.qatar.cmu.edu/" target="_blank" rel="noopener" aria-label="Carnegie Mellon University Qatar">
            <img src="assets/img/cmuq-wordmark.png" alt="Carnegie Mellon University Qatar" />
          </a>
          <span class="home-footer-note">A curriculum explorer for the CMU-Q community.</span>
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
    const count = this._getWishlist().length;
    const subtext = count === 0
      ? 'Tap the bookmark on any course to add it here.'
      : `${count} course${count === 1 ? '' : 's'} saved for planning later.`;
    return `
      <div class="home-wishlist-card" onclick="App.showWishlistView()" role="button" tabindex="0">
        <span class="home-wishlist-icon">${this._iconBookmarkFilled()}</span>
        <span class="home-wishlist-text">
          <span class="home-wishlist-title">Your saved courses</span>
          <span class="home-wishlist-sub">${subtext}</span>
        </span>
        <span class="home-wishlist-arrow">→</span>
      </div>`;
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
    const mappings = getCourseMappings(course);
    const sections = course.soc_sections || [];
    const isDoubleCounter = !!course._doubleCounter;
    const profile = this.profile;
    const pLower = profile && profile.primary ? profile.primary.toLowerCase() : 'cs';
    const minorMajor = getMinorAsMajorCode(profile);
    const sLower = minorMajor ? minorMajor.toLowerCase() : 'cs';

    // Where string
    const whereParts = [];
    if (course.offered_qatar) whereParts.push('Qatar');
    if (course.offered_pitts) whereParts.push('Pittsburgh');
    const whereStr = whereParts.length ? whereParts.join(' &amp; ') : '—';

    // Slim DC banner (spec § 4.4)
    let dcBannerHtml = '';
    if (isDoubleCounter && profile && minorMajor) {
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

    // Fall 2026 schedule rows (filtered + up to 4 inline; rest behind a button)
    let filtered = sections.slice();
    if (this.locationFilter === 'qatar') {
      filtered = filtered.filter(s => s.location && (s.location.includes('Qatar') || s.location.includes('Doha')));
    } else if (this.locationFilter === 'pittsburgh') {
      filtered = filtered.filter(s => s.location && s.location.includes('Pittsburgh'));
    }
    let schedHtml = '';
    if (filtered.length === 0) {
      const campus = this.locationFilter === 'qatar' ? 'Qatar' : this.locationFilter === 'pittsburgh' ? 'Pittsburgh' : 'this filter';
      schedHtml = `<div class="cc-empty">Not offered at ${campus} for Fall 2026</div>`;
    } else {
      const inline = filtered.slice(0, 4).map(s => this._renderSchedRow(s)).join('');
      const extraCount = filtered.length - 4;
      const more = extraCount > 0
        ? `<button class="cc-more" onclick="App.expandScheduleV2(event)" id="cc-sched-more" data-expanded="0">+${extraCount} more sections</button>
           <div id="cc-sched-extra" style="display:none;margin-top:6px"></div>`
        : '';
      schedHtml = inline + more;
    }

    // Counts For — horizontal columns per major, omitting majors with no mappings
    const cfCols = [];
    for (const majorCode of MAJOR_ORDER) {
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

        <div class="cc-cols">
          <div class="cc-section">
            <div class="cc-h4">ABOUT</div>
            ${aboutRows}
          </div>
          <div class="cc-section">
            <div class="cc-h4">FALL 2026</div>
            ${this._renderOfferingPredictionHtml(course, 'F')}
            ${schedHtml}
          </div>
        </div>

        <div class="cc-section cc-section-cf">
          <div class="cc-h4">COUNTS FOR</div>
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

    this._schedSections = filtered;  // used by expand handler
  },

  _renderSchedRow(s) {
    const time = (s.begin_time && s.begin_time !== 'TBA')
      ? `${esc(s.begin_time)}–${esc(s.end_time)}`
      : 'TBA';
    const dmCls = (dm) => {
      const d = (dm || '').toLowerCase();
      if (d.includes('remote')) return 'cc-dm-remote';
      if (d.includes('in-person')) return 'cc-dm-inperson';
      return 'cc-dm-other';
    };
    const dm = s.delivery_mode ? `<span class="cc-dm-pill ${dmCls(s.delivery_mode)}">${esc(s.delivery_mode).toUpperCase()}</span>` : '';
    return `<div class="cc-kv"><span class="cc-k">Sec ${esc(s.section)}</span><span class="cc-v">${esc(s.days || 'TBA')} ${time} ${dm}</span></div>`;
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

    // ── Depth 0: render as a card ─────────────────────────────
    if (depth === 0) {
      const accent = pickAccentColor(node.label, major);
      const openCls = expanded ? 'open' : '';
      const cardHead = `
        <div class="tr-card-head ${isHighlighted ? 'highlighted' : ''}" data-tree-major="${major}" data-tree-path="${safePath}">
          <span class="tr-arrow ${expanded ? 'expanded' : ''}">▶</span>
          <span class="tr-accent" style="background:${accent}"></span>
          <span class="tr-card-title">${esc(node.label)}</span>
          <span class="tr-card-meta">${ruleHtml}${countHtml}</span>
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

  _renderLeafCourse(c, major) {
    const fullCourse = this.courseIndex[c.code] || c;
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
    if (isFaculty(this.profile)) {
      acts.push(`<button class="tr-leaf-action tr-leaf-flag" data-action="flag" data-course-code="${esc(course.course_code)}" title="Flag course data issue" aria-label="Flag course data issue">${this._iconFlag()}</button>`);
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
    if (isFaculty(this.profile)) {
      parts.push(`
        <button class="cc-action cc-action-flag" data-action="flag" data-course-code="${esc(course.course_code)}" title="Report a data issue with this course" aria-label="Flag course issue">
          ${this._iconFlag()}
          <span>Flag course issue</span>
        </button>`);
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
    const course = this.courseIndex[code];
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
  // Storage: localStorage['cf_wishlist'] = [course_code, ...]
  // No backend yet — clean local persistence with clear integration points.

  _getWishlist() {
    return loadStore('cf_wishlist', []);
  },

  _saveWishlist(list) {
    saveStore('cf_wishlist', list);
  },

  _isInWishlist(code) {
    return this._getWishlist().indexOf(code) !== -1;
  },

  toggleWishlist(code) {
    if (!isStudent(this.profile)) {
      showToast('Wishlist is available to students only.');
      return;
    }
    if (!code) return;
    const list = this._getWishlist();
    const idx = list.indexOf(code);
    if (idx === -1) {
      list.push(code);
      this._saveWishlist(list);
      // TODO(backend): POST /api/wishlist {course_code: code}
      showToast('Saved for later');
    } else {
      list.splice(idx, 1);
      this._saveWishlist(list);
      // TODO(backend): DELETE /api/wishlist/{code}
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

    const list = this._getWishlist();
    const courses = list
      .map(code => this.courseIndex[code])
      .filter(Boolean);

    let rowsHtml;
    if (courses.length === 0) {
      rowsHtml = `
        <div class="wl-empty">
          <div class="wl-empty-icon">${this._iconBookmarkOutline()}</div>
          <div class="wl-empty-title">No saved courses yet</div>
          <div class="wl-empty-hint">Tap the bookmark on any course to save it here for planning later.</div>
        </div>`;
    } else {
      rowsHtml = courses.map(c => {
        // Surface a warning if any faculty member flagged this course as no-longer-offered
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
        </div>
        <div class="wl-list">${rowsHtml}</div>
      </div>
    `;
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
    return this._getFlags().some(f =>
      f.course_code === code &&
      (f.reason_code === 'not_offered' || f.reason_code === 'campus_wrong') &&
      f.status !== 'dismissed'
    );
  },

  openFlagModal(courseCode) {
    if (!isFaculty(this.profile)) {
      showToast('Course flagging is available to faculty only.');
      return;
    }
    const course = this.courseIndex[courseCode];
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
            <div class="cf-modal-sub">Help us keep course data accurate. Admins review flags before changes.</div>
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

  submitFlag() {
    const s = this._flagModalState;
    if (!s || !s.reason) return;
    const course = this.courseIndex[s.courseCode];
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
      status: 'pending',  // pending | reviewed | resolved | dismissed
    };

    const flags = this._getFlags();
    flags.push(flag);
    this._saveFlags(flags);

    // TODO(backend): POST /api/flags with body = flag, server assigns canonical id + status.

    this.closeFlagModal();
    showToast('Flag submitted — admins will review');
    this.renderTree();  // refresh in case a leaf badge needs to appear later
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
