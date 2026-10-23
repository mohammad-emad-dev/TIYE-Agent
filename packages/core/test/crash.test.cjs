'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CoreStore } = require('../dist');
const { privateRoot, command, bytes } = require('./helpers.cjs');
const { launch } = require('./processes.cjs');

test('idle owner excludes a second process and process death releases the lease', async t => {
  const root = privateRoot(t), core = CoreStore.create(root); core.close();
  const owner = launch('open', root);
  try {
    assert.deepEqual(await owner.read(), { ready: true });
    const contender = launch('open', root);
    try {
      const outcome = await contender.closed;
      assert.notEqual(outcome.code, 0);
      assert.equal(outcome.deadlineExceeded, false);
      assert.match(outcome.stderr, /SQLITE_BUSY/);
    } finally { await contender.stop(); }
  } finally { await owner.stop(); }
  const reopened = CoreStore.open(root);
  try { assert.equal(reopened.snapshot().eventCount, 0); } finally { reopened.close(); }
});

for (const boundary of ['before-commit', 'after-commit']) {
  test('fresh process recovery at ' + boundary + ' observes the real SQLite commit', async t => {
    const root = privateRoot(t), initial = CoreStore.create(root); initial.close();
    const packet = command(), host = launch('open', root, boundary);
    try {
      assert.deepEqual(await host.read(), { ready: true });
      host.send(bytes(packet).toString());
      assert.deepEqual(await host.read(), { barrier: boundary });
    } finally { await host.stop(); }
    const reader = launch('open', root);
    try {
      assert.deepEqual(await reader.read(), { ready: true });
      reader.send('snapshot');
      const recovered = await reader.read();
      assert.equal(recovered.eventCount, boundary === 'before-commit' ? 0 : 1);
      reader.send(bytes(packet).toString());
      assert.equal((await reader.read()).status, 'accepted');
      reader.send(bytes(packet).toString()); await reader.read();
      reader.send('snapshot');
      assert.equal((await reader.read()).eventCount, 1);
    } finally { await reader.stop(); }
  });
}
