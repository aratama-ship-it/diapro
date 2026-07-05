'use strict';
let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    pass += 1;
    console.log('ok - ' + name);
  } catch (e) {
    fail += 1;
    console.error('FAIL - ' + name + ': ' + e.message);
  }
}

function summary() {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) process.exit(1);
}

module.exports = { test, summary };
