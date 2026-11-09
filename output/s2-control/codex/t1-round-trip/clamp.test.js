const test = require('node:test');
const assert = require('node:assert/strict');
const { clamp } = require('./clamp');

test('clamps values below the minimum', () => {
  assert.equal(clamp(2, 5, 10), 5);
});

test('keeps values inside the range', () => {
  assert.equal(clamp(7, 5, 10), 7);
});

test('clamps values above the maximum', () => {
  assert.equal(clamp(12, 5, 10), 10);
});

test('keeps values on either boundary', () => {
  assert.equal(clamp(5, 5, 10), 5);
  assert.equal(clamp(10, 5, 10), 10);
});

test('throws RangeError when min is greater than max', () => {
  assert.throws(() => clamp(7, 10, 5), RangeError);
});
