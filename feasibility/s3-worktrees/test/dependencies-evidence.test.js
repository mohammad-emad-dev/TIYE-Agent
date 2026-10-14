'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { dependenciesPassed } = require('../scripts/run-dependencies');

test('dependency comparison refuses incomplete isolation, install and cleanup evidence', () => {
  const record = JSON.parse(fs.readFileSync(path.join(__dirname, '../evidence/dependencies-latest.json')));
  assert.equal(dependenciesPassed(record), true);
  for (const field of ['privateDonorUnchanged', 'borrowerExtraDependencyWorks', 'borrowerPrivateAfterInstall',
    'junctionCleanupVerified', 'originalRootUnchanged', 'registryRootOnly', 'rootTempRemoved']) {
    assert.equal(dependenciesPassed({ ...record, [field]: false }), false, field);
  }
  assert.equal(dependenciesPassed({ ...record, junctionMutationInstall: { status: 1 } }), false);
  assert.equal(dependenciesPassed({ ...record, sharedCacheMutationInstall: { status: 1 } }), false);
  assert.equal(dependenciesPassed({ ...record, donorChangedByLinkedInstall: true }), false);
  assert.equal(dependenciesPassed({ ...record, worktreesRemoved: 3 }), false);
});
