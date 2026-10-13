const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clamp } = require('./clamp');

test('returns min when value is below min', () => {
  assert.strictEqual(clamp(1, 5, 10), 5);
});

test('returns value when within bounds', () => {
  assert.strictEqual(clamp(7, 5, 10), 7);
});

test('returns max when value is above max', () => {
  assert.strictEqual(clamp(15, 5, 10), 10);
});
