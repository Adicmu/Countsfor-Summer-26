// ── annotateDoubleCounters ───────────────────────────────

function makeCourse(code, requirementsByMajor) {
  const requirements = {};
  for (const m of Object.keys(requirementsByMajor)) {
    requirements[m] = requirementsByMajor[m].map(r => ({ requirement: r, type: false }));
  }
  return { course_code: code, course_name: code, requirements };
}

test('annotateDoubleCounters: focused-dual marks courses fulfilling both programs', () => {
  const courses = [
    makeCourse('15-122', { CS: ['CS---Core'], BA: ['BA---Tech'] }),  // double-counter
    makeCourse('21-127', { CS: ['CS---Math'] }),                       // CS only
    makeCourse('70-311', { BA: ['BA---Core'] }),                       // BA only
  ];
  const profile = { role: 'student', primary: 'CS', secondary: 'BA' };

  annotateDoubleCounters(courses, profile);

  assertEqual(courses[0]._doubleCounter, true);
  assertEqual(courses[1]._doubleCounter, false);
  assertEqual(courses[2]._doubleCounter, false);
});

test('annotateDoubleCounters: focused-single clears any prior annotations', () => {
  const courses = [makeCourse('15-122', { CS: ['CS---Core'], BA: ['BA---Tech'] })];
  courses[0]._doubleCounter = true;  // simulate stale annotation

  const profile = { role: 'student', primary: 'CS', secondary: null };
  annotateDoubleCounters(courses, profile);

  assertEqual(courses[0]._doubleCounter, false);
});

test('annotateDoubleCounters: cross-program clears annotations', () => {
  const courses = [makeCourse('15-122', { CS: ['CS---Core'], BA: ['BA---Tech'] })];
  courses[0]._doubleCounter = true;

  const profile = { role: 'area_head', primary: null, secondary: null };
  annotateDoubleCounters(courses, profile);

  assertEqual(courses[0]._doubleCounter, false);
});

test('annotateDoubleCounters: empty requirements arrays do not count', () => {
  const courses = [
    { course_code: '15-122', requirements: { CS: [], BA: [] } },
  ];
  annotateDoubleCounters(courses, { role: 'student', primary: 'CS', secondary: 'BA' });
  assertEqual(courses[0]._doubleCounter, false);
});

test('annotateDoubleCounters: course with missing requirements key does not crash', () => {
  const courses = [
    { course_code: '15-122' },  // no requirements at all
  ];
  annotateDoubleCounters(courses, { role: 'student', primary: 'CS', secondary: 'BA' });
  assertEqual(courses[0]._doubleCounter, false);
});

// ── annotateMultiProgram ─────────────────────────────────

test('annotateMultiProgram: counts non-empty program keys', () => {
  const courses = [
    makeCourse('15-122', { CS: ['x'], IS: ['x'], BA: ['x'] }),  // 3 programs
    makeCourse('21-127', { CS: ['x'] }),                          // 1 program
    makeCourse('76-101', { CS: ['x'], IS: ['x'], BA: ['x'], BS: ['x'] }),  // 4
  ];
  annotateMultiProgram(courses);
  assertEqual(courses[0]._programCount, 3);
  assertEqual(courses[1]._programCount, 1);
  assertEqual(courses[2]._programCount, 4);
});

test('annotateMultiProgram: empty arrays do not count', () => {
  const courses = [
    { course_code: '15-122', requirements: { CS: ['x'], IS: [], BA: [] } },
  ];
  annotateMultiProgram(courses);
  assertEqual(courses[0]._programCount, 1);
});

test('annotateMultiProgram: missing requirements → 0', () => {
  const courses = [{ course_code: '15-122' }];
  annotateMultiProgram(courses);
  assertEqual(courses[0]._programCount, 0);
});
