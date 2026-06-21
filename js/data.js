// ============================================================
// CountsFor — Data Transformation Layer
// Parses API data into trees, indexes, and display-ready structures
// ============================================================

const MAJOR_META = {
  CS: { code: 'CS', label: 'Computer Science',       color: 'cs', degree: 'B.S. in Computer Science' },
  IS: { code: 'IS', label: 'Information Systems',    color: 'is', degree: 'B.S. in Information Systems' },
  BA: { code: 'BA', label: 'Business Administration',color: 'ba', degree: 'B.S. in Business Administration' },
  BS: { code: 'BS', label: 'Biological Sciences',    color: 'bs', degree: 'B.S. in Biological Sciences' },
  AI: { code: 'AI', label: 'Artificial Intelligence', color: 'ai', degree: 'B.S. in Artificial Intelligence', dataPending: true },
  GS: { code: 'GS', label: 'General Studies',         color: 'gs', degree: 'B.S. in General Studies', dataPending: true },
};

const MAJOR_ORDER = ['CS', 'IS', 'BA', 'BS'];
// AI and GS scaffolded — add to MAJOR_ORDER once Hind supplies requirement specs (T7/T8).

const MAJOR_BRAND = {
  CS: '#C41230',
  IS: '#D97706',
  BA: '#2563EB',
  BS: '#059669',
  AI: '#7C3AED',
  GS: '#64748B',
};

// First match in this ordered list wins. rule.color === null means "use major brand".
const ACCENT_RULES = [
  { match: /math|probabil/i,           color: '#6b21a8' },
  { match: /elective|technical/i,      color: '#047857' },
  { match: /humanit|arts|gened/i,      color: '#B45309' },
  { match: /science|lab/i,             color: '#047857' },
  { match: /core|required/i,           color: null /* major brand */ },
];

function pickAccentColor(label, activeMajor) {
  const brand = MAJOR_BRAND[activeMajor] || '#C41230';
  if (!label) return brand;
  for (const rule of ACCENT_RULES) {
    if (rule.match.test(label)) {
      return rule.color || brand;
    }
  }
  return brand;
}

