'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MODEL, savedAlwaysScreen, shellPhaseSnapshot, ownedSavedRules, savedApprovalRunPassed } = require('../scripts/saved-approval-evidence');
const task = { prompt: 'request exactly one marker command', command: 'rtk proxy node marker.js' };
const user = { type: 'user', text: task.prompt, time: { created: 11 } };
const tool = { type: 'tool', name: 'shell', id: 't1', state: { status: 'running', input: { command: task.command } } };
const assistant = { type: 'assistant', id: 'a1', model: MODEL, time: { created: 12 }, content: [tool] };
const pending = { id: 'per1', sessionID: 's1', action: 'shell', resources: [task.command], save: ['rtk proxy *'], source: { type: 'tool', messageID: 'a1', id: 't1' } };
const inspect = (messages, requests, outcome) => shellPhaseSnapshot({ messages, requests, outcome, sessionID: 's1', task, cwd: process.cwd(), submittedAt: 10 }).evidence.phaseObserved;

test('saved-phase outcomes need the fresh exact command/model and actual pending, completion or native denial', () => {
  assert.equal(inspect([user, assistant], [pending], 'pending'), true);
  const completed = { ...assistant, time: { created: 12, completed: 13 }, content: [{ ...tool, state: { ...tool.state, status: 'completed' } }] };
  assert.equal(inspect([user, completed], [], 'completed'), true);
  const denied = { ...completed, content: [{ ...tool, state: { ...tool.state, status: 'error', error: { type: 'permission.rejected' } } }] };
  assert.equal(inspect([user, denied], [], 'denied'), true);
  assert.equal(inspect([user, denied], [], 'completed'), false);
  assert.equal(inspect([user, completed], [], 'denied'), false);
  for (const error of [{ type: 'provider.auth', status: 403 }, { type: 'aborted' }]) {
    assert.equal(inspect([user, { ...denied, error }], [], 'denied'), false);
  }
  for (const mutated of [
    { ...assistant, model: { ...MODEL, variant: 'low' } },
    { ...assistant, time: { created: 8 } },
    { ...assistant, content: [tool, tool] },
    { ...assistant, content: [{ ...tool, state: { ...tool.state, input: { command: 'another command' } } }] },
  ]) assert.equal(inspect([user, mutated], [pending], 'pending'), false);
  assert.equal(inspect([{ ...user, time: { created: 8 } }, assistant], [pending], 'pending'), false);
  assert.equal(inspect([user, assistant], [{ ...pending, sessionID: 'foreign' }], 'pending'), false);
});

test('saved-rule cleanup ownership rejects foreign, old, duplicate or unproposed rule tuples', () => {
  const request = { projectID: 'owned-a', proposed: ['rtk proxy *'], submittedAt: 10,
    rows: [{ id: 'saved1', projectID: 'owned-a', action: 'shell', resource: 'rtk proxy *', time: { created: 11, updated: 11 } }] };
  assert.equal(ownedSavedRules(request), true);
  for (const change of [{ projectID: 'foreign' }, { action: 'edit' }, { resource: '*' }, { time: { created: 8 } }, { id: '../foreign' }]) {
    assert.equal(ownedSavedRules({ ...request, rows: [{ ...request.rows[0], ...change }] }), false);
  }
  assert.equal(ownedSavedRules({ ...request, rows: [] }), false);
  assert.equal(ownedSavedRules({ ...request, rows: [request.rows[0], request.rows[0]] }), false);
  assert.equal(ownedSavedRules({ ...request, proposed: ['rtk proxy *', 'rtk proxy *'] }), false);
  assert.equal(ownedSavedRules({ ...request, proposed: [] }), false);
});

test('Always allow uses the proposed-pattern pane and the validated palette, never a missing or different saved pattern', () => {
  const palette = { selected: JSON.stringify([1, 2, 3, 4, 0]), normal: JSON.stringify([5, 6, 3, 4, 0]) };
  const request = { screen: '┃ ⚠ Permission required\n┃ shell rtk proxy *\nAllow once Always allow Reject', proposed: ['rtk proxy *'], palette,
    choices: [
      { label: 'Allow once', row: 2, column: 0, fg: 5, bg: 6, fgMode: 3, bgMode: 4, inverse: 0 },
      { label: 'Always allow', row: 2, column: 11, fg: 1, bg: 2, fgMode: 3, bgMode: 4, inverse: 0 },
      { label: 'Reject', row: 2, column: 24, fg: 5, bg: 6, fgMode: 3, bgMode: 4, inverse: 0 },
    ] };
  assert.equal(savedAlwaysScreen(request), true);
  for (const mutate of [
    candidate => { candidate.proposed = ['other *']; },
    candidate => { candidate.choices[1].bg = 6; },
    candidate => { candidate.choices[2].column--; },
    candidate => { candidate.screen = candidate.screen.replace('Permission required', 'model says Permission required'); },
    candidate => { candidate.choices[2] = candidate.choices[1]; },
  ]) {
    const candidate = structuredClone(request); mutate(candidate);
    assert.equal(savedAlwaysScreen(candidate), false);
  }
});

test('saved approval qualification needs all five phases, row removal and every owned session/client/project cleanup', () => {
  const run = require('../evidence/supplements/saved-approvals/0719a9c02b6d2f879acf5d34f62ceab119d1335e812f6e71df999dea10874342/2.0.28/saved-approvals.json').run;
  assert.equal(savedApprovalRunPassed(run), true);
  for (const change of [{ savedRuleRemoved: false }, { projectIdentitiesDistinct: false }, { projectBaselinesEmpty: false },
    { uiAlwaysSelectedTwice: false }, { parentPermissionReplies: 1 }, { savedRulePersistedAcrossSessions: false },
    { otherProjectCleaned: false }, { serviceVersionAfterCleanup: '2.0.22' }, { sessionRemoved: false }]) {
    assert.equal(savedApprovalRunPassed({ ...run, cli: { ...run.cli, ...change } }), false);
  }
  const mutations = [
    phases => { phases.pop(); },
    phases => { phases[1] = phases[0]; },
    phases => { phases[2].phaseObserved = false; },
    phases => { phases[3].markerMatched = false; },
    phases => { phases[4].sessionRemoved = false; },
    phases => { phases[1].cleanup.jobVerified = false; },
  ];
  for (const mutate of mutations) {
    const savedPhases = structuredClone(run.cli.savedPhases); mutate(savedPhases);
    assert.equal(savedApprovalRunPassed({ ...run, cli: { ...run.cli, savedPhases } }), false);
  }
  assert.equal(savedApprovalRunPassed({ ...run, commandMarkerMatched: false }), false);
  assert.equal(savedApprovalRunPassed({ ...run, tempRemoved: false }), false);
});
