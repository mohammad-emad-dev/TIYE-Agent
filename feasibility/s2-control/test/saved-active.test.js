'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { savedActiveRunPassed } = require('../scripts/run-saved-active');

test('saved-grant active qualification requires a real owned grant, active stop, revocation and complete cleanup', () => {
  const run = require('../evidence/supplements/saved-active/44b3fe7ba07a810baad56babe2b21eaabab891ad338c04488071a10c74899b71/2.0.28/saved-active.json').run;
  assert.equal(savedActiveRunPassed(run), true);
  for (const change of [
    { faultReads: 1 }, { savedBaselineEmpty: false }, { grantProjectMatched: false }, { controlledRequestConfirmed: false },
    { alwaysReplyAccepted: false }, { savedRuleOwned: false }, { savedRuleCount: 0 }, { savedRuleRemoved: false },
    { savedListEmptyAfterRevocation: false }, { noAutoResume: false }, { idleNeverExecuted: false }, { idleSessionRemoved: false },
    { controlledRequestSettled: false }, { cancelledStableTwice: false }, { commandProcessesGoneTwice: false },
    { inputTransportCalls: 1 }, { fallbackTerminationUsed: true }, { serviceVersionAfterCleanup: '2.0.29' },
  ]) assert.equal(savedActiveRunPassed({ ...run, cli: { ...run.cli, ...change } }), false);
  const injected = require('../evidence/supplements/strict-ask-active/86f746c8fe81c2e61d6eb5811906b17a989cb77ed2f79b29bbcc20b74cb74e5e/2.0.28/strict-ask-active.json').run;
  assert.equal(savedActiveRunPassed(injected), false);
  assert.equal(savedActiveRunPassed({ ...run, tempRemoved: false }), false);
});
