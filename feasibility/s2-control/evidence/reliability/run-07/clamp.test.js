const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clamp } = require('./clamp.js');

test('returns min when value is below min', () => {
  assert.equal(clamp(-5, 0, 10), 0);
});

test('returns value when within bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
});

test('returns max when value is above max', () => {
  assert.equal(clamp(15, 0, 10), 10);
});
