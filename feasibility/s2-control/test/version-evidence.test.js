'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { reviewedVersion } = require('../scripts/reviewed-version');
const { sealArchive, sealedBytes } = require('../scripts/version-evidence');

test('only explicitly reviewed exact versions qualify; unknown and lookalike versions require review', () => {
  for (const label of ['2.0.28', 'v2.0.28', 'opencode v2.0.28']) assert.equal(reviewedVersion(label), '2.0.28');
  for (const label of ['2.0.29', 'opencode v2.0.280', 'x2.0.28', '2.0.28-dev', '../2.0.28', null]) assert.throws(() => reviewedVersion(label), /requires review/);
});

test('sealed evidence preserves bytes, refuses replacement and detects file corruption', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-version-test-'));
  t.after(() => {
    const resolved = fs.realpathSync(root);
    if (path.dirname(resolved).toLowerCase() !== fs.realpathSync(os.tmpdir()).toLowerCase() || !path.basename(resolved).startsWith('tiye-version-test-')) throw new Error('Test temp boundary invalid');
    fs.rmSync(resolved, { recursive: true });
  });
  const request = { root, version: '2.0.28', sources: [{ name: 'observed.json', originalPath: 'evidence/observed.json', bytes: Buffer.from('{"passed":true}\r\n') }] };
  sealArchive(request); sealArchive(request);
  assert.deepEqual(sealedBytes({ root, version: '2.0.28', name: 'observed.json' }), request.sources[0].bytes);
  assert.throws(() => sealArchive({ ...request, sources: [{ ...request.sources[0], bytes: Buffer.from('changed') }] }), /overwrite refused/);
  assert.throws(() => sealedBytes({ root, version: '2.0.28', name: 'missing.json' }), /missing/);
  assert.throws(() => sealArchive({ ...request, sources: [{ ...request.sources[0], name: '../elsewhere.json' }] }), /names invalid/);
  assert.throws(() => sealArchive({ ...request, sources: [{ ...request.sources[0], name: 'manifest.json' }] }), /names invalid/);
  assert.throws(() => sealArchive({ ...request, sources: [{ ...request.sources[0], name: 'Manifest.json' }] }), /names invalid/);
  fs.writeFileSync(path.join(root, '2.0.28/observed.json'), 'corrupted');
  assert.throws(() => sealedBytes({ root, version: '2.0.28', name: 'observed.json' }), /integrity failed/);
});
