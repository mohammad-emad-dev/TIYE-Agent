'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
// Independent examples include boundaries, negative intervals and fractions,
// beyond the three examples requested from the model.
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
for (const member of ['member-a', 'member-b']) {
  const { clamp } = require(`./t1-${member}/clamp`);
  for (const example of cases) test(`${member}: clamp(${example.value}, ${example.min}, ${example.max})`, () => {
    assert.equal(clamp(example.value, example.min, example.max), example.expected);
  });
}
