'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { simulatedGate } = require('../route-gate');
const { createWorkspace, releaseWorkspace, runFake, sanitizedOutcome } = require('../owned-fake');
const conditions = require('../../conditions/review.json');
function completeRequest() {
  return { mode: 'offline', routeId: 'openai-codex-cli', scenario: 'success',
    declarations: Object.fromEntries(conditions.routes[0].requiredPrerequisites.map(name => [name, 'satisfied'])) };
}
for (const prerequisite of conditions.routes[0].requiredPrerequisites) test('missing ' + prerequisite + ' prevents fake launch', async () => {
  const request = completeRequest(); delete request.declarations[prerequisite];
  const outcome = await runFake({}, request);
  assert.equal(outcome.state, 'not-run'); assert.deepEqual(outcome.missing, [prerequisite]);
});
for (const [routeId, category] of [['Atria-Dawn-Preview', 'unknown-route'], ['google-direct-cli-oauth-service-reuse', 'blocked-route']]) test(routeId + ' cannot supply an executable route', () => {
  assert.equal(simulatedGate({ ...completeRequest(), routeId }).category, category);
});
test('complete declarations never enable live mode', async () => {
  assert.equal((await runFake({}, { ...completeRequest(), mode: 'live' })).category, 'live-disabled');
});
for (const [scenario, state, category] of [['success','completed','synthetic-task'],['auth','failed','auth'],['quota','failed','quota'],['model','failed','unsupported-model'],['invalid','failed','invalid-reply'],['foreign','failed','uncorrelated-reply'],['exit','failed','process-exit']]) test('real fake child classifies ' + scenario + ' without retaining raw text', async () => {
  const handle = createWorkspace();
  try {
    const outcome = await runFake(handle, { ...completeRequest(), scenario });
    assert.equal(outcome.state, state); assert.equal(outcome.category, category);
    assert(!/SYNTHETIC|example.invalid|prompt|token|stderr/.test(JSON.stringify(outcome)));
    assert.deepEqual(Object.keys(outcome).sort(), ['category', 'exitCode', 'state'].filter(key => key !== 'exitCode' || Number.isInteger(outcome.exitCode)).sort());
  } finally { releaseWorkspace(handle); }
  assert(!fs.existsSync(handle.root));
});
test('malformed status and oversized text cannot report completion', () => {
  assert.equal(sanitizedOutcome('x'.repeat(4097), 0, 'request').category, 'oversized-reply');
  for (const reply of [{requestId:'request',status:'completed',category:'quota'}, {requestId:'request',status:'failed',category:'arbitrary sensitive text'}]) {
    assert.equal(sanitizedOutcome(JSON.stringify(reply), 0, 'request').category, 'invalid-reply');
  }
});
test('foreign handles and running cleanup are refused; sibling bytes survive', async () => {
  const handle = createWorkspace(), sibling = createWorkspace();
  const markerPath = path.join(sibling.root, '.tiye-offline-owner'), before = fs.readFileSync(markerPath);
  try {
    assert.throws(() => releaseWorkspace({ root: sibling.root }), /foreign/);
    const completion = runFake(handle, completeRequest());
    assert.throws(() => releaseWorkspace(handle), /active/);
    assert.equal((await completion).state, 'completed');
    releaseWorkspace(handle);
    assert.deepEqual(fs.readFileSync(markerPath), before);
  } finally { releaseWorkspace(sibling); if (fs.existsSync(handle.root)) releaseWorkspace(handle); }
});
test('marker drift and unexpected content refuse cleanup without removing bytes', () => {
  const handle = createWorkspace(), markerPath = path.join(handle.root, '.tiye-offline-owner');
  const before = fs.readFileSync(markerPath), extra = path.join(handle.root, 'foreign.txt');
  try {
    fs.writeFileSync(markerPath, 'foreign-owner');
    assert.throws(() => releaseWorkspace(handle), /marker-drift/); assert(fs.existsSync(handle.root));
    fs.writeFileSync(markerPath, before); fs.writeFileSync(extra, 'preserve');
    assert.throws(() => releaseWorkspace(handle), /unexpected/); assert.equal(fs.readFileSync(extra, 'utf8'), 'preserve');
    fs.unlinkSync(extra);
  } finally { fs.writeFileSync(markerPath, before); releaseWorkspace(handle); }
});
test('hardlinked ownership marker cannot authorize cleanup', () => {
  const handle = createWorkspace(), alias = path.join(handle.root, 'linked-marker');
  try {
    fs.linkSync(path.join(handle.root, '.tiye-offline-owner'), alias);
    assert.throws(() => releaseWorkspace(handle), /marker-drift/);
    fs.unlinkSync(alias);
  } finally { if (fs.existsSync(alias)) fs.unlinkSync(alias); releaseWorkspace(handle); }
});
test('caller cannot choose arbitrary child executable or scenario', async () => {
  const handle = createWorkspace();
  try {
    await assert.rejects(runFake({ root: handle.root }, completeRequest()), /foreign/);
    await assert.rejects(runFake(handle, { ...completeRequest(), scenario: 'arbitrary-command' }), /unknown-fake/);
  } finally { releaseWorkspace(handle); }
});
