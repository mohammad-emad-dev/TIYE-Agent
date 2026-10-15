'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLedger } = require('../epoch-ledger.js');

test('begin/dispatch/acknowledge advance per-member counters in order', () => {
  const ledger = createLedger();
  ledger.begin(0);
  ledger.dispatch(0, 2, 0);
  ledger.dispatch(0, 2, 1);
  ledger.dispatch(0, 4, 0);
  assert.deepEqual(ledger.snapshot(), { epoch: 0, sent: [0, 0, 2, 0, 1], acked: [0, 0, 0, 0, 0] });
  assert.equal(ledger.acknowledge(0, 2, 0), true);
  assert.equal(ledger.acknowledge(0, 2, 1), true);
  assert.equal(ledger.acknowledge(0, 4, 0), true);
  assert.deepEqual(ledger.snapshot(), { epoch: 0, sent: [0, 0, 2, 0, 1], acked: [0, 0, 2, 0, 1] });
});

test('malformed, duplicate, gap, unsent, and future inputs throw', () => {
  const ledger = createLedger();
  assert.throws(() => ledger.begin(1)); // first epoch must be exactly 0
  ledger.begin(0);
  assert.throws(() => ledger.begin(0)); // no reset without advancing
  assert.throws(() => ledger.begin(2)); // must advance by exactly one
  assert.throws(() => ledger.dispatch(1, 0, 0)); // future epoch
  assert.throws(() => ledger.dispatch(0, 5, 0)); // member out of range
  assert.throws(() => ledger.dispatch(0, 0, 1)); // gap: ordinal !== sent
  assert.throws(() => ledger.dispatch(0, 0)); // missing ordinal
  ledger.dispatch(0, 1, 0);
  assert.throws(() => ledger.acknowledge(1, 0, 0)); // future epoch
  assert.throws(() => ledger.acknowledge(0, 0, 0)); // unsent frame
  assert.throws(() => ledger.acknowledge(0, 1, 1)); // gap: ordinal !== acked
  assert.throws(() => ledger.acknowledge(0, '1', 0)); // malformed member
  assert.equal(ledger.acknowledge(0, 1, 0), true);
  assert.throws(() => ledger.acknowledge(0, 1, 0)); // duplicate
});

test('stale epoch returns false without touching acked; snapshot copies are isolated', () => {
  const ledger = createLedger();
  ledger.begin(0);
  ledger.dispatch(0, 3, 0);
  assert.equal(ledger.acknowledge(0, 3, 0), true);
  ledger.begin(1);
  assert.equal(ledger.acknowledge(0, 3, 0), false); // ordinal 0 matches the reset acked[3], but the epoch is stale
  assert.equal(ledger.acknowledge(0, 3, 1), false); // stale ordinals never advance
  assert.throws(() => ledger.acknowledge(0, 9, 0)); // malformed member rejects before stale handling
  const snap = ledger.snapshot();
  snap.epoch = 99;
  snap.sent.push(1);
  snap.acked[3] = 7;
  assert.deepEqual(ledger.snapshot(), { epoch: 1, sent: [0, 0, 0, 0, 0], acked: [0, 0, 0, 0, 0] });
});
