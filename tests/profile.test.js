// ── computeViewMode ──────────────────────────────────────

test('computeViewMode: student with major + business minor → focused-dual', () => {
  // 'business' minor maps to BA (a major we have requirement data for).
  assertEqual(
    computeViewMode({ role: 'student', primary: 'CS', secondary: 'business' }),
    'focused-dual'
  );
});

test('computeViewMode: student with major + arabic minor → focused-single', () => {
  // Arabic minor has no requirement-tree data, so view stays single.
  assertEqual(
    computeViewMode({ role: 'student', primary: 'CS', secondary: 'arabic' }),
    'focused-single'
  );
});

test('computeViewMode: student with major, no minor → focused-single', () => {
  assertEqual(
    computeViewMode({ role: 'student', primary: 'CS', secondary: null }),
    'focused-single'
  );
});

test('computeViewMode: professor with CS → cross-program (faculty-with-major view)', () => {
  // Faculty with assigned major browse all programs with their major highlighted.
  assertEqual(
    computeViewMode({ role: 'professor', primary: 'CS', secondary: null }),
    'cross-program'
  );
});

test('computeViewMode: professor with AS (Arts & Sciences) → cross-program', () => {
  assertEqual(
    computeViewMode({ role: 'professor', primary: 'AS', secondary: null }),
    'cross-program'
  );
});

test('computeViewMode: area_head with no major → cross-program', () => {
  assertEqual(
    computeViewMode({ role: 'area_head', primary: null, secondary: null }),
    'cross-program'
  );
});

test('computeViewMode: area_head with CS → cross-program', () => {
  // CS Area Head still browses all programs but with CS highlighted.
  assertEqual(
    computeViewMode({ role: 'area_head', primary: 'CS', secondary: null }),
    'cross-program'
  );
});

test('computeViewMode: associate_area_head with IS → cross-program', () => {
  assertEqual(
    computeViewMode({ role: 'associate_area_head', primary: 'IS', secondary: null }),
    'cross-program'
  );
});

test('computeViewMode: advisor with BA → cross-program', () => {
  assertEqual(
    computeViewMode({ role: 'advisor', primary: 'BA', secondary: null }),
    'cross-program'
  );
});

// ── validateProfile ──────────────────────────────────────

test('validateProfile: complete student profile is valid', () => {
  assertTrue(validateProfile({ role: 'student', primary: 'CS', secondary: 'business' }));
});

test('validateProfile: student with same field as major+minor → invalid', () => {
  // CS major + Computer Science minor — same field.
  assertFalse(validateProfile({ role: 'student', primary: 'CS', secondary: 'cs' }));
});

test('validateProfile: student with arbitrary valid minor → valid', () => {
  assertTrue(validateProfile({ role: 'student', primary: 'CS', secondary: 'arabic' }));
});

test('validateProfile: student with unknown minor code → invalid', () => {
  assertFalse(validateProfile({ role: 'student', primary: 'CS', secondary: 'unknown_minor' }));
});

test('validateProfile: invalid role → invalid', () => {
  assertFalse(validateProfile({ role: 'admin', primary: 'CS', secondary: null }));
});

test('validateProfile: invalid primary program → invalid', () => {
  assertFalse(validateProfile({ role: 'student', primary: 'XX', secondary: null }));
});

test('validateProfile: student with primary=AS → invalid (AS only for profs)', () => {
  assertFalse(validateProfile({ role: 'student', primary: 'AS', secondary: null }));
});

test('validateProfile: area_head with no primary is valid', () => {
  assertTrue(validateProfile({ role: 'area_head', primary: null, secondary: null }));
});

test('validateProfile: area_head with CS is valid', () => {
  assertTrue(validateProfile({ role: 'area_head', primary: 'CS', secondary: null }));
});

test('validateProfile: associate_area_head must have a major', () => {
  assertFalse(validateProfile({ role: 'associate_area_head', primary: null, secondary: null }));
  assertTrue(validateProfile({ role: 'associate_area_head', primary: 'IS', secondary: null }));
});

test('validateProfile: advisor must have a major', () => {
  assertFalse(validateProfile({ role: 'advisor', primary: null, secondary: null }));
  assertTrue(validateProfile({ role: 'advisor', primary: 'BS', secondary: null }));
});

test('validateProfile: null profile → invalid', () => {
  assertFalse(validateProfile(null));
});

test('validateProfile: missing role → invalid', () => {
  assertFalse(validateProfile({ primary: 'CS' }));
});

// ── role helpers ─────────────────────────────────────────

test('isFaculty: true for all faculty-type roles', () => {
  assertTrue(isFaculty({ role: 'professor' }));
  assertTrue(isFaculty({ role: 'area_head' }));
  assertTrue(isFaculty({ role: 'associate_area_head' }));
  assertTrue(isFaculty({ role: 'advisor' }));
});

test('isFaculty: false for students', () => {
  assertFalse(isFaculty({ role: 'student' }));
});

test('isStudent: true only for students', () => {
  assertTrue(isStudent({ role: 'student' }));
  assertFalse(isStudent({ role: 'professor' }));
  assertFalse(isStudent({ role: 'advisor' }));
});

// ── persistence ──────────────────────────────────────────

test('saveProfile then loadProfile round-trips a student', () => {
  localStorage.removeItem('cf_role');
  localStorage.removeItem('cf_primary');
  localStorage.removeItem('cf_secondary');

  saveProfile({ role: 'student', primary: 'CS', secondary: 'business' });
  const loaded = loadProfile();
  assertEqual(loaded.role, 'student');
  assertEqual(loaded.primary, 'CS');
  assertEqual(loaded.secondary, 'business');
});

test('saveProfile then loadProfile for area_head (null primary/secondary)', () => {
  saveProfile({ role: 'area_head', primary: null, secondary: null });
  const loaded = loadProfile();
  assertEqual(loaded.role, 'area_head');
  assertEqual(loaded.primary, null);
  assertEqual(loaded.secondary, null);
});

test('saveProfile then loadProfile for advisor with major', () => {
  saveProfile({ role: 'advisor', primary: 'IS', secondary: null });
  const loaded = loadProfile();
  assertEqual(loaded.role, 'advisor');
  assertEqual(loaded.primary, 'IS');
});

test('loadProfile migrates legacy student minor stored as major code', () => {
  localStorage.setItem('cf_role', 'student');
  localStorage.setItem('cf_primary', 'IS');
  localStorage.setItem('cf_secondary', 'BA');  // legacy form
  const loaded = loadProfile();
  assertEqual(loaded.role, 'student');
  assertEqual(loaded.secondary, 'business');  // migrated
});

test('loadProfile returns null when no role stored', () => {
  localStorage.removeItem('cf_role');
  localStorage.removeItem('cf_primary');
  localStorage.removeItem('cf_secondary');
  assertEqual(loadProfile(), null);
});

test('loadProfile returns null when stored profile is invalid', () => {
  localStorage.setItem('cf_role', 'admin');  // not a valid role
  localStorage.setItem('cf_primary', 'CS');
  localStorage.setItem('cf_secondary', '');
  assertEqual(loadProfile(), null);
});

test('clearProfile removes all three keys', () => {
  saveProfile({ role: 'student', primary: 'CS', secondary: 'business' });
  clearProfile();
  assertEqual(localStorage.getItem('cf_role'), null);
  assertEqual(localStorage.getItem('cf_primary'), null);
  assertEqual(localStorage.getItem('cf_secondary'), null);
});
