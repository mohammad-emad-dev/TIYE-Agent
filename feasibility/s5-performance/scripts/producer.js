'use strict';
const { once } = require('node:events');
const { validateWorkload, outputRecord } = require('./workload');
async function emitWorkload() {
  const [memberText,countText,mode] = process.argv.slice(2);
  const member = Number(memberText), count = Number(countText);
  validateWorkload(member, count, mode);
  for (let sequence = 0; sequence < count; sequence++) {
    if (!process.stdout.write(outputRecord(member, sequence, mode))) await once(process.stdout, 'drain');
  }
}
emitWorkload().catch(() => { process.stderr.write('synthetic-producer-failed\n'); process.exitCode = 1; });
