'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { terminalReportEvidence, prompt } = require('../scripts/terminal-task');
const { terminalInputEvidence } = require('../scripts/terminal-input');
const summary = 'T1 summary';
const member = 'member-a';
const user = { type: 'user', text: prompt };
const report = { type: 'tool', name: 'tiye-team-tools_report_result', state: { status: 'completed', input: { summary, status: 'done' }, content: [{ type: 'text', text: 'ack report_result for member-a (feasibility only, no engine effect)' }] } };
const assistant = content => ({ type: 'assistant', content });
test('TUI boundary newline preserves the accepted task', () => {
  assert.equal(terminalReportEvidence([{ type: 'user', text: prompt + '\n' }, assistant([report])], summary, member).completedAck, true);
});
// API-schema examples reject false evidence; live TUI compatibility is separate.
for (const [name, messages] of [
  ['prose', [user, assistant([{ type: 'text', text: summary }])]],
  ['unaccepted input', [assistant([report])]],
  ['changed internal task text', [{ type: 'user', text: prompt.replace('clamp(value', 'other(value') }, assistant([report])]],
  ['duplicate reports', [user, assistant([report, report])]],
  ['unfinished report', [user, assistant([{ ...report, state: { ...report.state, status: 'running' } }])]],
  ['wrong member', [user, assistant([{ ...report, state: { ...report.state, content: [{ type: 'text', text: 'ack report_result for member-b (feasibility only, no engine effect)' }] } }])]],
  ['failed result', [user, assistant([{ ...report, state: { ...report.state, input: { summary, status: 'failed' } } }])]],
]) test(`${name} cannot pass terminal report evidence`, () => {
  assert.equal(terminalReportEvidence(messages, summary, member).completedAck, false);
});

const expectedInput = '\x1b[200~task\x1b[201~\r';
test('focus reports surrounding an intact task are classified separately', () => {
  const evidence = terminalInputEvidence('\x1b[I' + expectedInput + '\x1b[O', expectedInput);
  assert.equal(evidence.matched, true);
  assert.equal(evidence.focusReports, 2);
});
for (const [name, input] of [
  ['stray character', expectedInput + 'x'],
  ['duplicate paste', expectedInput + expectedInput],
  ['missing Enter', expectedInput.slice(0, -1)],
  ['unrecognized escape reply', '\x1b[6n' + expectedInput],
]) test(`${name} cannot pass terminal input evidence`, () => {
  assert.equal(terminalInputEvidence(input, expectedInput).matched, false);
});
