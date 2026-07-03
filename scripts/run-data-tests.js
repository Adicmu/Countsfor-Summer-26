const fs = require('fs');
const vm = require('vm');

function load(path) {
  vm.runInThisContext(fs.readFileSync(path, 'utf8') + `\n//# sourceURL=${path}`);
}

load('js/utils.js');
load('js/data.js');
load('js/profile.js');
load('tests/test-runner.js');
load('tests/data.test.js');

let pass = 0;
let fail = 0;
for (const t of __tests) {
  try {
    t.fn();
    pass++;
    console.log('PASS', t.name);
  } catch (e) {
    fail++;
    console.log('FAIL', t.name, e.message);
  }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
