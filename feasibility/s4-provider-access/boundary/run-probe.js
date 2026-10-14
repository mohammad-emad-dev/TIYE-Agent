'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { simulatedGate } = require('./route-gate');
const { createWorkspace, releaseWorkspace, runFake } = require('./owned-fake');
const conditions = require('../conditions/review.json');
async function captureProbe() {
  const prerequisites = conditions.routes[0].requiredPrerequisites;
  const request = { mode: 'offline', routeId: 'openai-codex-cli', scenario: 'success',
    declarations: Object.fromEntries(prerequisites.map(name => [name, 'satisfied'])) };
  const missingChecks = prerequisites.map(name => {
    const declarations = { ...request.declarations }; delete declarations[name];
    const gate = simulatedGate({ ...request, declarations });
    assert.equal(gate.state, 'not-run'); assert.deepEqual(gate.missing, [name]);
    return name;
  });
  assert.equal(simulatedGate({ ...request, mode: 'live' }).category, 'live-disabled');
  assert.equal(simulatedGate({ ...request, routeId: 'Atria-Dawn-Preview' }).category, 'unknown-route');
  assert.equal(simulatedGate({ ...request, routeId: 'google-direct-cli-oauth-service-reuse' }).category, 'blocked-route');
  const handle = createWorkspace(), sibling = createWorkspace(), outcomes = {};
  const siblingMarker = path.join(sibling.root, '.tiye-offline-owner');
  const siblingBytes = fs.readFileSync(siblingMarker);
  try {
    assert.throws(() => releaseWorkspace({ root: sibling.root }), /foreign/);
    for (const scenario of ['success','auth','quota','model','invalid','foreign','exit']) outcomes[scenario] = await runFake(handle, { ...request, scenario });
    const expected = ['synthetic-task','auth','quota','unsupported-model','invalid-reply','uncorrelated-reply','process-exit'];
    Object.values(outcomes).forEach((outcome, index) => assert.equal(outcome.category, expected[index]));
    assert(!/SYNTHETIC|example.invalid|token|prompt|stderr/.test(JSON.stringify(outcomes)));
    const extra = path.join(handle.root, 'foreign.txt'); fs.writeFileSync(extra, 'public sentinel');
    assert.throws(() => releaseWorkspace(handle), /unexpected/);
    assert.equal(fs.readFileSync(extra, 'utf8'), 'public sentinel'); fs.unlinkSync(extra);
    releaseWorkspace(handle); assert(!fs.existsSync(handle.root));
    assert.deepEqual(fs.readFileSync(siblingMarker), siblingBytes);
  } finally { if (fs.existsSync(handle.root)) releaseWorkspace(handle); releaseWorkspace(sibling); }
  const sourceFiles = ['route-gate.js','owned-fake.js','fake-cli.js','run-probe.js','../routes.json','../conditions/review.json'];
  const sourceHashes = Object.fromEntries(sourceFiles.map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex')]));
  const evidence = { schema: 'tiye-s4-offline-boundary-v1', recordedAt: new Date().toISOString(), platform: process.platform, node: process.version,
    scope: 'Fixed local fake Node child only; no vendor CLI, auth or provider requests', missingChecks, outcomes, sourceHashes,
    liveRefused: true, aliasRefused: true, blockedRouteRefused: true, foreignHandleRefused: true, unexpectedContentPreserved: true,
    siblingPreserved: true, ownedCleanup: true, syntheticFieldsOmitted: true, offlineBoundaryQualified: true,
    providerRequests: 0, liveAuthenticationTested: false, fullS4Qualified: false, productionEligible: false };
  fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  console.log('Recorded offline boundary probe: 7 fake child outcomes; S4 remains partial');
}
captureProbe().catch(error => { console.error(error); process.exitCode = 1; });
