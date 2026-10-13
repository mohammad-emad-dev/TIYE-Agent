'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { nativeExecutable } = require('./persistent-cli');
const { reviewedVersion } = require('./reviewed-version');

const executable = nativeExecutable();
const outputs = Object.fromEntries([['version', ['--version']], ['interactive', ['--help']], ['run', ['run', '--help']]].map(([name, args]) => {
  const checked = spawnSync(executable, args, { encoding: 'utf8', timeout: 10000, windowsHide: true, maxBuffer: 64000 });
  if (checked.status !== 0 || checked.error || typeof checked.stdout !== 'string') throw new Error('CLI help capture failed');
  return [name, checked.stdout.trim()];
}));
reviewedVersion(outputs.version);
if (!outputs.interactive.includes('--auto') || !outputs.run.includes('--auto')) throw new Error('permission inventory flags changed; review required');
const inventory = {
  scope: 'Installed OpenCode permission-relevant launch options, with complete help output; no model request',
  recordedAt: new Date().toISOString(), version: outputs.version,
  launchControls: [
    { control: '--auto', surfaces: ['interactive', 'run'], meaning: 'Auto-approve requests not explicitly denied', testedInLiveControls: false },
    { control: '--agent', surfaces: ['run'], meaning: 'Select agent policy', testedInLiveControls: false },
    { control: '--session', surfaces: ['interactive', 'run'], meaning: 'Use a session whose model, agent and permissions were set by the own-session API', testedInLiveControls: true },
    { control: 'permissions', surfaces: ['config'], meaning: 'Ordered action/resource/effect rules; live probes additionally supplied and verified session permissions', testedInLiveControls: true },
    { control: 'agents.<id>.permissions', surfaces: ['config'], meaning: 'Agent-scoped policy rules documented by V2', testedInLiveControls: false },
    { control: 'plan agent', surfaces: ['agent-policy'], meaning: 'Documented edit restriction with a plan-directory exception', testedInLiveControls: false },
  ],
  documentedActions: ['read', 'edit', 'glob', 'grep', 'shell', 'subagent', 'skill', 'question', 'webfetch', 'websearch', 'external_directory', '<server>_<tool>', 'execute'],
  documentation: ['https://opencode.ai/v2/docs/permissions', 'https://opencode.ai/v2/openapi.json'],
  help: outputs,
};
fs.writeFileSync(path.resolve(__dirname, '../evidence/permission-options-latest.json'), JSON.stringify(inventory, null, 2) + '\n');
console.log('[permission-options] captured installed help; no credentials or model request');
