'use strict';
// A controlled fault source, never evidence of vendor CLI failure behavior.
const { createInterface } = require('node:readline');
process.once('message', settings => {
  if (settings?.type !== 'launch') return;
  createInterface({ input: process.stdin }).on('line', line => {
    const request = JSON.parse(line);
    if (request.method === 'fixture/ready') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { ready: true } }) + '\n');
      return;
    }
    if (request.method !== 'fixture/fault') throw new Error('Unexpected fixture request');
    process.send({ type: 'fault-received' });
    if (settings.fault === 'crash') process.exit(23);
    if (settings.fault === 'malformed') process.stdout.write('{invalid\n');
    // The hang case deliberately keeps the request outstanding and process alive.
  });
});