// ── Label overrides for nicer display ──────────────────────
const LABEL_OVERRIDES = {
  'BS in Computer Science': 'CS Degree Requirements',
  'BS in Information Systems': 'IS Degree Requirements',
  'BS in Business Administration': 'BA Degree Requirements',
  'BS in Biological Sciences': 'Biology Degree Requirements',
  'EY2022 Qatar Business Administration - University Core Requirements': 'University Core',
  'EY2024+ Qatar Business Administration - University Core Requirements': 'University Core',
  'Mathematics and Probability': 'Math & Probability',
  'Computer Science': 'Computer Science Core',
  'Science and Engineering': 'Science & Engineering',
  'Science and Engineering (CS, AI, & HCI)': 'Sci & Eng (CS/AI/HCI)',
  'Science and Engineering (CB)': 'Sci & Eng (Comp. Bio)',
  'Science/Engineering, Any Department (4 courses)': 'Any Department (4 courses)',
  'Science/Engineering, Same Department (2 courses)': 'Same Department (2 courses)',
  'Concentration - select 1 concentration from the list below': 'Concentrations',
  'Information Systems Core': 'IS Core',
  'Information Systems Breadth': 'IS Breadth',
  'Technical Core': 'Technical Core',
  'Disciplinary Perspectives': 'Disciplinary Perspectives',
  'Business Foundations': 'Business Foundations',
  'Biological Sciences': 'Biological Sciences Core',
  'Mathematics, Physics and Computer Science': 'Math, Physics & CS',
  'Biological Sciences Electives': 'Bio Electives',
  'Advanced Biological Sciences Electives': 'Advanced Bio Electives',
  'Departmental Electives Group': 'Departmental Electives',
  'Interdisciplinary Electives Group': 'Interdisciplinary Electives',
  'Cultural/Global Understanding': 'Cultural & Global Understanding',
  'Cognition, Choice, and Behavior (CS, CB, & HCI)': 'Cognition, Choice & Behavior',
  'Category 1: Cognition': 'Category 1: Cognition',
  'Category 2: Economic, Political, and Social Institutions': 'Category 2: Institutions',
  'Category 3: Cultural Analysis': 'Category 3: Cultural Analysis',
  'Concentration': 'Concentrations',
  'Data Science': 'Data Science',
  'Data Science Concentration': 'Data Science Concentration',
  'Digitalization': 'Digitalization',
  'Digitalization Concentration': 'Digitalization Concentration',
  'Information Security and Privacy': 'Info Security & Privacy',
  'Information Security and Privacy Concentration': 'Info Security Concentration',
  'Quantitative Analysis and Research Methods': 'Quantitative Analysis',
  'Innovation and Entrepreneurship': 'Innovation & Entrepreneurship',
  'Professional Communications': 'Professional Communications',
  'Additional Disciplines (Business/Design/Engineering)': 'Business/Design/Engineering',
  'Managing Digital Transformation': 'Managing Digital Transformation',
  'Perspectives on Justice and Injustice': 'Justice & Injustice',
  'Intercultural and Global Inquiry': 'Intercultural & Global Inquiry',
  'Management Game/ Consulting Project': 'Management Game / Consulting',
  'Concentration - select 1 concentration from the list below': 'Concentrations',
  'Global Economics & Business': 'Global Economics & Business',
  'Business Analytics & Technologies': 'Business Analytics & Tech',
  'Operations Management': 'Operations Management',
  'Strategic Management': 'Strategic Management',
  'Marketing Management': 'Marketing Management',
  'Required Biology Electives': 'Required Bio Electives',
  'Recommended Biology Electives': 'Recommended Bio Electives',
  'Non-Technical Breadth Electives': 'Non-Technical Breadth',
  'CMU First Year Writing': 'First Year Writing',
  'Global, Cultural, and Diverse Perspectives': 'Global & Cultural Perspectives',
  'Informational Literacy': 'Informational Literacy',
  'Scientific Reasoning': 'Scientific Reasoning',
};

// ── Fulfillment rules (manually annotated from audit specs) ──
const FULFILLMENT_RULES = {};

function setRule(major, pathSuffix, rule) {
  if (!FULFILLMENT_RULES[major]) FULFILLMENT_RULES[major] = {};
  FULFILLMENT_RULES[major][pathSuffix] = rule;
}

// CS rules
setRule('CS', 'Computer Science', { type: 'take_all', label: 'take all' });
setRule('CS', 'Artificial Intelligence Elective', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'Domains Elective', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'Logics & Languages Elective', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'Software Systems Elective', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'Introduction to Computer Systems', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'Mathematics and Probability', { type: 'take_all', label: 'take all' });
setRule('CS', 'Calculus', { type: 'take_all', label: 'take all' });
setRule('CS', '3D Calculus', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'Mathematical Foundations for CS', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'Matrix/Linear Algebra', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'Probability', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'Probability and Statistics 36-22x sequence', { type: 'optional', label: 'optional path' });
setRule('CS', 'Probability and Statistics 36-23x sequence', { type: 'optional', label: 'optional path' });
setRule('CS', 'Technical Communication', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'SCS Electives', { type: 'min_units', units: 19, label: '≥19 units' });
setRule('CS', 'First-year Immigration Course', { type: 'optional', label: 'optional' });
setRule('CS', 'Computing @ Carnegie Mellon', { type: 'required', label: 'required' });
setRule('CS', 'First Year Writing', { type: 'pick', n: 1, label: 'pick 1' });
setRule('CS', 'Humanities/Arts Electives', { type: 'min_units', units: 30, label: '≥30 units' });
setRule('CS', 'Category 1: Cognition', { type: 'pick', n: 1, label: '≥1 course' });
setRule('CS', 'Category 2: Economic, Political, and Social Institutions', { type: 'pick', n: 1, label: '≥1 course' });
setRule('CS', 'Category 3: Cultural Analysis', { type: 'pick', n: 1, label: '≥1 course' });
setRule('CS', 'Science and Engineering', { type: 'min_units', units: 30, label: '≥30 units' });

