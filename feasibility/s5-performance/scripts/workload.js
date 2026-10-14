'use strict';
const crypto = require('node:crypto');
function validateWorkload(member, count, mode) {
  if (!Number.isInteger(member) || member < 0 || member > 4 || !Number.isInteger(count)
      || count < 1 || count > 10000 || !['normal','rich'].includes(mode)) throw new Error('invalid-synthetic-workload');
}
function outputRecord(member, sequence, mode) {
  const text = `member=${member} seq=${sequence} العربية 日本語 🌍 ${'public-workload '.repeat(16)}\n`;
  return mode === 'rich' ? '\x1b[32m' + text.replace('\n', '\x1b[0m\n') : text;
}
function expectedOutput(member, count, mode) {
  validateWorkload(member, count, mode);
  const digest = crypto.createHash('sha256'); let bytes = 0;
  for (let sequence = 0; sequence < count; sequence++) {
    const record = Buffer.from(outputRecord(member, sequence, mode)); bytes += record.length; digest.update(record);
  }
  return { bytes, sha256: digest.digest('hex') };
}
module.exports = { validateWorkload, outputRecord, expectedOutput };
