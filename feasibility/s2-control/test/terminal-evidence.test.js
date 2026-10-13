'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { terminalReportEvidence, prompt } = require('../scripts/terminal-task');
const { terminalInputEvidence } = require('../scripts/terminal-input');
const { cases, questionCase } = require('../scripts/instruction-cases');
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
test('variant evidence requires its own accepted wording', () => {
  const variant = cases[1];
  assert.equal(terminalReportEvidence([user, assistant([report])], summary, member, variant).completedAck, false);
  assert.equal(terminalReportEvidence([{ type: 'user', text: variant.prompt }, assistant([report])], summary, member, variant).completedAck, true);
});
test('ask_leader requires its exact question and member acknowledgment', () => {
  const asked = { type: 'tool', name: 'tiye-team-tools_ask_leader', state: { status: 'completed', input: { question: questionCase.question }, content: [{ type: 'text', text: 'ack ask_leader for member-a (feasibility only, no engine effect)' }] } };
  const accepted = { type: 'user', text: questionCase.prompt };
  assert.equal(terminalReportEvidence([accepted, assistant([asked])], summary, member, questionCase).completedAck, true);
  assert.equal(terminalReportEvidence([accepted, assistant([report])], summary, member, questionCase).completedAck, false);
  assert.equal(terminalReportEvidence([accepted, assistant([{ ...asked, state: { ...asked.state, input: { question: 'Different question' } } }])], summary, member, questionCase).completedAck, false);
});