// IS rules
setRule('IS', 'Information Systems Core', { type: 'take_all', label: 'take all' });
setRule('IS', 'HCI Requirement', { type: 'pick', n: 1, label: 'pick 1' });
setRule('IS', 'Managing Digital Transformation', { type: 'pick', n: 1, label: 'pick 1' });
setRule('IS', 'Professional Communications', { type: 'pick', n: 1, label: 'pick 1' });
setRule('IS', 'Quantitative Analysis and Research Methods', { type: 'pick', n: 1, label: 'pick 1' });
setRule('IS', 'Innovation and Entrepreneurship', { type: 'pick', n: 1, label: 'pick 1' });
setRule('IS', 'Computer Science Requirement', { type: 'pick', n: 1, label: 'pick 1' });
setRule('IS', 'Mathematics', { type: 'pick', n: 1, label: 'pick 1' });
setRule('IS', 'Data Science Technical Core', { type: 'pick', n: 1, label: 'pick any' });
setRule('IS', 'Data Science Applications', { type: 'pick', n: 1, label: 'pick any' });
setRule('IS', 'Summative Course', { type: 'required', label: 'required' });
setRule('IS', 'Enabling Methods, Techniques and Tools', { type: 'pick', n: 1, label: 'pick any' });
setRule('IS', 'Orthogonal Topics', { type: 'pick', n: 1, label: 'pick any' });
setRule('IS', 'Regulatory and Behavioral Core', { type: 'pick', n: 1, label: 'pick any' });
setRule('IS', 'Technical Core', { type: 'pick', n: 1, label: 'pick any' });
setRule('IS', 'Data Science Concentration', { type: 'min_units', units: 36, label: '≥36 units' });
setRule('IS', 'Communication', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'Computational Thinking', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'Contextual Thinking', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'Scientific Inquiry', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'Data Analysis', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'Intercultural and Global Inquiry', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'Humanities', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'Social Sciences', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'The Arts', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'Logic/Mathematical Reasoning', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'Additional Disciplines (Business/Design/Engineering)', { type: 'min_units', units: 6, label: '≥6 units' });
setRule('IS', 'Grand Challenge Seminar', { type: 'min_units', units: 9, label: '≥9 units' });
setRule('IS', 'Perspectives on Justice and Injustice', { type: 'min_units', units: 9, label: '≥9 units' });

