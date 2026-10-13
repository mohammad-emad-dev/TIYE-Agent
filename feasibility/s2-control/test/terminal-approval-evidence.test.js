'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { approvalScreen, approvalKeyEvidence, terminalApprovalRunPassed, approvalObservationApi } = require('../scripts/terminal-approval-evidence');
const command = `rtk proxy node -e "require('node:fs').appendFileSync('approval-marker.txt','approved')"`;

function renderedCard() {
  const lines = Array(38).fill('');
  lines[30] = '   ┃ ⚠ Permission required';
  lines[32] = '   ┃ $ ' + command;
  lines[35] = '      Allow once   Always allow   Reject';
  return { screen: lines.join('\n'), choices: [
    { label: 'Allow once', row: 35, column: 6, fg: 657930, bg: 16429699, fgMode: 50331648, bgMode: 50331648, inverse: 0 },
    { label: 'Always allow', row: 35, column: 19, fg: 15658734, bg: 1973790, fgMode: 50331648, bgMode: 50331648, inverse: 0 },
    { label: 'Reject', row: 35, column: 34, fg: 15658734, bg: 1973790, fgMode: 50331648, bgMode: 50331648, inverse: 0 },
  ] };
}

test('the native warning glyph is decorative, while command, choice positions and selected style must match', () => {
  const card = renderedCard();
  assert.deepEqual(approvalScreen(card, command), { visible: true, selected: 'once' });
  const mutations = [
    candidate => { candidate.screen = candidate.screen.replace('Permission required', 'Assistant says Permission required'); },
    candidate => { candidate.screen = candidate.screen.replace(command, 'another command'); },
    candidate => { candidate.choices[1] = candidate.choices[0]; },
    candidate => { candidate.choices[2].column++; },
    candidate => { candidate.choices[2].row--; },
    candidate => { candidate.choices[1].bg = candidate.choices[0].bg; },
    candidate => { candidate.choices[0].bg = 0; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(card); mutate(candidate);
    assert.equal(approvalScreen(candidate, command).visible, false);
  }
  const reject = structuredClone(card);
  Object.assign(reject.choices[0], { fg: 15658734, bg: 1973790 });
  Object.assign(reject.choices[2], { fg: 657930, bg: 16429699 });
  assert.equal(approvalScreen(reject, command).selected, 'reject');
});

test('only the exact navigation or confirmation input bytes qualify, ignoring known focus reports', () => {
  for (const [input, keys] of [['\r', ['Return']], ['\x1b[I\r\x1b[O', ['Return']], ['\x1b[C\x1b[C', ['Right', 'Right']], ['\x1bOC\x1bOC', ['Right', 'Right']]]) {
    assert.equal(approvalKeyEvidence(input, keys).matched, true);
  }
  for (const [input, keys] of [['\r\r', ['Return']], ['yes\r', ['Return']], ['\x1b[C\r', ['Right', 'Right']], ['\x1b[C', ['Right', 'Right']], ['\x1b[C', ['Down']], ['\x1b', ['Escape']]]) {
    assert.equal(approvalKeyEvidence(input, keys).matched, false);
  }
});

test('a passing API approval measurement cannot qualify as a native terminal decision', () => {
  const approvals = require('../evidence/versions/2.0.28/approval-outcomes-latest.json');
  for (const run of approvals.runs.filter(candidate => candidate.caseID !== 'deny-edit')) {
    assert.equal(run.passed, true);
    assert.equal(terminalApprovalRunPassed(run), false);
  }
});

test('the approval observer blocks mutations and foreign sessions before invoking API transport', async () => {
  const evidence = { apiMutationAttempts: 0, apiReadAttempts: 0 };
  const sent = [];
  const observe = approvalObservationApi({ api: async (...args) => { sent.push(args); return { data: [] }; }, cwd: 'owned', sessionID: 's1', evidence });
  assert.deepEqual(await observe('GET', '/api/session/s1/permission'), { data: [] });
  assert.throws(() => observe('POST', '/api/session/s1/permission/per1/reply'), /forbids mutations/);
  assert.throws(() => observe('DELETE', '/api/session/s1'), /forbids mutations/);
  assert.throws(() => observe('GET', '/api/session/foreign/permission'), /scope mismatch/);
  assert.equal(evidence.apiMutationAttempts, 2);
  assert.equal(evidence.apiReadAttempts, 1);
  assert.deepEqual(sent, [['owned', 'GET', '/api/session/s1/permission']]);
});

test('native decisions cannot pass without matching keystrokes, scoped observations, repeat marker samples and cleanup', () => {
  const measurement = require('../evidence/supplements/terminal-approvals/139d3d2c62ddf3a556578b62043e9b944bce9347cde9cf350a2f5eb77a7ee01e/2.0.28/terminal-approvals.json');
  for (const run of measurement.runs) {
    assert.equal(terminalApprovalRunPassed(run), true);
    for (const change of [{ uiDecisionInputMatched: false }, { uiDecisionInputsSent: 2 }, { decisionInput: { matched: false } },
      { apiMutationAttempts: 1 }, { apiApprovalRepliesSent: 1 }, { apiReadAttempts: 0 }, { uiScreenQualified: false },
      { uiSelectedDecisionObservedTwice: false }, { freshPromptAndAssistants: false }, { replyDecision: 'always' },
      { serviceVersionAfterCleanup: '2.0.22' }, { sessionRemoved: false }, { markerAbsentBeforeDecision: false }]) {
      assert.equal(terminalApprovalRunPassed({ ...run, cli: { ...run.cli, ...change } }), false);
    }
    assert.equal(terminalApprovalRunPassed({ ...run, protectedFileUnchanged: false }), false);
  }
  const once = measurement.runs.find(run => run.caseID === 'allow-once-shell');
  for (const change of [{ markerSamplesAtSecondApproval: 1 }, { navigationInput: { matched: true } }, { markerStableAtSecondApproval: false }]) {
    assert.equal(terminalApprovalRunPassed({ ...once, cli: { ...once.cli, ...change } }), false);
  }
});
