// ============================================================
// CountsFor — Profile module
// State, persistence, and derivation for the user's role and
// program selections. Loaded after data.js, before api.js.
// ============================================================

const VALID_ROLES = ['student', 'professor', 'area_head'];
const VALID_PROGRAMS = ['CS', 'IS', 'BA', 'BS', 'AI', 'GS', 'AS'];
const STUDENT_PROGRAMS = ['CS', 'IS', 'BA', 'BS', 'AI', 'GS'];  // students never pick AS

function computeViewMode(profile) {
  if (!profile || !profile.role) return null;
  if (profile.role === 'area_head') return 'cross-program';
  if (profile.role === 'professor' && profile.primary === 'AS') return 'cross-program';
  if (profile.secondary && profile.secondary !== profile.primary) return 'focused-dual';
  return 'focused-single';
}

function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') return false;
  if (!VALID_ROLES.includes(profile.role)) return false;

  if (profile.role === 'area_head') {
    return true;  // area heads have no program selection
  }

  if (profile.role === 'student') {
    if (!STUDENT_PROGRAMS.includes(profile.primary)) return false;
    if (profile.secondary && !STUDENT_PROGRAMS.includes(profile.secondary)) return false;
    if (profile.secondary === profile.primary) return false;
    return true;
  }

  if (profile.role === 'professor') {
    if (!VALID_PROGRAMS.includes(profile.primary)) return false;
    return true;  // profs have no minor
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
  const secondary = localStorage.getItem('cf_secondary') || null;
  const profile = { role, primary: primary || null, secondary: secondary || null };
  if (!validateProfile(profile)) return null;
  return profile;
}

function clearProfile() {
  localStorage.removeItem('cf_role');
  localStorage.removeItem('cf_primary');
  localStorage.removeItem('cf_secondary');
}
