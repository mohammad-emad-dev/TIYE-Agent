'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { basicsPassed } = require('../scripts/run-basics');

test('baseline evidence cannot pass missing setup, merge/conflict proof or owned cleanup', () => {
  const record = require('../evidence/supplements/basics/ec3e80f81c93a254a90207ca086c54379c10edb0f3f67dc7052153289d865afb/basics.json');
  assert.equal(basicsPassed(record), true);
  for (const change of [{ worktreesCreated: 2 }, { commonGitMatched: false }, { setupPassed: false }, { settingsCopied: false },
    { parallelWritersCompleted: false }, { differentFilesMerged: false }, { conflictExit: 0 }, { conflictFiles: [] },
    { conflictAbortRestored: false }, { originalRootUnchanged: false }, { worktreesRemoved: 2 }, { registryRootOnly: false },
    { baseTempRemoved: false }, { rootTempRemoved: false }]) assert.equal(basicsPassed({ ...record, ...change }), false);
});
