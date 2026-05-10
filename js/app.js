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
    // Stub — implemented in Task 12
    console.log('finish onboarding', this._onboardingState);
  },

  _cancelOnboarding() {
    // Stub — implemented in Task 12
    console.log('cancel onboarding');
  },

  // ── Shell Rendering ───────────────────────────────────────
  renderShell() {
    const isSplit = this.layoutMode === 'split';
    document.getElementById('app').innerHTML = `
      <nav class="navbar">
        <div class="navbar-brand" onclick="App.reset()">CountsFor <span class="subtitle">CMU-Q</span></div>
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
            ${MAJOR_ORDER.map(m => `<button class="major-tab ${m===this.activeMajor?'active':''}" data-major="${m}" onclick="App.switchMajor('${m}')">${m}</button>`).join('')}
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
  bindGlobalEvents() {
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
        return '<div class="typeahead-item" data-idx="' + i + '" onclick="App.selectSearchResult(' + i + ')">' +
          '<span class="typeahead-code">' + esc(c.course_code) + '</span>' +
          '<span class="typeahead-name">' + esc(c.course_name) + '</span>' +
          matchHint +
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

  renderLeftEmpty() {
    const el = document.getElementById('leftBody');
    if (!el) return;
    // Hide inline explore button when no course is selected
    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = 'none';
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <div class="empty-text">Type a course code or name above</div>
        <div class="empty-hint">
          Try <code>15-122</code> · <code>21-259</code> · <code>73-102</code> · <code>67-262</code> · <code>70-311</code>
        </div>
      </div>`;
  },

  renderCourseCard(course) {
    const el = document.getElementById('leftBody');
    if (!el) return;

    const deptName = getDeptName(course.course_code);
    const semesters = sortSemesters(course.offered || []);
    const prereq = formatPrereq(course.prerequisites);
    const mappings = getCourseMappings(course);

    // Location flags
    const locFlags = [];
    if (course.offered_qatar) locFlags.push('🇶🇦 Qatar');
    if (course.offered_pitts) locFlags.push('🇺🇸 Pittsburgh');

    // Delivery mode from SOC sections
    const deliveryModes = new Set();
    const sections = course.soc_sections || [];
    for (const s of sections) {
      if (s.delivery_mode) deliveryModes.add(s.delivery_mode);
    }

    // Build counts-for section
    let cfHtml = '';
    for (const majorCode of MAJOR_ORDER) {
      const majorMappings = mappings[majorCode];
      if (!majorMappings || majorMappings.length === 0) continue;

      for (const m of majorMappings) {
        const typeLabel = m.isGenEd ? 'GEN ED' : 'CORE';
        const typeClass = m.isGenEd ? 'cf-type-gened' : 'cf-type-core';
        const safePath = m.fullPath.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        cfHtml += `
          <div class="cf-row cf-row-${majorCode.toLowerCase()}" data-nav-major="${majorCode}" data-nav-path="${safePath}">
            <div class="cf-badge cf-badge-${majorCode.toLowerCase()}">${majorCode} <span class="cf-type ${typeClass}">${typeLabel}</span></div>
            <div class="cf-text">${esc(m.shortLabel)}</div>
          </div>`;
      }
    }

    if (!cfHtml) {
      cfHtml = '<div style="padding:8px 0;color:var(--text-tertiary);font-size:0.8rem;font-style:italic;">This course does not count toward any tracked major requirements.</div>';
    }

    // Build SOC schedule section (filtered by location)
    let schedHtml = '';
    const dayFullForms = { M:'Monday', T:'Tuesday', W:'Wednesday', R:'Thursday', F:'Friday', U:'Sunday', S:'Saturday' };
    const expandDays = (d) => {
      if (!d) return 'TBA';
      const full = d.split('').map(c => dayFullForms[c] || c).join(', ');
      return '<span title="' + full + '">' + esc(d) + '</span>';
    };

    if (sections.length > 0) {
      let qatarSections = sections.filter(s => s.location && (s.location.includes('Qatar') || s.location.includes('Doha')));
      let pittsSections = sections.filter(s => s.location && s.location.includes('Pittsburgh'));
      let otherSections = sections.filter(s => s.location && !s.location.includes('Qatar') && !s.location.includes('Doha') && !s.location.includes('Pittsburgh'));

      // Filter by active location
      if (this.locationFilter === 'qatar') { pittsSections = []; otherSections = []; }
      if (this.locationFilter === 'pittsburgh') { qatarSections = []; otherSections = []; }

      const buildRows = (secs) => secs.map(s => {
        const dmClass = (s.delivery_mode || '').toLowerCase().includes('remote') ? 'dm-remote'
          : (s.delivery_mode || '').toLowerCase().includes('in-person') ? 'dm-inperson'
          : 'dm-other';
        return '<tr>' +
          '<td class="sched-sec">' + esc(s.section) + '</td>' +
          '<td class="sched-days">' + expandDays(s.days) + '</td>' +
          '<td class="sched-time">' + (s.begin_time && s.begin_time !== 'TBA' ? esc(s.begin_time) + '\u2013' + esc(s.end_time) : 'TBA') + '</td>' +
          '<td><span class="dm-badge ' + dmClass + '">' + (esc(s.delivery_mode) || '\u2014') + '</span></td>' +
        '</tr>';
      }).join('');

      const hasAnySections = qatarSections.length > 0 || pittsSections.length > 0 || otherSections.length > 0;

      if (hasAnySections) {
        schedHtml = '<div class="sched-legend">U=Sun, M=Mon, T=Tue, W=Wed, R=Thu, F=Fri, S=Sat</div>';
        schedHtml += '<div class="sched-container">';
        if (qatarSections.length > 0) {
          schedHtml += '<div class="sched-loc-group"><div class="sched-loc-header"><span class="sched-loc-flag">\uD83C\uDDF6\uD83C\uDDE6</span> Doha, Qatar</div>';
          schedHtml += '<table class="sched-table">' + buildRows(qatarSections) + '</table></div>';
        }
        if (pittsSections.length > 0) {
          schedHtml += '<div class="sched-loc-group"><div class="sched-loc-header"><span class="sched-loc-flag">\uD83C\uDDFA\uD83C\uDDF8</span> Pittsburgh, PA</div>';
          schedHtml += '<table class="sched-table">' + buildRows(pittsSections) + '</table></div>';
        }
        if (otherSections.length > 0) {
          schedHtml += '<div class="sched-loc-group"><div class="sched-loc-header">\uD83D\uDCCD Other Locations</div>';
          schedHtml += '<table class="sched-table">' + buildRows(otherSections) + '</table></div>';
        }
        schedHtml += '</div>';
      } else {
        const campus = this.locationFilter === 'qatar' ? 'Qatar' : 'Pittsburgh';
        schedHtml = '<div style="padding:8px 0;color:var(--text-tertiary);font-size:0.8rem;font-style:italic;">No sections at ' + campus + ' for Fall 2026</div>';
      }
    } else {
      schedHtml = '<div style="padding:8px 0;color:var(--text-tertiary);font-size:0.8rem;font-style:italic;">Schedule not available for Fall 2026</div>';
    }

    el.innerHTML = `
      <div class="course-card">
        <div class="cc-grid">
          <div class="cc-grid-col cc-grid-left">
            <div class="cc-header">
              <div class="cc-code">${esc(course.course_code)}</div>
              <div class="cc-name">${esc(course.course_name)}</div>
              <div class="cc-meta">
                <span class="cc-pill">${esc(deptName)}</span>
                <span class="cc-pill">${course.units || '?'} units</span>
                ${locFlags.map(f => `<span class="cc-pill"><span class="emoji">${f.split(' ')[0]}</span> ${f.split(' ').slice(1).join(' ')}</span>`).join('')}
              </div>
              ${deliveryModes.size > 0 ? `
                <div class="cc-delivery-modes">
                  ${[...deliveryModes].map(dm => {
                    const cls = dm.toLowerCase().includes('remote') ? 'dm-remote'
                      : dm.toLowerCase().includes('in-person') ? 'dm-inperson' : 'dm-other';
                    return `<span class="dm-badge ${cls}">${esc(dm)}</span>`;
                  }).join('')}
                </div>` : ''}
              ${semesters.length > 0 ? `
                <div class="cc-semesters" id="semesterPills">
                  ${semesters.slice(0, 8).map(s => {
                    const tip = s.charAt(0) === 'F' ? 'Fall 20' + s.slice(1) : s.charAt(0) === 'S' ? 'Spring 20' + s.slice(1) : s.charAt(0) === 'M' ? 'Mini (Summer) 20' + s.slice(1) : s;
                    return '<span class="sem-pill" title="' + tip + '">' + s + '</span>';
                  }).join('')}
                  ${semesters.length > 8 ? '<span class="sem-pill sem-pill-more" onclick="App.expandSemesters(event)" title="Click to show all semesters">+' + (semesters.length - 8) + '</span>' : ''}
                </div>` : ''}
            </div>

            ${prereq ? `
              <div class="cc-section-title">Prerequisites</div>
              <div class="cc-prereq">${esc(prereq)}</div>
            ` : `
              <div class="cc-section-title">Prerequisites</div>
              <div class="cc-prereq cc-prereq-none">None</div>
            `}

            ${course.description ? `
              <div class="cc-section-title">Description</div>
              <div class="cc-description">${esc(course.description)}</div>
            ` : ''}
          </div>

          <div class="cc-grid-col cc-grid-right">
            <div class="cc-section-title" style="margin-top:0;">Counts For</div>
            <div class="counts-for-list">${cfHtml}</div>

            <div class="cc-section-title">Fall 2026 Schedule</div>
            ${schedHtml}
          </div>
        </div>


      </div>`;

    // Show/hide inline explore button
    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = this.layoutMode === 'focused' ? 'flex' : 'none';
  },

  // Expand all hidden semester pills
  expandSemesters(e) {
    e.stopPropagation();
    if (!this.selectedCourse) return;
    const semesters = sortSemesters(this.selectedCourse.offered || []);
    const container = document.getElementById('semesterPills');
    if (!container) return;
    container.innerHTML = semesters.map(s => {
      const tip = s.charAt(0) === 'F' ? 'Fall 20' + s.slice(1) : s.charAt(0) === 'S' ? 'Spring 20' + s.slice(1) : s.charAt(0) === 'M' ? 'Mini (Summer) 20' + s.slice(1) : s;
      return '<span class="sem-pill" title="' + tip + '">' + s + '</span>';
    }).join('');
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
        for (const c of filteredCourses) {
          const alsoMajors = getAlsoCountsFor(this.courseIndex[c.code] || c, major);
          const isActive = this.selectedCourse && this.selectedCourse.course_code === c.code;
          const courseIndent = 16 + (depth + 1) * 18 + 16; // extra indent for leaf

          html += `<div class="tree-course ${isActive ? 'active-course' : ''}" style="padding-left:${courseIndent}px" data-course-code="${esc(c.code)}">`;
          html += `<span class="tree-course-code">${esc(c.code)}</span>`;
          html += `<span class="tree-course-name">${esc(c.name)}</span>`;
          if (c.units) html += `<span class="tree-course-units">${c.units}u</span>`;
          if (alsoMajors.length > 0) {
            html += `<span class="also-tags">${alsoMajors.map(m => `<span class="also-tag also-tag-${m.toLowerCase()}">${m}</span>`).join('')}</span>`;
          }
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
