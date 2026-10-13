'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { clamp } = require(path.join(process.env.TIYE_T1_ARTIFACT_ROOT, 'clamp.js'));
const cases = [
  { value: -1, min: 0, max: 4, expected: 0 },
  { value: 0, min: 0, max: 4, expected: 0 },
  { value: 2.5, min: 0, max: 4, expected: 2.5 },
  { value: 4, min: 0, max: 4, expected: 4 },
  { value: 7, min: 0, max: 4, expected: 4 },
  { value: -10, min: -8, max: -2, expected: -8 },
  { value: -3.5, min: -8, max: -2, expected: -3.5 },
  { value: 0, min: -8, max: -2, expected: -2 },
];
for (const example of cases) test(`independent clamp(${example.value}, ${example.min}, ${example.max})`, () => {
  assert.equal(clamp(example.value, example.min, example.max), example.expected);
});
