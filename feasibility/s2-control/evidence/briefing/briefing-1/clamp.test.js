const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clamp } = require('./clamp');

test('returns min when value is below min', () => {
  assert.strictEqual(clamp(-5, 0, 10), 0);
});

test('returns value when within bounds', () => {
  assert.strictEqual(clamp(5, 0, 10), 5);
});

test('returns max when value is above max', () => {
  assert.strictEqual(clamp(15, 0, 10), 10);
});
