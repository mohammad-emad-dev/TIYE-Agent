'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { summarizeToolEvents } = require('../scripts/persistent-cli');

// Synthetic boundary events exercise rejection rules, not CLI compatibility.
const summary = 'probe-marker';
const member = 'member-a';
const toolEvent = (changes = {}) => ({ type: 'tool_use', part: {
  type: 'tool', tool: 'tiye-team-tools_report_result', state: {
    status: 'completed', input: { summary, status: 'done' },
    output: 'ack report_result for member-a (feasibility only, no engine effect)', ...changes,
  },
} });

const rejected = [
  ['prose claiming completion', JSON.stringify({ type: 'text', part: { text: `report_result done ${summary}` } })],
  ['malformed output', '{broken'],
  ['wrong marker', JSON.stringify(toolEvent({ input: { summary: 'wrong', status: 'done' } }))],
  ['failed task status', JSON.stringify(toolEvent({ input: { summary, status: 'failed' } }))],
  ['wrong member acknowledgment', JSON.stringify(toolEvent({ output: 'ack report_result for member-b (feasibility only, no engine effect)' }))],
  ['duplicate completed reports', [toolEvent(), toolEvent()].map(JSON.stringify).join('\n')],
  ['wrong tool', JSON.stringify({ type: 'tool_use', part: { ...toolEvent().part, tool: 'tiye-team-tools_ask_leader' } })],
];

for (const [scenario, output] of rejected) {
  test(`${scenario} cannot establish a completed report`, () => {
    assert.equal(summarizeToolEvents({ output, summary, member }).completedAck, false);
  });
}

test('observed provider auth failure retains its category without leaking the body', () => {
  const output = JSON.stringify({ type: 'error', error: { type: 'provider.auth', status: 403, message: 'sensitive', response: { body: 'sensitive' } } });
  const evidence = summarizeToolEvents({ output, summary, member });
  assert.deepEqual(evidence.failure, { category: 'provider.auth', httpStatus: 403 });
  assert.equal(evidence.completedAck, false);
  assert.equal(JSON.stringify(evidence).includes('sensitive'), false);
});