// BA rules
setRule('BA', 'Business Core', { type: 'take_all', label: 'take all' });
setRule('BA', 'BLE', { type: 'take_all', label: 'take all' });
setRule('BA', 'Calculus', { type: 'required', label: 'required' });
setRule('BA', 'Multivariate Analysis', { type: 'required', label: 'required' });
setRule('BA', 'Models of Optimization', { type: 'required', label: 'required' });
setRule('BA', 'Microeconomics', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BA', 'Intermed. Micro or Macro', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BA', 'Prob/Stats for Business', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BA', 'Regression Analysis', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BA', 'Management Game/ Consulting Project', { type: 'take_all', label: 'take all' });
setRule('BA', 'Business Electives', { type: 'min_units', units: 18, label: '≥18 units' });
setRule('BA', 'Required Courses', { type: 'take_all', label: 'take all' });
setRule('BA', 'Two Area Electives', { type: 'pick', n: 2, label: 'pick 2' });
setRule('BA', 'Three Area Electives', { type: 'pick', n: 3, label: 'pick 3' });
setRule('BA', 'Choose One', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BA', 'Select 2 Mini Writing Courses', { type: 'pick', n: 2, label: 'pick 2' });
setRule('BA', 'Semester Long Writing Course', { type: 'pick', n: 1, label: 'pick 1' });

// BS rules
setRule('BS', 'Modern Biology', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Colloquia', { type: 'take_all', label: 'take all' });
setRule('BS', 'Genetics', { type: 'required', label: 'required' });
setRule('BS', 'Biochemistry', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Introduction to Computational Biology', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Cell Biology', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Experimental Techniques in Molecular Biology', { type: 'required', label: 'required' });
setRule('BS', 'Experimental Biochemistry', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Topics in Research', { type: 'take_all', label: 'take all' });
setRule('BS', 'Advanced Biological Sciences Electives', { type: 'min_units', units: 18, label: '≥18 units' });
setRule('BS', 'Departmental Electives Group', { type: 'pick', n: 1, label: 'if needed' });
setRule('BS', 'Interdisciplinary Electives Group', { type: 'max_courses', n: 3, label: '≤3 courses' });
setRule('BS', 'Undergraduate Research', { type: 'max_units', units: 18, label: '≤18 units' });
setRule('BS', 'Modern Chemistry I', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Modern Chemistry II', { type: 'required', label: 'required' });
setRule('BS', 'Organic Chemistry I', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Organic Chemistry II', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'General Chemistry Lab', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Organic Chemistry Lab', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Programming', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Calculus I', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Calculus II', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Physics I', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Physics II', { type: 'pick', n: 1, label: 'pick 1' });
setRule('BS', 'Non-Technical Breadth Electives', { type: 'min_units', units: 63, label: '≥63 units' });
setRule('BS', 'STEM Course', { type: 'pick', n: 1, label: 'elective' });

// ── Build requirement tree from courses ──────────────────────
function buildRequirementTree(courses, majorCode) {
  const root = { label: MAJOR_META[majorCode].degree, children: {}, courses: [], path: '' };
  
  for (const course of courses) {
    const majorReqs = (course.requirements && course.requirements[majorCode]) || [];
    for (const req of majorReqs) {
      const parts = req.requirement.split('---');
      let node = root;
      let pathSoFar = '';
      
      for (let i = 0; i < parts.length; i++) {
        const segment = parts[i];
        pathSoFar = pathSoFar ? pathSoFar + '---' + segment : segment;
        
        if (!node.children[segment]) {
          node.children[segment] = {
            label: LABEL_OVERRIDES[segment] || segment,
            rawLabel: segment,
            children: {},
            courses: [],
            path: pathSoFar,
            depth: i + 1,
            isGenEd: false,
          };
        }
        node = node.children[segment];
      }
      
      // Add course to the leaf node
      node.courses.push({
        code: course.course_code,
        name: course.course_name,
        units: course.units,
        department: course.department,
        offered_qatar: course.offered_qatar,
        offered_pitts: course.offered_pitts,
        type: req.type, // true = gened, false = core
        prerequisites: course.prerequisites,
        offered: course.offered || [],
      });
      node.isGenEd = req.type;
    }
  }
  
  return root;
}

// ── Convert tree children object to sorted array ────────────
function normalizeTree(node, majorCode, depth) {
  const childArray = [];
  for (const [key, child] of Object.entries(node.children)) {
    normalizeTree(child, majorCode, depth + 1);
    
    // Count total courses recursively
    child.totalCourses = countTreeCourses(child);
    
    // Attach fulfillment rule
    child.rule = findRule(majorCode, child.rawLabel, child.path);
    
    childArray.push(child);
  }
  node.children = childArray;
  return node;
}

function countTreeCourses(node) {
  let count = node.courses.length;
  for (const child of (Array.isArray(node.children) ? node.children : Object.values(node.children))) {
    count += countTreeCourses(child);
  }
  return count;
}

function findRule(majorCode, rawLabel, fullPath) {
  const majorRules = FULFILLMENT_RULES[majorCode];
  if (!majorRules) return null;
  
  // Try exact match on raw label
  if (majorRules[rawLabel]) return majorRules[rawLabel];
  
  // Try matching on last segment of path
  const parts = fullPath.split('---');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (majorRules[parts[i]]) return majorRules[parts[i]];
  }
  
  return null;
}

// ── Separate degree requirements from GenEd ─────────────────
function splitTreeSections(tree, majorCode) {
  const degree = [];
  const gened = [];
  
  for (const child of tree.children) {
    // Check if this top-level node is GenEd
    const isGenedSection = child.rawLabel === 'GenEd' || 
                           child.rawLabel.includes('University Core') ||
                           child.rawLabel.includes('EY2022') ||
                           child.rawLabel.includes('EY2024');
    
    if (isGenedSection) {
      gened.push(child);
    } else {
      degree.push(child);
    }
  }
  
  return { degree, gened };
}

// ── Build course index ──────────────────────────────────────
function buildCourseIndex(courses) {
  const index = {};
  for (const course of courses) {
    index[course.course_code] = course;
  }
  return index;
}

// ── Get display-ready mappings for a course ─────────────────
function getCourseMappings(course) {
  const mappings = {};
  
  for (const majorCode of MAJOR_ORDER) {
    const reqs = (course.requirements && course.requirements[majorCode]) || [];
    if (reqs.length === 0) continue;
    
    mappings[majorCode] = reqs.map(req => {
      const parts = req.requirement.split('---');
      // Show last 2 meaningful segments
      let shortLabel;
      if (parts.length >= 3) {
        shortLabel = parts.slice(-2).map(p => LABEL_OVERRIDES[p] || p).join(' → ');
      } else if (parts.length === 2) {
        shortLabel = (LABEL_OVERRIDES[parts[1]] || parts[1]);
      } else {
        shortLabel = (LABEL_OVERRIDES[parts[0]] || parts[0]);
      }
      
      return {
        shortLabel,
        fullPath: req.requirement,
        isGenEd: req.type,
        parts: parts,
      };
    });
  }
  
  return mappings;
}

// ── Get "also counts for" tags for a course in a given major ──
function getAlsoCountsFor(course, currentMajor) {
  const others = [];
  for (const m of MAJOR_ORDER) {
    if (m === currentMajor) continue;
    const reqs = (course.requirements && course.requirements[m]) || [];
    if (reqs.length > 0) {
      others.push(m);
    }
  }
  return others;
}

// ── Offering likelihood (rule-based, no ML) ──────────────────
// Uses the `offered` history on each course (codes like "S22", "F23", "M24",
// "N25") to estimate whether a course is likely to run in a target season.
// Spec § 12: prefer simple, honest signal over fabricated prediction.

const SEASON_NAME = { S: 'Spring', M: 'Summer', N: 'Fall mini', F: 'Fall' };

function _seasonName(code) {
  return SEASON_NAME[code] || code;
}

function predictOffering(course, targetSeason /* 'S' | 'M' | 'N' | 'F' */) {
  if (!course || !targetSeason || !SEASON_NAME[targetSeason]) {
    return { state: 'unknown', reason: 'No prediction available.' };
  }
  const hist = Array.isArray(course.offered) ? course.offered : [];
  // De-duplicate identical entries — some scraping passes wrote dupes.
  const seen = new Set();
  const codes = hist.filter(c => {
    if (!c || seen.has(c)) return false;
    seen.add(c);
    return true;
  });
  if (codes.length < 3) {
    return { state: 'unknown', reason: 'Limited offering history.' };
  }
  const counts = { S: 0, M: 0, N: 0, F: 0 };
  for (const c of codes) if (counts[c[0]] !== undefined) counts[c[0]]++;
  const total = codes.length;
  const share = counts[targetSeason] / total;
  const seasonLabel = _seasonName(targetSeason);
  if (share >= 0.5) {
    return { state: 'likely',   reason: `Typically offered in ${seasonLabel}.` };
  }
  if (counts[targetSeason] === 0) {
    return { state: 'unlikely', reason: `Not offered in ${seasonLabel} in recent years.` };
  }
  if (share < 0.2) {
    return { state: 'rare',     reason: `Rarely offered in ${seasonLabel}.` };
  }
  return { state: 'mixed', reason: `Sometimes offered in ${seasonLabel}.` };
}

// ── Sort semesters chronologically ────────────────────────────
function sortSemesters(semesters) {
  if (!semesters || !Array.isArray(semesters)) return [];
  const seasonOrder = { 'S': 1, 'M': 2, 'N': 3, 'F': 4 };
  return [...new Set(semesters)].sort((a, b) => {
    const yearA = parseInt(a.substring(1));
    const yearB = parseInt(b.substring(1));
    if (yearA !== yearB) return yearB - yearA; // newest first
    return (seasonOrder[b[0]] || 0) - (seasonOrder[a[0]] || 0);
  });
}

// ── Department code to name ──────────────────────────────────
const DEPT_NAMES = {
  '02': 'Computational Biology', '03': 'Biological Sciences', '05': 'HCI',
  '06': 'Biomedical Engineering', '07': 'SCS Interdisciplinary', '08': 'Computational Biology',
  '09': 'Chemistry', '10': 'Machine Learning', '11': 'Language Technologies',
  '12': 'Civil & Environmental Eng', '15': 'Computer Science', '16': 'Robotics',
  '17': 'Software Engineering', '18': 'ECE', '19': 'EPP', '21': 'Mathematics',
  '24': 'Mechanical Engineering', '27': 'BME', '33': 'Physics', '36': 'Statistics',
  '38': 'Biology Collaborative', '42': 'Biomedical Engineering',
  '48': 'Architecture', '49': 'EPP', '51': 'Drama', '57': 'Design',
  '60': 'Music', '62': 'Art', '66': 'EPP', '67': 'Information Systems',
  '69': 'Athletics', '70': 'Business/Tepper', '73': 'Economics',
  '76': 'English', '79': 'History', '80': 'Philosophy',
  '82': 'Modern Languages', '84': 'Political Science', '85': 'Psychology',
  '88': 'Sociology', '95': 'Information Networking', '99': 'CMU-Wide',
};

function getDeptName(courseCode) {
  const prefix = courseCode.replace('-', '').substring(0, 2);
  return DEPT_NAMES[prefix] || `Dept ${prefix}`;
}

// ── Semester / modality filters (Phase 3) ────────────────────
const SEMESTER_OPTIONS = [
  { code: 'F26', label: 'Fall 2026' },
  { code: 'M26', label: 'Summer 2026' },
  { code: 'S26', label: 'Spring 2026' },
  { code: 'F25', label: 'Fall 2025' },
  { code: 'M25', label: 'Summer 2025' },
];

const MODALITY_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'in_person', label: 'In Person' },
  { id: 'remote', label: 'Remote' },
  { id: 'hybrid', label: 'Hybrid' },
];

function semesterLabel(code) {
  const hit = SEMESTER_OPTIONS.find(s => s.code === code);
  return hit ? hit.label : code;
}

function getCourseOfferings(course) {
  if (!course) return [];
  if (Array.isArray(course.offerings) && course.offerings.length) {
    return course.offerings;
  }
  // Legacy soc_sections → normalized offering shape
  return (course.soc_sections || []).map(s => ({
    semester: s.semester || semesterLabel(s.semester_code || 'F26'),
    semester_code: s.semester_code || 'F26',
    campus: s.campus || (s.location && s.location.includes('Qatar') ? 'Qatar'
      : s.location && s.location.includes('Pittsburgh') ? 'Pittsburgh' : null),
    section: s.section,
    modality: s.modality || normalizeOfferingModality(s.delivery_mode),
    units: course.units,
    days_times: s.days_times || formatLegacyDaysTimes(s),
    instructor: s.instructor || '',
    location: s.location,
    delivery_mode_raw: s.delivery_mode,
  }));
}

function formatLegacyDaysTimes(s) {
  const days = s.days || 'TBA';
  if (s.begin_time && s.begin_time !== 'TBA' && s.end_time) {
    return `${days} ${s.begin_time}-${s.end_time}`;
  }
  return days;
}

function normalizeOfferingModality(raw) {
  const d = (raw || '').toLowerCase();
  if (!d) return 'In Person';
  if (d.includes('remote only') || d === 'remote') return 'Remote';
  if (d.includes('hybrid') || (d.includes('remote') && d.includes('in-person'))) return 'Hybrid';
  if (d.includes('remote')) return 'Remote';
  return 'In Person';
}

function modalityFilterMatches(offeringModality, filterId) {
  if (!filterId || filterId === 'all') return true;
  const m = (offeringModality || 'In Person').toLowerCase().replace(/\s+/g, '_');
  if (filterId === 'in_person') return m === 'in_person';
  return m === filterId;
}

function campusFilterMatches(offeringCampus, locationFilter) {
  if (!locationFilter || locationFilter === 'all') return true;
  if (locationFilter === 'qatar') return offeringCampus === 'Qatar';
  if (locationFilter === 'pittsburgh') return offeringCampus === 'Pittsburgh';
  return true;
}

function filterOfferings(offerings, { semesterCode, locationFilter, modalityFilter }) {
  return (offerings || []).filter(o => {
    if (semesterCode && o.semester_code !== semesterCode) return false;
    if (!campusFilterMatches(o.campus, locationFilter)) return false;
    if (!modalityFilterMatches(o.modality, modalityFilter)) return false;
    return true;
  });
}

function courseHasMatchingOffering(course, filters) {
  const all = getCourseOfferings(course);
  if (all.length === 0) {
    if (filters.semesterCode) {
      const hist = Array.isArray(course.offered) ? course.offered : [];
      if (hist.length && !hist.includes(filters.semesterCode)) return false;
    }
    if (!campusFilterMatches(null, filters.locationFilter)) {
      if (filters.locationFilter === 'qatar') return !!course.offered_qatar;
      if (filters.locationFilter === 'pittsburgh') return !!course.offered_pitts;
    }
    return filters.modalityFilter === 'all' || filters.modalityFilter === 'in_person';
  }
  return filterOfferings(all, filters).length > 0;
}

// ── Minor course lists (T5) ──────────────────────────────────
function courseCountsForMinor(course, minorCode, minorCourseList) {
  if (!minorCode || !course) return false;
  const list = minorCourseList && minorCourseList[minorCode];
  if (Array.isArray(list)) {
    return list.includes(course.course_code);
  }
  const mapped = MINOR_CODE_TO_MAJOR[minorCode];
  if (!mapped) return false;
  const reqs = course.requirements || {};
  return Array.isArray(reqs[mapped]) && reqs[mapped].length > 0;
}

// ── Profile-aware annotations ────────────────────────────

function annotateDoubleCounters(courses, profile, minorCourseList) {
  const viewMode = computeViewMode(profile);
  if (viewMode !== 'focused-dual') {
    for (const c of courses) c._doubleCounter = false;
    return;
  }
  const p = profile.primary;
  if (!profile.secondary) {
    for (const c of courses) c._doubleCounter = false;
    return;
  }
  for (const c of courses) {
    const req = c.requirements || {};
    const hasPrimary = Array.isArray(req[p]) && req[p].length > 0;
    const hasSecondary = courseCountsForMinor(c, profile.secondary, minorCourseList);
    c._doubleCounter = hasPrimary && hasSecondary;
  }
}

function annotateMultiProgram(courses) {
  const PROGRAMS = ['CS', 'IS', 'BA', 'BS'];
  for (const c of courses) {
    const req = c.requirements || {};
    let n = 0;
    for (const p of PROGRAMS) {
      if (Array.isArray(req[p]) && req[p].length > 0) n++;
    }
    c._programCount = n;
  }
}
