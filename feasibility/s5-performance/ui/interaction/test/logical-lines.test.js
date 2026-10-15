'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { joinWrappedLines } = require('../logical-lines');

test('joins wrapped continuations without altering contents', () => {
  const rows = [
    { isWrapped: false, text: 'a  b' },
    { isWrapped: true, text: 'e\u0301ðŸ‘©\u200dðŸ‘§' },
    { isWrapped: false, text: '' },
    { isWrapped: false, text: 'c' },
  ];
  assert.deepEqual(joinWrappedLines(rows), ['a  be\u0301ðŸ‘©\u200dðŸ‘§', '', 'c']);
  assert.deepEqual(joinWrappedLines([]), []);
});

test('throws when the first row is marked wrapped', () => {
  assert.throws(
    () => joinWrappedLines([{ isWrapped: true, text: 'orphan' }]),
    /isWrapped=true/,
  );
});

test('throws on malformed row fields', () => {
  assert.throws(() => joinWrappedLines('nope'), TypeError);
  assert.throws(() => joinWrappedLines([{ isWrapped: 1, text: 'x' }]), TypeError);
  assert.throws(() => joinWrappedLines([{ isWrapped: false, text: 42 }]), TypeError);
  assert.throws(() => joinWrappedLines([{ isWrapped: false }]), TypeError);
});
