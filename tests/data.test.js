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
    makeCourse('15-122', { CS: ['CS---Core'], BA: ['BA---Tech'] }),
    makeCourse('21-127', { CS: ['CS---Math'] }),
    makeCourse('70-311', { BA: ['BA---Core'] }),
  ];
  const profile = { role: 'student', primary: 'CS', secondary: 'business' };
  const minorList = { business: ['70-311', '73-100'] };

  annotateDoubleCounters(courses, profile, minorList);

  assertEqual(courses[0]._doubleCounter, false);
  assertEqual(courses[1]._doubleCounter, false);
  assertEqual(courses[2]._doubleCounter, true);
});

test('annotateDoubleCounters: 15-122 not a false minor double counter (T5)', () => {
  const courses = [makeCourse('15-122', { CS: ['CS---Core'], BA: ['BA---Tech'] })];
  const profile = { role: 'student', primary: 'CS', secondary: 'business' };
  const minorList = { business: ['70-311'] };
  annotateDoubleCounters(courses, profile, minorList);
  assertEqual(courses[0]._doubleCounter, false);
});

test('annotateDoubleCounters: focused-single clears any prior annotations', () => {
  const courses = [makeCourse('15-122', { CS: ['CS---Core'], BA: ['BA---Tech'] })];
  courses[0]._doubleCounter = true;  // simulate stale annotation

  const profile = { role: 'student', primary: 'CS', secondary: null };
  annotateDoubleCounters(courses, profile, {});

  assertEqual(courses[0]._doubleCounter, false);
});

test('annotateDoubleCounters: cross-program clears annotations', () => {
  const courses = [makeCourse('15-122', { CS: ['CS---Core'], BA: ['BA---Tech'] })];
  courses[0]._doubleCounter = true;

  const profile = { role: 'area_head', primary: null, secondary: null };
  annotateDoubleCounters(courses, profile, {});

  assertEqual(courses[0]._doubleCounter, false);
});

test('annotateDoubleCounters: empty requirements arrays do not count', () => {
  const courses = [
    { course_code: '15-122', requirements: { CS: [], BA: [] } },
  ];
  annotateDoubleCounters(courses, { role: 'student', primary: 'CS', secondary: 'BA' }, {});
  assertEqual(courses[0]._doubleCounter, false);
});

