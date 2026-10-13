'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { reviewedVersion } = require('./reviewed-version');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function sealArchive({ root, version, sources }) {
  const directory = path.join(root, reviewedVersion(version));
  if (sources.some(source => !/^[a-z0-9][a-z0-9._-]*\.json$/.test(source.name) || source.name === 'manifest.json')
    || new Set(sources.map(source => source.name)).size !== sources.length) throw new Error('Archive source names invalid');
  const manifest = Buffer.from(JSON.stringify({ version: reviewedVersion(version), records: sources.map(source => ({ name: source.name, originalPath: source.originalPath, sha256: hash(source.bytes) })) }, null, 2) + '\n');
  const files = [...sources, { name: 'manifest.json', bytes: manifest }];
  for (const source of files) {
    const target = path.join(directory, source.name);
    if (fs.existsSync(target) && !fs.readFileSync(target).equals(source.bytes)) throw new Error('Immutable archive overwrite refused');
  }
  fs.mkdirSync(directory, { recursive: true });
  for (const source of files) {
    const target = path.join(directory, source.name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, source.bytes, { flag: 'wx' });
  }
}

function sealedBytes({ root, version, name }) {
  const directory = path.join(root, reviewedVersion(version));
  if (!/^[a-z0-9][a-z0-9._-]*\.json$/.test(name) || name === 'manifest.json') throw new Error('Archive name invalid');
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
  if (manifest.version !== reviewedVersion(version) || !Array.isArray(manifest.records)) throw new Error('Archive manifest invalid');
  const matches = manifest.records.filter(record => record.name === name);
  if (matches.length !== 1) throw new Error('Archive source missing or duplicated');
  const bytes = fs.readFileSync(path.join(directory, name));
  if (hash(bytes) !== matches[0].sha256) throw new Error('Archive integrity failed');
  return bytes;
}
module.exports = { sealArchive, sealedBytes };
