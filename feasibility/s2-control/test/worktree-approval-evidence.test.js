'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { worktreeLocationMatches, worktreeApprovalRunPassed } = require('../scripts/worktree-approval-evidence');

test('worktree location accepts original-project metadata only when the active directory is the owned worktree', () => {
  const root = path.resolve('owned-root');
  const worktree = path.resolve('owned-worktree');
  const location = { directory: worktree, project: { id: 'owned-project', directory: root } };
  assert.equal(worktreeLocationMatches({ location, root, worktree }), true);
  assert.equal(worktreeLocationMatches({ location: { ...location, project: { ...location.project, directory: worktree } }, root, worktree }), true);
  for (const invalid of [
    { ...location, directory: root },
    { ...location, project: { ...location.project, directory: path.resolve('foreign-project') } },
    { ...location, project: { ...location.project, id: '../foreign' } },
    { ...location, project: undefined },
  ]) assert.equal(worktreeLocationMatches({ location: invalid, root, worktree }), false);
});

test('shared-worktree measurement requires matching topology, scope-specific phases, file checks and registry cleanup', () => {
  const run = require('../evidence/supplements/worktree-approvals/9e8f410baf99420b2fe22ec81b1101a03e5a0f0f0bee199844d98c006fbd8eeb/2.0.28/worktree-approvals.json').run;
  assert.equal(worktreeApprovalRunPassed(run), true);
  for (const change of [{ gitCommonDirectoryMatched: false }, { gitHeadMatched: false }, { worktreeLocationConfirmed: false },
    { savedBaselinesEmpty: false }, { sharedNativeProject: false }, { savedRuleRemoved: false },
    { worktreeProtectedUnchanged: false }, { worktreeMarkerAfterCleanupMatched: false }, { worktreeFileScopeMatched: false },
    { worktreeRemoved: false }, { gitRegistryClean: false }, { parentPermissionReplies: 1 }, { serviceVersionAfterCleanup: '2.0.22' }]) {
    assert.equal(worktreeApprovalRunPassed({ ...run, cli: { ...run.cli, ...change } }), false);
  }
  const mutations = [
    phases => { phases.pop(); },
    phases => { phases[1] = phases[0]; },
    phases => { phases[1].pendingEverObserved = true; },
    phases => { phases[2].failedShellErrorTypes = ['aborted']; },
    phases => { phases[3].ownPendingRequests = 0; },
    phases => { phases[4].completedShellCalls = 1; },
    phases => { phases[1].sessionRemoved = false; },
    phases => { phases[1].cleanup.verified = false; },
  ];
  for (const mutate of mutations) {
    const worktreePhases = structuredClone(run.cli.worktreePhases); mutate(worktreePhases);
    assert.equal(worktreeApprovalRunPassed({ ...run, cli: { ...run.cli, worktreePhases } }), false);
  }
  assert.equal(worktreeApprovalRunPassed({ ...run, tempRemoved: false }), false);
  assert.equal(worktreeApprovalRunPassed({ ...run, commandMarkerMatched: false }), false);
});
