const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
function validate(sources, research, inventory) {
  const ids = new Set();
  const hosts = new Set(['learn.chatgpt.com', 'code.claude.com', 'geminicli.com', 'dev.opencode.ai']);
  for (const source of sources.sources) {
    assert(!ids.has(source.id), 'duplicate source');
    ids.add(source.id);
    const url = new URL(source.url);
    assert(url.protocol === 'https:' && hosts.has(url.hostname), 'primary source required');
    assert.equal(source.reviewedOn, research.reviewedOn);
  }
  assert.equal(sources.sources.length, 10);
  assert.equal(research.routes.length, 4);
  for (const key of ['fullS4Qualified', 'productionEligible', 'liveAuthenticationTested', 'thirdPartyLoginApprovalQualified']) {
    assert.equal(research[key], false, key);
  }
  for (const route of research.routes) {
    assert.equal(route.classification, 'unreviewed');
    assert.equal(route.integrationEligible, false);
    assert.equal(route.productionEligible, false);
    assert.equal(route.nativeAuthQualified, false);
    assert.equal(route.policyReviewedOn, research.reviewedOn);
    assert(route.sourceIds.length && route.sourceIds.every(id => ids.has(id)));
  }
  const restrictions = {
    'anthropic-third-party-subscription-credential-reuse': 'anthropic-legal',
    'google-direct-cli-oauth-service-reuse': 'google-terms'
  };
  assert.equal(research.blockedRoutes.length, 2);
  for (const [id, source] of Object.entries(restrictions)) {
    const route = research.blockedRoutes.find(item => item.id === id);
    assert(route, 'restriction missing');
    assert.equal(route.classification, 'D');
    assert.equal(route.integrationEligible, false);
    assert(route.sourceIds.includes(source));
  }
  assert.equal(research.unresolvedAliases.length, 3);
  for (const alias of research.unresolvedAliases) {
    assert(alias.actualVendor.startsWith('unresolved'));
    assert.equal(alias.actualEndpoint, 'unresolved');
    assert.equal(alias.permissionStatus, 'unreviewed');
  }
  assert.equal(research.unresolvedAliases.find(item => item.executionClis.includes('agy')).geminiCliParityQualified, false);
  assert.equal(research.routes.find(item => item.cli === 'gemini').nativeStatus, 'command-unavailable');
  assert.equal(inventory.entries.length, 6);
  for (const entry of inventory.entries) {
    assert.deepEqual(Object.keys(entry.commands).sort(), ['--help', '--version']);
    for (const command of Object.values(entry.commands)) {
      assert.match(command.stdoutSha256, /^[a-f0-9]{64}$/);
      assert.match(command.stderrSha256, /^[a-f0-9]{64}$/);
    }
  }
  const gemini = inventory.entries.find(entry => entry.cli === 'gemini');
  assert.equal(gemini.commands['--version'].status, 'failed');
  assert.equal(gemini.commands['--help'].status, 'failed');
}
function checkFiles() {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name)));
  validate(read('sources.json'), read('routes.json'), read('evidence/cli-inventory.json'));
  const seal = read('evidence/research-seal.json');
  for (const [name, expected] of Object.entries(seal.sha256)) {
    assert(!path.isAbsolute(name) && !name.split(/[\\/]/).includes('..'), 'invalid seal path');
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
    assert.equal(actual, expected, name + ' changed since review');
  }
  console.log('S4 research structure and byte integrity passed; policy/native qualification remains partial');
}
if (require.main === module) checkFiles();
module.exports = { validate };
