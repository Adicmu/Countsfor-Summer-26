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
