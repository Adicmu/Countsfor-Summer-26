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
    role: null,
    primary: null,
    secondary: null,
    isEdit: false,
  },

  renderOnboarding(isEdit) {
    this._onboardingState = {
      role: this.profile ? this.profile.role : null,
      primary: this.profile ? this.profile.primary : null,
      secondary: this.profile ? this.profile.secondary : null,
      isEdit: !!isEdit,
    };
    this._renderOnboardingScreen();
  },

  _renderOnboardingScreen() {
    const s = this._onboardingState;
    const PROGRAMS = ['CS', 'IS', 'BA', 'BS'];
    const roleSel = (r) => s.role === r ? 'selected' : '';
    const majorSel = (m) => s.primary === m ? 'selected' : '';
    const minorSel = (m) => s.secondary === m ? 'selected' : '';
    const showMajor = s.role === 'student' || s.role === 'professor';
    const showMinor = s.role === 'student' && !!s.primary;
    const showProfAS = s.role === 'professor';

    const valid =
      (s.role === 'area_head') ||
      (s.role === 'professor' && (s.primary === 'AS' || PROGRAMS.includes(s.primary))) ||
      (s.role === 'student' && PROGRAMS.includes(s.primary));

    const cancelHtml = s.isEdit
      ? '<button class="onboarding-cancel" onclick="App._cancelOnboarding()">Cancel</button>'
      : '';

    const majorStage = showMajor ? 'on' : 'off';
    const minorStage = showMinor ? 'on' : 'off';

    const majorBtns = PROGRAMS.map(p => `
      <button class="ob-pill ${majorSel(p)}" onclick="App._obPickMajor('${p}')">${p}<span class="ob-pill-sub">${this._programFullName(p)}</span></button>
    `).join('');

    const profASBtn = showProfAS
      ? `<button class="ob-pill ob-pill-wide ${s.primary === 'AS' ? 'selected' : ''}" onclick="App._obPickMajor('AS')">Arts &amp; Sciences<span class="ob-pill-sub">Cross-program teaching</span></button>`
      : '';

    const minorBtns = PROGRAMS.map(p => {
      const disabled = (s.primary === p) ? 'disabled aria-disabled="true"' : '';
      return `<button class="ob-pill ${minorSel(p)}" ${disabled} onclick="App._obPickMinor('${p}')">${p}</button>`;
    }).join('');

    document.getElementById('app').innerHTML = `
      <div class="onboarding-splash">
        <div class="onboarding-card">
          <div class="onboarding-brand">CountsFor</div>
          <div class="onboarding-brand-sub">CMU-Q Curriculum Explorer</div>

          <div class="ob-heading">Tell us who you are.</div>
          <div class="ob-sub">We'll tailor the curriculum view to your role. Takes 5 seconds.</div>

          <div class="ob-section">
            <div class="ob-section-label">I AM A</div>
            <div class="ob-row3">
              <button class="ob-pill ${roleSel('student')}" onclick="App._obPickRole('student')">Student</button>
              <button class="ob-pill ${roleSel('professor')}" onclick="App._obPickRole('professor')">Professor</button>
              <button class="ob-pill ${roleSel('area_head')}" onclick="App._obPickRole('area_head')">Area Head</button>
            </div>
          </div>

          <div class="ob-section ob-stage-${majorStage}">
            <div class="ob-section-label">${s.role === 'professor' ? 'I TEACH IN' : 'MAJORING IN'}</div>
            <div class="ob-row4">${majorBtns}</div>
            ${profASBtn}
          </div>

          <div class="ob-section ob-stage-${minorStage}">
            <div class="ob-section-label">WITH A MINOR IN <span class="ob-optional">— optional</span></div>
            <div class="ob-row5">
              <button class="ob-pill ${s.secondary === null ? 'selected' : ''}" onclick="App._obPickMinor(null)">None</button>
              ${minorBtns}
            </div>
          </div>

          <button class="onboarding-continue" ${valid ? '' : 'disabled'} onclick="App._finishOnboarding()">Continue →</button>
        </div>
        ${cancelHtml}
      </div>
    `;
  },

  _programFullName(p) {
    return ({ CS: 'Computer Sci', IS: 'Info Systems', BA: 'Business', BS: 'Biology' })[p] || p;
  },

  _obPickRole(role) {
    const prev = this._onboardingState.role;
    this._onboardingState.role = role;
    // Clear program selections whenever the role changes — a major picked as
    // a professor (or AS) doesn't apply to a student profile, and vice versa.
    if (role !== prev) {
      this._onboardingState.primary = null;
      this._onboardingState.secondary = null;
    }
    this._renderOnboardingScreen();
  },

  _obPickMajor(program) {
    this._onboardingState.primary = program;
    if (this._onboardingState.secondary === program) {
      this._onboardingState.secondary = null;
    }
    this._renderOnboardingScreen();
  },

  _obPickMinor(program) {
    this._onboardingState.secondary = program;
    this._renderOnboardingScreen();
  },

  _finishOnboarding() {
    const s = this._onboardingState;
    const profile = {
      role: s.role,
      primary: s.primary,
      secondary: s.secondary,
    };
    if (!validateProfile(profile)) {
      console.error('invalid profile, refusing to save', profile);
      return;
    }
    saveProfile(profile);
    const wasEdit = s.isEdit;
    this.profile = profile;
    if (this.profile.primary && this.profile.primary !== 'AS') {
      this.activeMajor = this.profile.primary;
    }

    // Render the main app
    this.renderShell();
    this.bindGlobalEvents();

    if (wasEdit) {
      // Re-annotate using the new profile, then re-render whatever's visible
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
    const PROGRAM_LABEL = { CS: 'CS', IS: 'IS', BA: 'BA', BS: 'BS', AS: 'A&S' };

    if (p.role === 'area_head') {
      return `
        <button class="role-badge rb-ah" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">Area Head <span class="rb-suffix">· All programs</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    if (p.role === 'professor' && p.primary === 'AS') {
      return `
        <button class="role-badge rb-as" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">Arts &amp; Sciences <span class="rb-suffix">· Faculty</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    const primaryLower = (p.primary || '').toLowerCase();
    const secondaryLower = (p.secondary || '').toLowerCase();
    const facultySuffix = p.role === 'professor' ? '<span class="rb-suffix">· Faculty</span>' : '';

    if (this.profile && this.profile.role === 'student' && p.secondary && p.secondary !== p.primary) {
      const cls = 'rb-' + primaryLower + '-' + secondaryLower;
      return `
        <button class="role-badge rb-${primaryLower} ${cls}" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">${PROGRAM_LABEL[p.primary]}</span>
          <span class="rb-divider"></span>
          <span class="rb-segment rb-secondary">${PROGRAM_LABEL[p.secondary]} <span class="rb-suffix">minor</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    const suffix = p.role === 'student' ? '<span class="rb-suffix">major</span>' : facultySuffix;
    return `
      <button class="role-badge rb-${primaryLower}" onclick="App.editRole()" title="Click to change role">
        <span class="rb-segment rb-primary">${PROGRAM_LABEL[p.primary]} ${suffix}</span>
        <span class="rb-edit-hint">Edit</span>
      </button>`;
  },

  editRole() {
    this.renderOnboarding(true);
  },

  _visibleMajors() {
    const vm = computeViewMode(this.profile);
    if (vm === 'cross-program') return MAJOR_ORDER.slice();
    if (vm === 'focused-dual') return [this.profile.primary, this.profile.secondary];
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
          <button class="explore-btn-inline" id="exploreInlineBtn" onclick="App.enterExplorer()" style="display:none;">🗂 Explore Map</button>
        </div>
      </div>
    ` : '';

    document.getElementById('app').innerHTML = `
      <nav class="navbar">
        <div class="navbar-brand" onclick="App.reset()">CountsFor <span class="subtitle">CMU-Q</span></div>
        ${this._roleBadgeHtml()}
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
            ${this._visibleMajors().map(m => {
              const isMinor = this.profile && m === this.profile.secondary && m !== this.profile.primary;
              const minorSuffix = isMinor ? '<span class="major-tab-suffix">minor</span>' : '';
              return `<button class="major-tab ${m===this.activeMajor?'active':''}" data-major="${m}" onclick="App.switchMajor('${m}')">${m}${minorSuffix}</button>`;
            }).join('')}
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
      if (e.target.id === 'treeSearchInput') {
        this.treeSearchQuery = e.target.value.trim().toLowerCase();
        this.renderTree();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.id === 'courseSearch') this.handleSearchKeydown(e);
    });

    document.addEventListener('click', (e) => {
      // Close typeahead if clicking outside
      if (!e.target.closest('.search-wrapper')) {
        const ta = document.getElementById('typeahead');
        if (ta) ta.classList.remove('visible');
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
      if (treeCourse) {
        this.selectCourseFromTree(treeCourse.dataset.courseCode);
      }
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
      this.exitExplorer();
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
        if (vm === 'focused-dual' && c._doubleCounter && App.profile.secondary) {
          dcTag = '<span class="dc-leaf-tag dc-leaf-tag-' + App.profile.secondary.toLowerCase() + '" style="margin-left:6px">' + App.profile.secondary + '</span>';
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

  selectSearchResult(idx) {
    const course = this._searchResults[idx];
    if (!course) return;
    const wasEmpty = !this.selectedCourse;
    this.selectedCourse = course;
    if (wasEmpty) {
      this.renderShell();   // re-attach the search header (replaces DOM)
    } else {
      const ta = document.getElementById('typeahead');
      if (ta) ta.classList.remove('visible');
    }
    const input = document.getElementById('courseSearch');
    if (input) input.value = course.course_code;
    this.renderCourseCard(course);
  },

  renderLeftEmpty() {
    const el = document.getElementById('leftBody');
    if (!el) return;
    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = 'none';
    el.innerHTML = this._renderHome();
  },

  _renderHome() {
    const vm = computeViewMode(this.profile);
    const p = this.profile && this.profile.primary;
    const s = this.profile && this.profile.secondary;

    // Lead sentence per spec § 4.3
    let lead;
    if (vm === 'focused-dual') {
      lead = `See what it counts for in your ${p} major and ${s} minor.`;
    } else if (vm === 'focused-single' && this.profile.role === 'professor') {
      lead = `See what it counts for in the program you teach.`;
    } else if (vm === 'focused-single') {
      lead = `See what it counts for in your ${p} program.`;
    } else {
      lead = `See what it counts for across CS, IS, BA, and BS.`;
    }

    // Browse-button subtitle
    let browseSub;
    if (vm === 'focused-dual') browseSub = `${p} + ${s} requirement tree — find courses by slot`;
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
            <div class="home-insight-label">${p} MAJOR + ${s} MINOR</div>
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

        <div class="home-search">
          <span class="home-search-icon">🔍</span>
          <input type="text" class="home-search-input" id="courseSearch" placeholder='Try "15-122" or "Probability"' autocomplete="off" />
          <div class="typeahead" id="typeahead"></div>
        </div>

        <button class="home-browse" onclick="App.enterExplorer('${browseMajor}')">
          <span class="home-browse-icon">🗂</span>
          <span class="home-browse-text">
            <span class="home-browse-title">Browse requirements</span>
            <span class="home-browse-sub">${browseSub}</span>
          </span>
          <span class="home-browse-arrow">→</span>
        </button>

        ${dcBannerHtml}${mpBannerHtml}
      </div>
    `;
  },

  showDoubleCounterList() {
    if (computeViewMode(this.profile) !== 'focused-dual') return;
    const el = document.getElementById('leftBody');
    if (!el) return;

    const p = this.profile.primary;
    const s = this.profile.secondary;
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
    const sLower = profile && profile.secondary ? profile.secondary.toLowerCase() : 'cs';

    // Where string
    const whereParts = [];
    if (course.offered_qatar) whereParts.push('Qatar');
    if (course.offered_pitts) whereParts.push('Pittsburgh');
    const whereStr = whereParts.length ? whereParts.join(' &amp; ') : '—';

    // Slim DC banner (spec § 4.4)
    let dcBannerHtml = '';
    if (isDoubleCounter && profile && profile.secondary) {
      dcBannerHtml = `
        <div class="cc-dc-strip">
          <span class="cc-dc-badge cc-dc-${pLower}">${profile.primary}</span>
          <span class="cc-dc-badge cc-dc-${sLower}">${profile.secondary}</span>
          <span class="cc-dc-text">Double-counter</span>
        </div>`;
    }

    // About column rows
    const aboutRows = `
      <div class="cc-kv"><span class="cc-k">Dept</span><span class="cc-v">${esc(deptName)} (${esc(course.course_code.split('-')[0])})</span></div>
      <div class="cc-kv"><span class="cc-k">Offered</span><span class="cc-v">${semesters.length ? semesters.join(' · ') : '—'}</span></div>
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
    const dmCls = (dm) => {
      const d = (dm || '').toLowerCase();
      if (d.includes('remote')) return 'cc-dm-remote';
      if (d.includes('in-person')) return 'cc-dm-inperson';
      return 'cc-dm-other';
    };
    const renderSchedRow = (s) => {
      const time = (s.begin_time && s.begin_time !== 'TBA')
        ? `${esc(s.begin_time)}–${esc(s.end_time)}`
        : 'TBA';
      const dm = s.delivery_mode ? `<span class="cc-dm-pill ${dmCls(s.delivery_mode)}">${esc(s.delivery_mode).toUpperCase()}</span>` : '';
      return `<div class="cc-kv"><span class="cc-k">Sec ${esc(s.section)}</span><span class="cc-v">${esc(s.days || 'TBA')} ${time} ${dm}</span></div>`;
    };
    let schedHtml = '';
    if (filtered.length === 0) {
      const campus = this.locationFilter === 'qatar' ? 'Qatar' : this.locationFilter === 'pittsburgh' ? 'Pittsburgh' : 'this filter';
      schedHtml = `<div class="cc-empty">Not offered at ${campus} for Fall 2026</div>`;
    } else {
      const inline = filtered.slice(0, 4).map(renderSchedRow).join('');
      const extraCount = filtered.length - 4;
      const more = extraCount > 0
        ? `<button class="cc-more" onclick="App.expandScheduleV2(event)" id="cc2SchedMore" data-expanded="0">+${extraCount} more sections</button>
           <div id="cc2SchedExtra" style="display:none;margin-top:6px;font-size:11px;color:var(--text-secondary);line-height:1.5"></div>`
        : '';
      schedHtml = inline + more;
    }

    // Counts For rows
    let cfHtml = '';
    for (const majorCode of MAJOR_ORDER) {
      const majorMappings = mappings[majorCode];
      if (!majorMappings || majorMappings.length === 0) continue;
      for (const m of majorMappings) {
        const typeLabel = m.isGenEd ? 'GenEd' : 'Required';
        const safePath = m.fullPath.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        cfHtml += `
          <div class="cc-cf-row" data-nav-major="${majorCode}" data-nav-path="${safePath}">
            <span class="cc-cf-badge cc-cf-${majorCode.toLowerCase()}">${majorCode}</span>
            <span class="cc-cf-text">${esc(m.shortLabel)} — ${typeLabel}</span>
            <span class="cc-cf-arrow">→</span>
          </div>`;
      }
    }
    if (!cfHtml) cfHtml = '<div class="cc-empty">This course does not count toward any tracked major requirements.</div>';

    el.innerHTML = `
      <div class="cc-card">
        ${dcBannerHtml}
        <div class="cc-head">
          <div class="cc-code">${esc(course.course_code)}</div>
          <div class="cc-name">${esc(course.course_name)} · ${course.units || '?'} units</div>
        </div>

        <div class="cc-cols">
          <div class="cc-section">
            <div class="cc-h4">ABOUT</div>
            ${aboutRows}
          </div>
          <div class="cc-section">
            <div class="cc-h4">FALL 2026</div>
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

    this._cc2Sections = filtered;  // used by expand handler
  },

  expandScheduleV2(e) {
    e.stopPropagation();
    const btn = document.getElementById('cc2SchedMore');
    const extra = document.getElementById('cc2SchedExtra');
    if (!btn || !extra) return;
    const expanded = btn.dataset.expanded === '1';
    const sections = (this._cc2Sections || []).slice(4);
    if (!expanded) {
      extra.style.display = 'block';
      extra.innerHTML = sections.map(s => {
        const time = s.begin_time && s.begin_time !== 'TBA' ? esc(s.begin_time) + '–' + esc(s.end_time) : 'TBA';
        return 'Sec ' + esc(s.section) + ' · ' + esc(s.days || 'TBA') + ' ' + time + ' · ' + esc(s.delivery_mode || '—');
      }).join('<br>');
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
    if (!sections) { rightBody.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No data</div></div>'; return; }
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
      ? `<span class="tr-count">${filteredTotalCourses} courses</span>`
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

    let dcTag = '';
    if (vm === 'focused-dual' && fullCourse._doubleCounter) {
      const other = (this.profile.secondary === major) ? this.profile.primary : this.profile.secondary;
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
      </div>`;
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
    const wasEmpty = !this.selectedCourse;
    this.selectedCourse = course;
    if (wasEmpty) this.renderShell();   // re-attach the search header
    const input = document.getElementById('courseSearch');
    if (input) input.value = code;
    this.renderCourseCard(course);

    // On mobile, switch to lookup lens
    if (window.innerWidth <= 860) {
      this.setMobileLens('lookup');
    }

    // Scroll left panel to top
    const leftBody = document.getElementById('leftBody');
    if (leftBody) leftBody.scrollTop = 0;
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
      const highlighted = document.querySelector('.tree-node-row.highlighted');
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
