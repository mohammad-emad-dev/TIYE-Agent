'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { quiescentMessages } = require('../scripts/service-quiescence');

test('missing idle time is cleanup-safe only after completed turns, terminal tools and no approvals', () => {
  const assistant = { type: 'assistant', finish: 'error', time: { completed: 20 }, content: [{ type: 'tool', state: { status: 'error' } }] };
  const observed = { messages: [assistant], pending: [], createdAt: 10 };
  assert.equal(quiescentMessages(observed), true);
  for (const change of [
    { pending: [{ id: 'per1' }] }, { pending: null }, { messages: [] }, { messages: null },
    { messages: [{ ...assistant, time: {} }] }, { messages: [{ ...assistant, time: { completed: 9 } }] },
    { messages: [{ ...assistant, content: undefined }] },
    { messages: [{ ...assistant, content: [{ type: 'tool', state: { status: 'running' } }] }] },
    { messages: [{ ...assistant, content: [{ type: 'tool', state: { status: 'streaming' } }] }] },
  ]) assert.equal(quiescentMessages({ ...observed, ...change }), false);
});
