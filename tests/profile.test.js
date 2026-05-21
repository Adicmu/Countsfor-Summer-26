// ── computeViewMode ──────────────────────────────────────

test('computeViewMode: student with major + minor → focused-dual', () => {
  assertEqual(
    computeViewMode({ role: 'student', primary: 'CS', secondary: 'BA' }),
    'focused-dual'
  );
});

test('computeViewMode: student with major, no minor → focused-single', () => {
  assertEqual(
    computeViewMode({ role: 'student', primary: 'CS', secondary: null }),
    'focused-single'
  );
});

test('computeViewMode: professor with CS → focused-single', () => {
  assertEqual(
    computeViewMode({ role: 'professor', primary: 'CS', secondary: null }),
    'focused-single'
  );
});

test('computeViewMode: professor with AS (Arts & Sciences) → cross-program', () => {
  assertEqual(
    computeViewMode({ role: 'professor', primary: 'AS', secondary: null }),
    'cross-program'
  );
});

test('computeViewMode: area_head → cross-program', () => {
  assertEqual(
    computeViewMode({ role: 'area_head', primary: null, secondary: null }),
    'cross-program'
  );
});

// ── validateProfile ──────────────────────────────────────

test('validateProfile: complete student profile is valid', () => {
  assertTrue(validateProfile({ role: 'student', primary: 'CS', secondary: 'BA' }));
});

test('validateProfile: student with same major and minor → invalid', () => {
  assertFalse(validateProfile({ role: 'student', primary: 'CS', secondary: 'CS' }));
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

test('validateProfile: null profile → invalid', () => {
  assertFalse(validateProfile(null));
});

test('validateProfile: missing role → invalid', () => {
  assertFalse(validateProfile({ primary: 'CS' }));
});

// ── persistence ──────────────────────────────────────────

test('saveProfile then loadProfile round-trips a student', () => {
  localStorage.removeItem('cf_role');
  localStorage.removeItem('cf_primary');
  localStorage.removeItem('cf_secondary');

  saveProfile({ role: 'student', primary: 'CS', secondary: 'BA' });
  const loaded = loadProfile();
  assertEqual(loaded.role, 'student');
  assertEqual(loaded.primary, 'CS');
  assertEqual(loaded.secondary, 'BA');
});

test('saveProfile then loadProfile for area_head (null primary/secondary)', () => {
  saveProfile({ role: 'area_head', primary: null, secondary: null });
  const loaded = loadProfile();
  assertEqual(loaded.role, 'area_head');
  assertEqual(loaded.primary, null);
  assertEqual(loaded.secondary, null);
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
  saveProfile({ role: 'student', primary: 'CS', secondary: 'BA' });
  clearProfile();
  assertEqual(localStorage.getItem('cf_role'), null);
  assertEqual(localStorage.getItem('cf_primary'), null);
  assertEqual(localStorage.getItem('cf_secondary'), null);
});
