'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { terminalReportEvidence, prompt } = require('../scripts/terminal-task');
const summary = 'T1 summary';
const member = 'member-a';
const user = { type: 'user', text: prompt };
const report = { type: 'tool', name: 'tiye-team-tools_report_result', state: { status: 'completed', input: { summary, status: 'done' }, content: [{ type: 'text', text: 'ack report_result for member-a (feasibility only, no engine effect)' }] } };
const assistant = content => ({ type: 'assistant', content });
// API-schema examples reject false evidence; live TUI compatibility is separate.
for (const [name, messages] of [
  ['prose', [user, assistant([{ type: 'text', text: summary }])]],
  ['unaccepted input', [assistant([report])]],
  ['duplicate reports', [user, assistant([report, report])]],
  ['unfinished report', [user, assistant([{ ...report, state: { ...report.state, status: 'running' } }])]],
  ['wrong member', [user, assistant([{ ...report, state: { ...report.state, content: [{ type: 'text', text: 'ack report_result for member-b (feasibility only, no engine effect)' }] } }])]],
  ['failed result', [user, assistant([{ ...report, state: { ...report.state, input: { summary, status: 'failed' } } }])]],
]) test(`${name} cannot pass terminal report evidence`, () => {
  assert.equal(terminalReportEvidence(messages, summary, member).completedAck, false);
});
