// ============================================================
// CountsFor — Profile module
// State, persistence, and derivation for the user's role and
// program selections. Loaded after data.js, before api.js.
// ============================================================

// ── Centralized program lists ──────────────────────────────
// Majors a student or faculty member can be associated with.
// 'AS' is a pseudo-major reserved for professors who teach across
// programs and is not a selectable major for any other role.
const VALID_PROGRAMS = ['CS', 'IS', 'BA', 'BS', 'AI', 'GS', 'AS'];
const MAJOR_LIST     = ['CS', 'IS', 'BA', 'BS', 'AI', 'GS'];
const STUDENT_PROGRAMS = MAJOR_LIST.slice();  // students never pick AS

const PROGRAM_FULL_NAME = {
  CS: 'Computer Science',
  IS: 'Information Systems',
  BA: 'Business Administration',
  BS: 'Biological Sciences',
  AI: 'Artificial Intelligence',
  GS: 'General Studies',
  AS: 'Arts & Sciences',
};

// ── Centralized minor list (alphabetical) ──────────────────
const MINOR_LIST = [
  { code: 'arabic',        label: 'Arabic Studies' },
  { code: 'biology',       label: 'Biological Sciences' },
  { code: 'business',      label: 'Business Administration' },
  { code: 'cs',            label: 'Computer Science' },
  { code: 'economics',     label: 'Economics' },
  { code: 'finance',       label: 'Financial Management' },
  { code: 'history',       label: 'History' },
  { code: 'math',          label: 'Mathematical Sciences' },
  { code: 'neuroscience',  label: 'Neuroscience' },
  { code: 'product',       label: 'Product Management' },
  { code: 'writing',       label: 'Professional Writing' },
  { code: 'psychology',    label: 'Psychology' },
  { code: 'sociology',     label: 'Sociology' },
  { code: 'self_defined',  label: 'Student-defined' },
  { code: 'tech_entre',    label: 'Tech Entrepreneurship' },
];

// Map major codes (CS, IS, BA, BS) to the analogous minor entry so a student
// picking a same-major minor is silently disallowed.
const MAJOR_TO_MINOR_CODE = { CS: 'cs', BS: 'biology', BA: 'business' };

// Inverse — for minors whose requirements we already track as a major, surface
// the matching major-tab so the student gets requirement coverage. Other minors
// don't have requirement-tree data yet and only appear on the role badge.
const MINOR_CODE_TO_MAJOR = { cs: 'CS', biology: 'BS', business: 'BA' };

function getMinorLabel(code) {
  if (!code) return null;
  const m = MINOR_LIST.find(x => x.code === code);
  return m ? m.label : code;
}

function getMinorAsMajorCode(profile) {
  if (!profile || profile.role !== 'student' || !profile.secondary) return null;
  return MINOR_CODE_TO_MAJOR[profile.secondary] || null;
}

// ── Roles ──────────────────────────────────────────────────
const VALID_ROLES = ['student', 'professor', 'area_head', 'associate_area_head', 'advisor'];

const ROLE_META = {
  student:             { label: 'Student',              faculty: false, needsMajor: true,  allowsMinor: true,  allowsAllPrograms: false },
  professor:           { label: 'Professor',            faculty: true,  needsMajor: true,  allowsMinor: false, allowsAllPrograms: true  },
  area_head:           { label: 'Area Head',            faculty: true,  needsMajor: true,  allowsMinor: false, allowsAllPrograms: true  },
  associate_area_head: { label: 'Associate Area Head',  faculty: true,  needsMajor: true,  allowsMinor: false, allowsAllPrograms: false },
  advisor:             { label: 'Advisor',              faculty: true,  needsMajor: true,  allowsMinor: false, allowsAllPrograms: false },
};

const FACULTY_ROLES = Object.keys(ROLE_META).filter(r => ROLE_META[r].faculty);

function isFaculty(profile) {
  return !!(profile && ROLE_META[profile.role] && ROLE_META[profile.role].faculty);
}