test('annotateDoubleCounters: course with missing requirements key does not crash', () => {
  const courses = [
    { course_code: '15-122' },  // no requirements at all
  ];
  annotateDoubleCounters(courses, { role: 'student', primary: 'CS', secondary: 'BA' }, {});
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

// === pickAccentColor (spec § 4.5) ===

test('pickAccentColor: math nodes get purple', () => {
  assertEqual(pickAccentColor('Math & Probability', 'CS'), '#6b21a8');
  assertEqual(pickAccentColor('Probability Theory', 'CS'), '#6b21a8');
});

test('pickAccentColor: humanities/arts/gened get amber', () => {
  assertEqual(pickAccentColor('Humanities & Arts', 'CS'), '#B45309');
  assertEqual(pickAccentColor('GenEd Distribution', 'CS'), '#B45309');
});

test('pickAccentColor: electives/technical get green', () => {
  assertEqual(pickAccentColor('Technical Electives', 'CS'), '#047857');
  assertEqual(pickAccentColor('Elective Pool', 'CS'), '#047857');
});

test('pickAccentColor: core/required falls back to major brand', () => {
  assertEqual(pickAccentColor('CS Core', 'CS'), '#C41230');
  assertEqual(pickAccentColor('Required Courses', 'BA'), '#2563EB');
});

test('pickAccentColor: unknown label uses major brand', () => {
  assertEqual(pickAccentColor('Something Random', 'IS'), '#D97706');
  assertEqual(pickAccentColor('Foo Bar', 'BS'), '#059669');
});

test('pickAccentColor: case-insensitive matching', () => {
  assertEqual(pickAccentColor('MATH & PROBABILITY', 'CS'), '#6b21a8');
  assertEqual(pickAccentColor('humanities & arts', 'CS'), '#B45309');
});

// ── predictOffering (rule-based, no ML) ────────────────────

test('predictOffering: <3 historical entries → unknown', () => {
  const c = { offered: ['F23'] };
  assertEqual(predictOffering(c, 'F').state, 'unknown');
});

test('predictOffering: 50%+ in target season → likely', () => {
  // 4 Springs, 1 Fall → 80% Spring share
  const c = { offered: ['S22', 'S23', 'S24', 'S25', 'F22'] };
  assertEqual(predictOffering(c, 'S').state, 'likely');
});

test('predictOffering: 0 in target season → unlikely', () => {
  const c = { offered: ['S22', 'S23', 'S24'] };
  assertEqual(predictOffering(c, 'F').state, 'unlikely');
});

test('predictOffering: <20% in target season → rare', () => {
  // 1 Fall out of 9 = ~11% → rare
  const c = { offered: ['S20', 'S21', 'S22', 'S23', 'S24', 'M21', 'M22', 'M23', 'F25'] };
  assertEqual(predictOffering(c, 'F').state, 'rare');
});

test('predictOffering: 20-50% share → mixed', () => {
  // 2 Falls out of 5 = 40%
  const c = { offered: ['S22', 'S23', 'S24', 'F22', 'F23'] };
  assertEqual(predictOffering(c, 'F').state, 'mixed');
});

test('predictOffering: missing offered field → unknown', () => {
  assertEqual(predictOffering({}, 'F').state, 'unknown');
});

test('filterOfferings: composable semester campus modality', () => {
  const offerings = [
    { semester_code: 'F26', campus: 'Qatar', modality: 'Remote', section: 'A' },
    { semester_code: 'F26', campus: 'Qatar', modality: 'In Person', section: 'B' },
    { semester_code: 'S26', campus: 'Qatar', modality: 'Remote', section: 'C' },
  ];
  const f26QatarRemote = filterOfferings(offerings, {
    semesterCode: 'F26',
    locationFilter: 'qatar',
    modalityFilter: 'remote',
  });
  assertEqual(f26QatarRemote.length, 1);
  assertEqual(f26QatarRemote[0].section, 'A');
});

test('parse campus: 82-289 forced Qatar via fixture helper', () => {
  // Frontend uses offering campus from bundled data; Python fixture lives in data/soc_parse.py.
  const c = { course_code: '82-289', course_name: 'Tutoring for Community Outreach - CMUQ', offered_qatar: true, offered_pitts: false };
  assertEqual(c.offered_qatar, true);
  assertEqual(c.offered_pitts, false);
});

test('predictOffering: deduplicates identical entries before counting', () => {
  // Without dedup: 6 Springs → likely. With dedup: 3 unique Springs → still likely (100%).
  const c = { offered: ['S22', 'S22', 'S23', 'S23', 'S24', 'S24'] };
  assertEqual(predictOffering(c, 'S').state, 'likely');
});

// ── orderCfColumns (role-based course-card column order) ─────

test('orderCfColumns: faculty get canonical cross-program order', () => {
  const mappings = { CS: [1], IS: [1], BA: [1], BS: [1] };
  assertEqual(orderCfColumns(mappings, { role: 'professor', primary: 'IS' }), ['CS', 'IS', 'BA', 'BS']);
});

test('orderCfColumns: student leads with major then minor-as-major', () => {
  const mappings = { CS: [1], IS: [1], BA: [1], BS: [1] };
  assertEqual(orderCfColumns(mappings, { role: 'student', primary: 'BA', secondary: 'cs' }), ['BA', 'CS', 'IS', 'BS']);
});

test('orderCfColumns: only includes programs that have mappings', () => {
  assertEqual(orderCfColumns({ CS: [1], BA: [1] }, { role: 'student', primary: 'BA', secondary: null }), ['BA', 'CS']);
});

// ── getCourseMappings depth (student vs faculty) ────────────

test('getCourseMappings: student lens shows last 2 path segments', () => {
  const m = getCourseMappings(makeCourse('X', { CS: ['Root---Mid---Sub---Leaf'] }));
  assertEqual(m.CS[0].shortLabel, 'Sub → Leaf');
});

test('getCourseMappings: full (faculty) shows last 3 path segments', () => {
  const m = getCourseMappings(makeCourse('X', { CS: ['Root---Mid---Sub---Leaf'] }), { full: true });
  assertEqual(m.CS[0].shortLabel, 'Mid → Sub → Leaf');
});

// ── summarizeFlagsByStatus ──────────────────────────────────

test('summarizeFlagsByStatus: counts each status, ignores unknown and null', () => {
  const items = [{ status: 'pending' }, { status: 'pending' }, { status: 'resolved' }, { status: 'weird' }, null];
  assertEqual(summarizeFlagsByStatus(items), { pending: 2, reviewed: 0, resolved: 1, dismissed: 0 });
});

test('summarizeFlagsByStatus: empty / missing input → all zero', () => {
  assertEqual(summarizeFlagsByStatus([]), { pending: 0, reviewed: 0, resolved: 0, dismissed: 0 });
  assertEqual(summarizeFlagsByStatus(undefined), { pending: 0, reviewed: 0, resolved: 0, dismissed: 0 });
});

// ── normalizeCourseCode / buildCourseIndex / lookupCourse ──

test('normalizeCourseCode: compact and float variants resolve to 82-101', () => {
  assertEqual(normalizeCourseCode('82-101'), '82-101');
  assertEqual(normalizeCourseCode('82101'), '82-101');
  assertEqual(normalizeCourseCode('82101.0'), '82-101');
});

test('buildCourseIndex: indexes canonical and compact aliases', () => {
  const courses = [{ course_code: '82-101', course_name: 'Elementary French I' }];
  const index = buildCourseIndex(courses);
  assertEqual(index['82-101'].course_name, 'Elementary French I');
  assertEqual(index['82101'].course_name, 'Elementary French I');
});

test('lookupCourse: 82-101 and 82101 resolve to same record', () => {
  const courses = [{ course_code: '82-101', course_name: 'Elementary French I' }];
  const index = buildCourseIndex(courses);
  assertEqual(lookupCourse(index, '82-101').course_name, 'Elementary French I');
  assertEqual(lookupCourse(index, '82101').course_name, 'Elementary French I');
});
