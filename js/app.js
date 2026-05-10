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
    step: 'role',          // 'role' | 'student-program' | 'professor-program'
    role: null,            // 'student' | 'professor' | 'area_head'
    primary: null,
    secondary: null,
    isEdit: false,         // true when re-entering from navbar role badge
  },

  renderOnboarding(isEdit) {
    // Initialize state — pre-fill from current profile if editing
    this._onboardingState = {
      step: 'role',
      role: this.profile ? this.profile.role : null,
      primary: this.profile ? this.profile.primary : null,
      secondary: this.profile ? this.profile.secondary : null,
      isEdit: !!isEdit,
    };
    this._renderOnboardingStep();
  },

  _renderOnboardingStep() {
    const s = this._onboardingState;
    const cancelHtml = s.isEdit
      ? '<button class="onboarding-cancel" onclick="App._cancelOnboarding()">Cancel</button>'
      : '';

    let stepHtml = '';
    if (s.step === 'role') {
      stepHtml = this._renderOnboardingRole();
    } else if (s.step === 'student-program') {
      stepHtml = this._renderOnboardingStudentProgram();
    } else if (s.step === 'professor-program') {
      stepHtml = this._renderOnboardingProfessorProgram();
    }

    document.getElementById('app').innerHTML = `
      <div class="onboarding-splash">
        <div class="onboarding-card">
          <div class="onboarding-brand">CountsFor</div>
          <div class="onboarding-brand-sub">CMU-Q Curriculum Explorer</div>
          ${stepHtml}
        </div>
        ${cancelHtml}
      </div>
    `;
  },

  _renderOnboardingRole() {
    const s = this._onboardingState;
    const sel = (r) => s.role === r ? 'selected' : '';
    return `
      <div class="onboarding-step-label">Step 1 of 2</div>
      <div class="onboarding-question">Who are you?</div>
      <div class="onboarding-help">We'll only show what matters to your role.</div>
      <div class="onboarding-options">
        <button class="onboarding-option ${sel('student')}" onclick="App._pickRole('student')">Student</button>
        <button class="onboarding-option ${sel('professor')}" onclick="App._pickRole('professor')">Professor</button>
        <button class="onboarding-option ${sel('area_head')}" onclick="App._pickRole('area_head')">Area Head</button>
      </div>
    `;
  },

  _pickRole(role) {
    this._onboardingState.role = role;
    if (role === 'area_head') {
      this._onboardingState.primary = null;
      this._onboardingState.secondary = null;
      this._finishOnboarding();
      return;
    }
    if (role === 'student') this._onboardingState.step = 'student-program';
    if (role === 'professor') this._onboardingState.step = 'professor-program';
    this._renderOnboardingStep();
  },

  _renderOnboardingStudentProgram() {
    const s = this._onboardingState;
    const PROGRAMS = ['CS', 'IS', 'BA', 'BS'];
    const majorSel = (m) => s.primary === m ? 'selected' : '';
    const minorSel = (m) => s.secondary === m ? 'selected' : '';
    const minorDisabled = (m) => s.primary === m ? 'aria-disabled="true" disabled' : '';
    const continueDisabled = !s.primary;

    return `
      <div class="onboarding-step-label">Step 2 of 2</div>
      <div class="onboarding-question">What's your program?</div>

      <div class="onboarding-section-label">MAJOR</div>
      <div class="onboarding-options options-2col" style="grid-template-columns:repeat(4,1fr)">
        ${PROGRAMS.map(p => `
          <button class="onboarding-option ${majorSel(p)}" onclick="App._pickStudentMajor('${p}')">${p}</button>
        `).join('')}
      </div>

      <div class="onboarding-section-label">MINOR <span class="opt-note">— optional</span></div>
      <div class="onboarding-options" style="grid-template-columns:repeat(5,1fr)">
        <button class="onboarding-option ${s.secondary === null ? 'selected' : ''}" onclick="App._pickStudentMinor(null)">None</button>
        ${PROGRAMS.map(p => `
          <button class="onboarding-option ${minorSel(p)}" ${minorDisabled(p)} onclick="App._pickStudentMinor('${p}')">${p}</button>
        `).join('')}
      </div>

      <button class="onboarding-continue" ${continueDisabled ? 'disabled' : ''} onclick="App._finishOnboarding()">Continue →</button>
    `;
  },

  _pickStudentMajor(program) {
    this._onboardingState.primary = program;
    // If selected major equals current minor, clear minor
    if (this._onboardingState.secondary === program) {
      this._onboardingState.secondary = null;
    }
    this._renderOnboardingStep();
  },

  _pickStudentMinor(program) {
    this._onboardingState.secondary = program;
    this._renderOnboardingStep();
  },

  _renderOnboardingProfessorProgram() {
    const s = this._onboardingState;
    const PROGRAMS = ['CS', 'IS', 'BA', 'BS'];
    const sel = (p) => s.primary === p ? 'selected' : '';
    const continueDisabled = !s.primary;

    return `
      <div class="onboarding-step-label">Step 2 of 2</div>
      <div class="onboarding-question">Which program do you teach in?</div>

      <div class="onboarding-options" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px">
        ${PROGRAMS.map(p => `
          <button class="onboarding-option ${sel(p)}" onclick="App._pickProfProgram('${p}')">${p}</button>
        `).join('')}
      </div>

      <div class="onboarding-options options-stacked">
        <button class="onboarding-option ${sel('AS')}" onclick="App._pickProfProgram('AS')">
          Arts &amp; Sciences (Cross-program)
          <span class="opt-sub">I teach courses that apply across all programs</span>
        </button>
      </div>

      <button class="onboarding-continue" ${continueDisabled ? 'disabled' : ''} onclick="App._finishOnboarding()">Continue →</button>
    `;
  },

  _pickProfProgram(program) {
    this._onboardingState.primary = program;
    this._onboardingState.secondary = null;
    this._renderOnboardingStep();
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
        <!-- LEFT: Course Lookup -->
        <div class="panel panel-left ${isSplit && this.mobileLens==='map'?'hidden-mobile':''}" id="panelLeft">
          <div class="panel-header">
            <div class="panel-tag">Course Lookup</div>
            <div class="panel-title">What does this course count for?</div>
            <div class="search-row">
              <div class="search-wrapper">
                <span class="search-icon">🔍</span>
                <input type="text" class="search-input" id="courseSearch" placeholder="Search by code, name, requirement, or category…" autocomplete="off" />
                <div class="typeahead" id="typeahead"></div>
              </div>
              <button class="explore-btn-inline" id="exploreInlineBtn" onclick="App.enterExplorer()" style="display:none;">🗂 Explore Map</button>
            </div>
          </div>
          <div class="panel-body" id="leftBody"></div>
        </div>

        <!-- RIGHT: Requirement Map (hidden in focused mode via CSS) -->
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
      if (treeRow && !e.target.closest('.tree-course')) {
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
    const ta = document.getElementById('typeahead');
    if (ta) ta.classList.remove('visible');
    const input = document.getElementById('courseSearch');
    if (input) input.value = course.course_code;
    this.selectedCourse = course;
    this.renderCourseCard(course);
  },

  _pickTryCourses() {
    const FALLBACK = ['15-122', '21-259', '73-102', '67-262', '70-311'];
    const vm = computeViewMode(this.profile);
    let picks = [];

    if (vm === 'focused-dual') {
      picks = this.courses.filter(c => c._doubleCounter).map(c => c.course_code);
    } else if (vm === 'focused-single') {
      const primaryCourses = this.courses.filter(c => {
        const r = c.requirements || {};
        return Array.isArray(r[this.profile.primary]) && r[this.profile.primary].length > 0;
      });
      picks = primaryCourses.map(c => c.course_code);
    } else if (vm === 'cross-program') {
      picks = this.courses.filter(c => (c._programCount || 0) >= 3).map(c => c.course_code);
    }

    picks = picks.slice(0, 5);
    if (picks.length < 3) {
      for (const code of FALLBACK) {
        if (picks.length >= 5) break;
        if (!picks.includes(code)) picks.push(code);
      }
    }
    return picks.slice(0, 5);
  },

  _renderEmptyDual() {
    const PROGRAM_NAME = { CS: 'Computer Science', IS: 'Information Systems', BA: 'Business Administration', BS: 'Biological Sciences' };
    const p = this.profile.primary;
    const s = this.profile.secondary;
    const pLower = p.toLowerCase();
    const sLower = s.toLowerCase();

    const primaryCount = this.courses.filter(c => {
      const r = c.requirements || {};
      return Array.isArray(r[p]) && r[p].length > 0;
    }).length;

    const secondaryCount = this.courses.filter(c => {
      const r = c.requirements || {};
      return Array.isArray(r[s]) && r[s].length > 0;
    }).length;

    const dcCount = this.courses.filter(c => c._doubleCounter).length;

    const tryCodes = this._pickTryCourses();
    const tryHtml = tryCodes.map(code => `<button class="es-try-chip" onclick="App.selectCourseFromTree('${esc(code)}')">${esc(code)}</button>`).join('');

    return `
      <div class="empty-state-v2">
        <div class="es-hero">
          <div class="es-hero-title">What does this course count for?</div>
          <div class="es-hero-sub">Search any of ${this.courses.length.toLocaleString()} CMU-Q courses</div>
        </div>

        <div class="es-cards">
          <div class="es-card es-card-${pLower}" onclick="App.enterExplorer('${p}')">
            <div class="es-card-label">Your major</div>
            <div class="es-card-title-row">
              <span class="es-card-code">${p}</span>
              <span class="es-card-name">${PROGRAM_NAME[p]}</span>
            </div>
            <div class="es-card-meta">${primaryCount} courses</div>
          </div>
          <div class="es-card es-card-${sLower}" onclick="App.enterExplorer('${s}')">
            <div class="es-card-label">Your minor</div>
            <div class="es-card-title-row">
              <span class="es-card-code">${s}</span>
              <span class="es-card-name">${PROGRAM_NAME[s]}</span>
            </div>
            <div class="es-card-meta">${secondaryCount} courses</div>
          </div>
        </div>

        <div class="dc-banner" onclick="App.showDoubleCounterList()">
          <span class="dc-banner-badges">
            <span class="dc-mini-badge dc-mini-${pLower}">${p}</span>
            <span class="dc-mini-badge dc-mini-${sLower}">${s}</span>
          </span>
          <span class="dc-banner-text">${dcCount} courses count for BOTH your ${p} major and ${s} minor</span>
          <span class="dc-banner-cta">View all →</span>
        </div>

        <div class="es-try-row">
          <div class="es-try-label">Try a course</div>
          <div class="es-try-chips">${tryHtml}</div>
        </div>
      </div>
    `;
  },

  _renderEmptySingle() {
    const PROGRAM_NAME = { CS: 'Computer Science', IS: 'Information Systems', BA: 'Business Administration', BS: 'Biological Sciences' };
    const p = this.profile.primary;
    const pLower = p.toLowerCase();

    const primaryCount = this.courses.filter(c => {
      const r = c.requirements || {};
      return Array.isArray(r[p]) && r[p].length > 0;
    }).length;

    const tryCodes = this._pickTryCourses();
    const tryHtml = tryCodes.map(code => `<button class="es-try-chip" onclick="App.selectCourseFromTree('${esc(code)}')">${esc(code)}</button>`).join('');

    const cardLabel = this.profile.role === 'professor' ? 'You teach in' : 'Your program';

    return `
      <div class="empty-state-v2">
        <div class="es-hero">
          <div class="es-hero-title">What does this course count for?</div>
          <div class="es-hero-sub">Search any of ${this.courses.length.toLocaleString()} CMU-Q courses</div>
        </div>

        <div class="es-cards" style="grid-template-columns:1fr">
          <div class="es-card es-card-${pLower}" onclick="App.enterExplorer('${p}')">
            <div class="es-card-label">${cardLabel}</div>
            <div class="es-card-title-row">
              <span class="es-card-code">${p}</span>
              <span class="es-card-name">${PROGRAM_NAME[p]}</span>
            </div>
            <div class="es-card-meta">${primaryCount} courses</div>
          </div>
        </div>

        <div class="es-try-row">
          <div class="es-try-label">Try a course</div>
          <div class="es-try-chips">${tryHtml}</div>
        </div>
      </div>
    `;
  },

  _renderEmptyCross() {
    const tryCodes = this._pickTryCourses();
    const tryHtml = tryCodes.map(code => `<button class="es-try-chip" onclick="App.selectCourseFromTree('${esc(code)}')">${esc(code)}</button>`).join('');

    return `
      <div class="empty-state-v2">
        <div class="es-hero">
          <div class="es-hero-title">What does this course count for?</div>
          <div class="es-hero-sub">Search any of ${this.courses.length.toLocaleString()} CMU-Q courses</div>
        </div>

        <div class="es-cards">
          <div class="es-card es-card-all" onclick="App.enterExplorer('CS')">
            <div class="es-card-label">All programs</div>
            <div class="es-card-title-row">
              <span class="es-card-name">${this.courses.length.toLocaleString()} courses across CS · IS · BA · BS</span>
            </div>
            <div class="es-card-meta">Click to open the requirement map</div>
          </div>
        </div>

        <div class="es-try-row">
          <div class="es-try-label">Try a course (cross-cutting)</div>
          <div class="es-try-chips">${tryHtml}</div>
        </div>
      </div>
    `;
  },

  renderLeftEmpty() {
    const el = document.getElementById('leftBody');
    if (!el) return;
    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = 'none';

    const vm = computeViewMode(this.profile);
    if (vm === 'focused-dual') el.innerHTML = this._renderEmptyDual();
    else if (vm === 'focused-single') el.innerHTML = this._renderEmptySingle();
    else el.innerHTML = this._renderEmptyCross();
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

    // ── Double-counter banner ───────────────────────────────
    let dcBannerHtml = '';
    if (isDoubleCounter && profile && profile.secondary) {
      dcBannerHtml = `
        <div class="dc-banner" style="cursor:default">
          <span class="dc-banner-badges">
            <span class="dc-mini-badge dc-mini-${pLower}">${profile.primary}</span>
            <span class="dc-mini-badge dc-mini-${sLower}">${profile.secondary}</span>
          </span>
          <span class="dc-banner-text">Counts for BOTH your ${profile.primary} major and ${profile.secondary} minor</span>
        </div>`;
    }

    // ── Header pills ───────────────────────────────────────────────────
    const locFlags = [];
    if (course.offered_qatar) locFlags.push('🇶🇦 Qatar');
    if (course.offered_pitts) locFlags.push('🇺🇸 Pittsburgh');

    let semPillsHtml = '';
    if (semesters.length > 0) {
      const visible = semesters.slice(0, 4);
      const more = semesters.length > 4 ? ` · +${semesters.length - 4}` : '';
      semPillsHtml = `<button class="cc2-pill cc2-pill-offered" onclick="App.expandSemestersV2(event)" id="semesterPillsV2" data-expanded="0" title="Click to show all">Offered ${visible.join(' · ')}${more}</button>`;
    }

    // ── Counts For ─────────────────────────────────────────────────────
    let cfHtml = '';
    for (const majorCode of MAJOR_ORDER) {
      const majorMappings = mappings[majorCode];
      if (!majorMappings || majorMappings.length === 0) continue;
      for (const m of majorMappings) {
        const typeLabel = m.isGenEd ? 'GEN ED' : 'CORE';
        const safePath = m.fullPath.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        cfHtml += `
          <div class="cc2-counts-row cf-row-${majorCode.toLowerCase()}" data-nav-major="${majorCode}" data-nav-path="${safePath}">
            <span class="cc2-counts-badge">${majorCode}</span>
            <span class="cc2-counts-type">${typeLabel}</span>
            <span class="cc2-counts-text">${esc(m.shortLabel)}</span>
            <span class="cc2-counts-arrow">→</span>
          </div>`;
      }
    }
    if (!cfHtml) cfHtml = '<div style="font-size:12px;color:var(--text-tertiary);font-style:italic">This course does not count toward any tracked major requirements.</div>';

    // ── Prereq + Schedule (2-col block) ─────────────────────────
    const prereqHtml = prereq
      ? `<div class="cc2-prereq-text">${esc(prereq)}</div>`
      : `<div class="cc2-prereq-text cc2-prereq-none">None</div>`;

    let schedHtml = '';
    const dmCls = (dm) => {
      const d = (dm || '').toLowerCase();
      if (d.includes('remote')) return 'cc2-dm-remote';
      if (d.includes('in-person')) return 'cc2-dm-inperson';
      return 'cc2-dm-other';
    };

    // Filter by location
    let filtered = sections.slice();
    if (this.locationFilter === 'qatar') {
      filtered = filtered.filter(s => s.location && (s.location.includes('Qatar') || s.location.includes('Doha')));
    } else if (this.locationFilter === 'pittsburgh') {
      filtered = filtered.filter(s => s.location && s.location.includes('Pittsburgh'));
    }

    if (filtered.length > 0) {
      const first = filtered[0];
      const moreCount = filtered.length - 1;
      const timeStr = first.begin_time && first.begin_time !== 'TBA'
        ? `${esc(first.begin_time)}–${esc(first.end_time)}`
        : 'TBA';
      const dm = first.delivery_mode ? `<span class="cc2-dm-pill ${dmCls(first.delivery_mode)}">${esc(first.delivery_mode).toUpperCase()}</span>` : '';
      schedHtml = `
        <div class="cc2-sched-section">
          <div class="cc2-sched-secline">Sec ${esc(first.section)} · ${esc(first.days || 'TBA')} ${timeStr}</div>
          ${dm}
          ${moreCount > 0 ? `<button class="cc2-sched-more" onclick="App.expandScheduleV2(event)" id="cc2SchedMore" data-expanded="0">+${moreCount} more sections</button><div id="cc2SchedExtra" style="display:none;margin-top:6px;font-size:11px;color:var(--text-secondary);line-height:1.5"></div>` : ''}
        </div>`;
    } else {
      const campus = this.locationFilter === 'qatar' ? 'Qatar' : this.locationFilter === 'pittsburgh' ? 'Pittsburgh' : 'this filter';
      schedHtml = `<div style="font-size:12px;color:var(--text-tertiary);font-style:italic">Not offered at ${campus} for Fall 2026</div>`;
    }

    el.innerHTML = `
      <div class="course-card-v2">
        ${dcBannerHtml}

        <div class="cc2-header">
          <div class="cc2-code">${esc(course.course_code)}</div>
          <div class="cc2-units">${course.units || '?'} units</div>
        </div>
        <div class="cc2-name">${esc(course.course_name)}</div>

        <div class="cc2-pills">
          <span class="cc2-pill">${esc(deptName)} (${course.course_code.split('-')[0]})</span>
          ${locFlags.map(f => `<span class="cc2-pill">${f}</span>`).join('')}
          ${semPillsHtml}
        </div>

        <div class="cc2-section-title">Counts For</div>
        <div class="cc2-counts-list">${cfHtml}</div>

        <div class="cc2-grid-2">
          <div>
            <div class="cc2-section-title">Prerequisites</div>
            ${prereqHtml}
          </div>
          <div>
            <div class="cc2-section-title">Fall 2026</div>
            ${schedHtml}
          </div>
        </div>

        ${course.description ? `
          <div class="cc2-section-title">Description</div>
          <div class="cc2-description">${esc(course.description)}</div>
        ` : ''}
      </div>`;

    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = this.layoutMode === 'focused' ? 'flex' : 'none';

    this._cc2Sections = filtered;  // used by expand handler
  },

  expandSemestersV2(e) {
    e.stopPropagation();
    if (!this.selectedCourse) return;
    const btn = document.getElementById('semesterPillsV2');
    if (!btn) return;
    const semesters = sortSemesters(this.selectedCourse.offered || []);
    const expanded = btn.dataset.expanded === '1';
    if (expanded) {
      const visible = semesters.slice(0, 4);
      const more = semesters.length > 4 ? ` · +${semesters.length - 4}` : '';
      btn.textContent = 'Offered ' + visible.join(' · ') + more;
      btn.dataset.expanded = '0';
    } else {
      btn.textContent = 'Offered ' + semesters.join(' · ');
      btn.dataset.expanded = '1';
    }
  },

  expandScheduleV2(e) {
    e.stopPropagation();
    const btn = document.getElementById('cc2SchedMore');
    const extra = document.getElementById('cc2SchedExtra');
    if (!btn || !extra) return;
    const expanded = btn.dataset.expanded === '1';
    const sections = (this._cc2Sections || []).slice(1);
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
    const el = document.getElementById('rightBody');
    if (!el) return;
    const sections = this.treeSections[this.activeMajor];
    if (!sections) { el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No data</div></div>'; return; }

    let html = '<div class="tree-container">';

    // Degree requirements
    if (sections.degree.length > 0) {
      html += '<div class="tree-section-divider">Degree Requirements</div>';
      for (const node of sections.degree) {
        html += this.renderTreeNode(node, this.activeMajor, 0);
      }
    }

    // GenEd requirements
    if (sections.gened.length > 0) {
      html += '<div class="tree-section-divider">General Education</div>';
      for (const node of sections.gened) {
        // For GenEd, skip the wrapper "GenEd" node and render its children directly
        if (node.children && node.children.length > 0 && (node.rawLabel === 'GenEd' || node.rawLabel.includes('EY2022') || node.rawLabel.includes('EY2024'))) {
          // If it has a child also called 'GenEd', unwrap that too
          for (const child of node.children) {
            if (child.rawLabel === 'GenEd') {
              for (const grandchild of child.children) {
                html += this.renderTreeNode(grandchild, this.activeMajor, 0);
              }
            } else {
              html += this.renderTreeNode(child, this.activeMajor, 0);
            }
          }
        } else {
          html += this.renderTreeNode(node, this.activeMajor, 0);
        }
      }
    }

    html += '</div>';
    el.innerHTML = html;
  },

  renderTreeNode(node, major, depth) {
    const hasChildren = node.children && node.children.length > 0;
    const hasCourses = node.courses && node.courses.length > 0;
    const isExpandable = hasChildren || hasCourses;
    const expanded = this.isExpanded(major, node.path);
    const isHighlighted = this.highlightedPath === node.path;

    // Tree search filtering
    const matchesSearch = this.nodeMatchesSearch(node);
    if (this.treeSearchQuery && !matchesSearch) return '';

    const indent = depth * 18;
    const labelClass = depth === 0 ? 'tree-label tree-label-l1' : 'tree-label';

    // Filter courses by location
    const filteredCourses = (node.courses || []).filter(c => this.filterByLocation(c));
    const filteredTotalCourses = this.countFilteredCourses(node);

    // Rule chip
    let ruleHtml = '';
    if (node.rule) {
      ruleHtml = `<span class="rule-chip">${esc(node.rule.label)}</span>`;
    }

    // Course count
    let countHtml = '';
    if (!expanded && filteredTotalCourses > 0 && isExpandable) {
      countHtml = `<span class="course-count">${filteredTotalCourses} course${filteredTotalCourses !== 1 ? 's' : ''}</span>`;
    }

    const safePath = node.path.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let html = `<div class="tree-node">`;
    html += `<div class="tree-node-row ${isHighlighted ? 'highlighted' : ''}" data-tree-major="${major}" data-tree-path="${safePath}" style="padding-left:${16 + indent}px">`;
    html += `<span class="tree-arrow ${expanded ? 'expanded' : ''} ${!isExpandable ? 'leaf' : ''}">▶</span>`;
    html += `<span class="${labelClass}">${esc(node.label)}</span>`;
    html += ruleHtml;
    html += countHtml;
    html += `</div>`;

    // Children + courses
    if (isExpandable) {
      html += `<div class="tree-children ${expanded ? '' : 'collapsed'}">`;

      // Child nodes
      if (hasChildren) {
        for (const child of node.children) {
          html += this.renderTreeNode(child, major, depth + 1);
        }
      }

      // Leaf courses
      if (hasCourses) {
        const vm = computeViewMode(this.profile);
        for (const c of filteredCourses) {
          const fullCourse = this.courseIndex[c.code] || c;
          const alsoMajors = getAlsoCountsFor(fullCourse, major);
          const isActive = this.selectedCourse && this.selectedCourse.course_code === c.code;
          const courseIndent = 16 + (depth + 1) * 18 + 16; // extra indent for leaf

          // Double-counter tag (focused-dual): if this course also fills the secondary, tag it
          let dcTag = '';
          if (vm === 'focused-dual' && fullCourse._doubleCounter) {
            const other = (this.profile.secondary === major) ? this.profile.primary : this.profile.secondary;
            if (other) {
              dcTag = `<span class="dc-leaf-tag dc-leaf-tag-${other.toLowerCase()}">${other}</span>`;
            }
          }
          // Multi-program chip (cross-program view, 3+ programs)
          let mpChip = '';
          if (vm === 'cross-program' && (fullCourse._programCount || 0) >= 3) {
            mpChip = `<span class="mp-chip">${fullCourse._programCount} programs</span>`;
          }

          html += `<div class="tree-course ${isActive ? 'active-course' : ''}" style="padding-left:${courseIndent}px" data-course-code="${esc(c.code)}">`;
          html += `<span class="tree-course-code">${esc(c.code)}</span>`;
          html += `<span class="tree-course-name">${esc(c.name)}</span>`;
          if (c.units) html += `<span class="tree-course-units">${c.units}u</span>`;
          if (alsoMajors.length > 0 && vm !== 'focused-dual' && vm !== 'cross-program') {
            html += `<span class="also-tags">${alsoMajors.map(m => `<span class="also-tag also-tag-${m.toLowerCase()}">${m}</span>`).join('')}</span>`;
          }
          html += dcTag;
          html += mpChip;
          html += `</div>`;
        }
      }

      html += `</div>`;
    }

    html += `</div>`;
    return html;
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
    this.selectedCourse = course;
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