function isStudent(profile) {
  return !!(profile && profile.role === 'student');
}

function getRoleLabel(profile) {
  if (!profile) return '';
  return (ROLE_META[profile.role] && ROLE_META[profile.role].label) || profile.role;
}

// ── View mode ──────────────────────────────────────────────
function computeViewMode(profile) {
  if (!profile || !profile.role) return null;
  // Area Head with no specific major → cross-program (legacy "all programs" path).
  if (profile.role === 'area_head' && (!profile.primary || profile.primary === 'AS')) {
    return 'cross-program';
  }
  // Professors teaching A&S broadly → cross-program.
  if (profile.role === 'professor' && profile.primary === 'AS') return 'cross-program';

  // Faculty with an assigned major still browse all programs (an Area Head may
  // need to cross-reference CS/IS/BA/BS courses), but their primary is highlighted.
  if (isFaculty(profile) && profile.primary && profile.primary !== 'AS') {
    return 'cross-program';
  }

  // Student-with-minor only goes "dual" when the minor maps to a major we
  // have requirement-tree data for (CS / BA / BS). Other minors are shown on
  // the role badge only.
  if (profile.role === 'student' && getMinorAsMajorCode(profile)) return 'focused-dual';
  return 'focused-single';
}

function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') return false;
  if (!VALID_ROLES.includes(profile.role)) return false;

  const meta = ROLE_META[profile.role];

  if (profile.role === 'student') {
    if (!STUDENT_PROGRAMS.includes(profile.primary)) return false;
    if (profile.secondary) {
      if (!MINOR_LIST.some(m => m.code === profile.secondary)) return false;
      // Reject minor that matches the chosen major (same field of study).
      if (MAJOR_TO_MINOR_CODE[profile.primary] === profile.secondary) return false;
    }
    return true;
  }

  if (profile.role === 'professor') {
    // 'AS' (cross-program) is allowed; otherwise must be a real major.
    if (profile.primary === 'AS') return true;
    if (!MAJOR_LIST.includes(profile.primary)) return false;
    return true;
  }

  // area_head / associate_area_head / advisor
  if (meta && meta.faculty) {
    if (meta.allowsAllPrograms && !profile.primary) return true;  // area_head only
    if (meta.allowsAllPrograms && profile.primary === 'AS')  return true;
    if (!MAJOR_LIST.includes(profile.primary)) return false;
    return true;
  }

  return false;
}

function saveProfile(profile) {
  if (!validateProfile(profile)) {
    throw new Error('saveProfile: profile failed validation');
  }
  localStorage.setItem('cf_role', profile.role);
  localStorage.setItem('cf_primary', profile.primary || '');
  localStorage.setItem('cf_secondary', profile.secondary || '');
}

function loadProfile() {
  const role = localStorage.getItem('cf_role');
  if (!role) return null;
  const primary = localStorage.getItem('cf_primary') || null;
  let secondary = localStorage.getItem('cf_secondary') || null;

  // Migration: pre-2026-05-26 builds stored minor as a major code (CS/BA/BS).
  // Translate to the new minor-code form so the profile still validates.
  if (secondary && role === 'student') {
    const LEGACY_MAJOR_MINOR = { CS: 'cs', BA: 'business', BS: 'biology' };
    if (LEGACY_MAJOR_MINOR[secondary]) {
      secondary = LEGACY_MAJOR_MINOR[secondary];
      try { localStorage.setItem('cf_secondary', secondary); } catch {}
    } else if (!MINOR_LIST.some(m => m.code === secondary)) {
      // Unknown legacy value — drop it rather than fail validation.
      secondary = null;
      try { localStorage.setItem('cf_secondary', ''); } catch {}
    }
  }

  const profile = { role, primary: primary || null, secondary: secondary || null };
  if (!validateProfile(profile)) return null;
  return profile;
}

function clearProfile() {
  localStorage.removeItem('cf_role');
  localStorage.removeItem('cf_primary');
  localStorage.removeItem('cf_secondary');
}
