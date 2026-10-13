'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { phaseEvidence, recallEvidence } = require('../scripts/briefing-evidence');
const expected = { self: 'member-a', role: 'worker', leader: 'lead-new', teammates: ['peer-new'], ownedFiles: ['clamp.js', 'clamp.test.js'], completionTool: 'report_result' };
const assistant = (text, id = 'new') => ({ id, type: 'assistant', time: { created: 11, completed: 12 }, finish: 'stop', content: [{ type: 'text', text }] });
test('old assistant IDs and user echoes cannot satisfy recall phase', () => {
  const phase = phaseEvidence([{ type: 'user', text: 'recall', time: { created: 10 } }, assistant(JSON.stringify(expected), 'old')], 'recall', new Set(['old']));
  assert.equal(phase.completed, false);
  assert.equal(recallEvidence(phase.assistants, expected).matched, false);
});
test('a completed exact JSON reply establishes recall', () => assert.equal(recallEvidence([assistant(JSON.stringify(expected))], expected).matched, true));
for (const [name, reply] of [
  ['wrong trial identities', JSON.stringify({ ...expected, leader: 'lead-old' })],
  ['prose claim', 'I remember my role and team.'],
  ['missing ownership', JSON.stringify({ ...expected, ownedFiles: [] })],
  ['extra fields', JSON.stringify({ ...expected, extra: true })],
]) test(`${name} cannot establish exact recall`, () => assert.equal(recallEvidence([assistant(reply)], expected).matched, false));
test('incomplete assistant text and tools fail the text-only phase', () => {
  assert.equal(recallEvidence([{ ...assistant(JSON.stringify(expected)), finish: 'tool-calls' }], expected).matched, false);
  const phase = phaseEvidence([{ type: 'user', text: 'recall', time: { created: 10 } }, { ...assistant(''), content: [{ type: 'tool' }] }], 'recall');
  assert.equal(phase.noTools, false);
});
