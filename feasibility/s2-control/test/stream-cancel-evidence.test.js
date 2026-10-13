'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { streamSample, streamGrowth, cancelledText, streamCancelRunPassed } = require('../scripts/stream-cancel-evidence');
const prompt = 'write a long answer';
const user = { type: 'user', id: 'u1', text: prompt, time: { created: 10 } };
const assistant = { type: 'assistant', id: 'a1', time: { created: 11 }, content: [{ type: 'text', text: 'first' }] };
const sample = (message = assistant) => streamSample({ messages: [user, message], prompt, submittedAt: 9 });

test('streaming requires growing text on the same unfinished assistant, not reasoning, spinners or a completed reply', () => {
  const before = sample();
  const after = sample({ ...assistant, content: [{ type: 'text', text: 'first and more' }] });
  assert.equal(streamGrowth(before, after), true);
  for (const candidate of [{ ...after, assistantID: 'another' }, { ...after, text: 'replaced content' }, { ...after, text: 'first' },
    { ...after, unfinished: false }, { ...after, promptAccepted: false }, { ...after, noTools: false }, { ...after, noErrors: false }]) assert.equal(streamGrowth(before, candidate), false);
  const reasoning = sample({ ...assistant, content: [{ type: 'reasoning', text: 'first' }] });
  assert.equal(streamGrowth(reasoning, { ...reasoning, text: '' }), false);
  assert.equal(sample({ ...assistant, time: { created: 11, completed: 12 } }).unfinished, false);
  assert.equal(sample({ ...assistant, finish: 'stop' }).unfinished, false);
  assert.equal(streamSample({ messages: [{ ...user, text: 'different' }, assistant], prompt, submittedAt: 9 }).promptAccepted, false);
});

test('stream cancellation requires the original aborted assistant with no tools and no pending permission', () => {
  const aborted = { ...assistant, finish: 'error', error: { type: 'aborted' }, time: { created: 11, completed: 20 } };
  const observed = { messages: [user, aborted], pending: [], assistantID: 'a1', createdAt: 9 };
  assert.equal(cancelledText(observed), true);
  for (const change of [{ assistantID: 'other' }, { pending: [{ id: 'per1' }] }, { createdAt: 21 },
    { messages: [user, { ...aborted, error: { type: 'ProviderError' } }] },
    { messages: [user, { ...aborted, content: [{ type: 'tool', state: { status: 'error' } }] }] },
    { messages: [user, { ...aborted, time: { created: 11 } }] },
  ]) assert.equal(cancelledText({ ...observed, ...change }), false);
});

test('a naturally completed response or interruption race cannot be reported as stream cancellation', () => {
  const baseline = require('../evidence/client-recovery-first.json').run;
  const observed = { ...baseline, cli: { ...baseline.cli, streamCancelObserved: true, promptAccepted: true, sameAssistantTextGrew: true,
    unfinishedAtBothSamples: true, firstTextCodeUnits: 5, secondTextCodeUnits: 14, noTools: true, interruptAccepted: true,
    secondInterruptInactive: true, cancelledAssistantType: 'aborted', cancelledStableTwice: true, serviceIdentityPreserved: true } };
  assert.equal(streamCancelRunPassed(observed), true);
  for (const change of [{ sameAssistantTextGrew: false }, { unfinishedAtBothSamples: false }, { firstTextCodeUnits: 0 }, { secondTextCodeUnits: 5 },
    { interruptAccepted: false }, { secondInterruptInactive: false }, { cancelledAssistantType: 'ProviderError' }, { cancelledStableTwice: false }, { cleanup: { verified: false } }]) {
    assert.equal(streamCancelRunPassed({ ...observed, cli: { ...observed.cli, ...change } }), false);
  }
});
