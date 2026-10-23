'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');

function launch(mode, root, barrier, host = 'host.cjs') {
  assert(['host.cjs', 'mock-host.cjs'].includes(host));
  const child = spawn(process.execPath, [path.join(__dirname, host), mode, root, ...(barrier ? [barrier] : [])],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const deadline = Date.now() + 10000;
  const records = [], readers = [];
  let pending = '', diagnostics = '', exited = false, deadlineExceeded = false;
  const watchdog = setTimeout(() => { deadlineExceeded = true; child.kill(); }, 10000);
  const closed = new Promise(resolve => child.once('close', (code, signal) => {
    exited = true; clearTimeout(watchdog); resolve({ code, signal, deadlineExceeded, stderr: diagnostics });
  }));
  child.once('error', fault => { diagnostics += fault.message; });
  child.stderr.on('data', block => { diagnostics += block.toString(); assert(Buffer.byteLength(diagnostics) < 32768); });
  child.stdout.on('data', block => {
    pending += block.toString(); assert(Buffer.byteLength(pending) <= 32768);
    while (pending.includes('\n')) {
      const end = pending.indexOf('\n'), line = pending.slice(0, end); pending = pending.slice(end + 1);
      const record = JSON.parse(line);
      if (readers.length) readers.shift()(record); else records.push(record);
    }
  });
  async function read() {
    if (records.length) return records.shift();
    let timer;
    try {
      return await Promise.race([new Promise(resolve => readers.push(resolve)),
        closed.then(outcome => { throw new Error('host closed: ' + JSON.stringify(outcome) + diagnostics); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('host operation deadline')), Math.max(1, deadline - Date.now())); })]);
    } finally { clearTimeout(timer); }
  }
  async function stop() {
    child.stdin.end();
    let timer;
    try {
      if (!exited) child.kill();
      const outcome = await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('unverified owned-child exit')), 5000); })]);
      assert.equal(outcome.deadlineExceeded, false, 'test child exceeded operation deadline');
    } finally { clearTimeout(timer); }
  }
  function send(packet) { assert(Buffer.byteLength(packet) < 32768); child.stdin.write(packet + '\n'); }
  return { child, read, send, stop, closed };
}
module.exports = { launch };
