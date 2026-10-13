'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const { nativeExecutable, attachJob, closePrivate, waitUntil, summarizeToolEvents, processInventory, ownedIdentities } = require('./persistent-cli');
const SERVICE_PERMISSIONS = [
  { action: 'edit', resource: '*', effect: 'deny' },
  { action: 'shell', resource: '*', effect: 'ask' },
  { action: 'tiye-team-tools_report_result', resource: '*', effect: 'allow' },
];

async function serviceApi(cwd, method, route, body) {
  const args = ['api', method, route];
  if (body !== undefined) args.push('--data', JSON.stringify(body));
  const child = spawn(nativeExecutable(), args, { cwd, env: { ...process.env, PWD: cwd }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  let failed = false;
  let closed = false;
  child.stdout.on('data', (chunk) => { const next = output + chunk; if (next.length > 128000) failed = true; output = next.slice(-128000); });
  child.stderr.resume();
  child.on('error', () => { failed = true; });
  child.on('close', () => { closed = true; });
  try {
    await waitUntil(() => failed || closed, 12000);
    if (failed || child.exitCode !== 0) throw new Error('service API request failed');
    return output.trim() ? JSON.parse(output) : null;
  } finally {
    if (!closed) { child.kill(); await waitUntil(() => closed, 5000); }
  }
}

async function probeServiceReport({ cwd, summary, member, terminalTask }) {
  const model = { providerID: 'opencode', id: 'muse-spark-1.3-contributor-free', variant: 'xhigh' };
  const evidence = { completedAck: false, locationUntouched: true };
  let sessionID;
  let state;
  let serviceIdentity;
  let createdAt;
  const location = { directory: cwd };
  try {
    evidence.stage = 'service-info';
    serviceIdentity = await serviceApi(cwd, 'GET', '/api/info');
    evidence.version = serviceIdentity.version;
    const existing = await serviceApi(cwd, 'GET', '/api/debug/location');
    if (!Array.isArray(existing) || existing.some(entry => path.resolve(entry.directory).toLowerCase() === path.resolve(cwd).toLowerCase())) throw new Error('temporary location ownership unverified');
    evidence.locationUntouched = false;
    evidence.stage = 'session-create';
    const created = await serviceApi(cwd, 'POST', '/api/session', { location, agent: terminalTask ? 'build' : 'plan', model,
      permissions: terminalTask ? SERVICE_PERMISSIONS.map(rule => rule.action === 'edit' ? { ...rule, effect: 'allow' } : rule) : SERVICE_PERMISSIONS,
      title: 'TIYE service report feasibility',
    });
    if (!/^ses_[a-zA-Z0-9]+$/.test(created?.data?.id)) throw new Error('owned session schema unexpected');
    sessionID = created.data.id;
    createdAt = created.data.time.created;
    evidence.modelConfirmed = Object.entries(model).every(([key, value]) => created.data.model?.[key] === value);
    evidence.locationConfirmed = path.resolve(created.data.location?.directory || '').toLowerCase() === path.resolve(cwd).toLowerCase();
    if (!evidence.modelConfirmed || !evidence.locationConfirmed) throw new Error('owned session selection unverified');
    evidence.stage = 'mcp-connect';
    for (let attempt = 0; attempt < 12; attempt++) {
      const catalog = await serviceApi(cwd, 'GET', `/api/mcp?location[directory]=${encodeURIComponent(cwd)}`);
      evidence.connected = catalog?.data?.some(entry => entry.name === 'tiye-team-tools' && entry.status?.status === 'connected') === true;
      if (evidence.connected) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!evidence.connected) throw new Error('owned MCP catalog not connected');
    evidence.stage = 'model-task';
    if (terminalTask) {
      const result = await terminalTask({ cwd, sessionID, summary, member, serviceApi });
      state = result.state;
      Object.assign(evidence, result.evidence);
    } else {
      const child = spawn(nativeExecutable(), ['run', '--session', sessionID, '--model', 'opencode/muse-spark-1.3-contributor-free#xhigh', '--agent', 'plan', '--format', 'json'], {
        cwd, env: { ...process.env, PWD: cwd }, stdio: ['pipe','pipe','pipe'], windowsHide: true,
      });
      state = { child };
      let output = '';
      let truncated = false;
      child.stdout.on('data', chunk => { const next = output + chunk; truncated ||= next.length > 64000; output = next.slice(-64000); });
      child.stderr.resume();
      child.on('error', () => { state.error = true; });
      child.stdin.on('error', () => { state.error = true; });
      child.on('close', () => { state.closed = true; });
      await attachJob(state);
      state.captured = ownedIdentities(await processInventory(), child.pid);
      const startedAt = Date.now();
      child.stdin.end(`Call tiye-team-tools_report_result exactly once with summary ${JSON.stringify(summary)} and status "done". Use no other tools. Finish after the acknowledgment. This is a feasibility tool-call task; prose does not count.`);
      await waitUntil(() => state.error || state.closed, 120000);
      evidence.elapsedMs = Date.now() - startedAt;
      evidence.cliExitCode = child.exitCode;
      evidence.cliSpawnError = state.error === true;
      evidence.outputTruncated = truncated;
      Object.assign(evidence, summarizeToolEvents({ output, summary, member }));
    }
    const messages = await serviceApi(cwd, 'GET', `/api/session/${sessionID}/message?limit=100&order=desc`);
    const assistants = messages?.data?.filter(message => message.type === 'assistant') || [];
    evidence.executedModelConfirmed = assistants.length > 0 && assistants.every(message => Object.entries(model).every(([key, value]) => message.model?.[key] === value));
    if (!evidence.error) evidence.stage = 'completed';
  } catch { evidence.error = 'service-backed invocation failed'; }
  finally {
    try {
      if (sessionID) {
        const interrupted = await serviceApi(cwd, 'POST', `/api/session/${sessionID}/interrupt`, {});
        if (typeof interrupted?.interrupted !== 'boolean') throw new Error('owned interrupt schema unexpected');
        const again = await serviceApi(cwd, 'POST', `/api/session/${sessionID}/interrupt`, {});
        evidence.sessionStopped = again?.interrupted === false;
        if (!evidence.sessionStopped) throw new Error('owned session still running');
        const stopped = await serviceApi(cwd, 'GET', `/api/session/${sessionID}`);
        evidence.idleVerified = Number.isFinite(stopped.data?.time?.idle) && stopped.data.time.idle >= createdAt;
        if (!evidence.idleVerified) throw new Error('owned session idle state unverified');
        await serviceApi(cwd, 'DELETE', `/api/session/${sessionID}`);
        const sessions = await serviceApi(cwd, 'GET', `/api/session?directory=${encodeURIComponent(cwd)}`);
        evidence.sessionRemoved = Array.isArray(sessions.data) && !sessions.data.some(session => session.id === sessionID);
        if (!evidence.sessionRemoved) throw new Error('owned session deletion unverified');
        await serviceApi(cwd, 'DELETE', `/api/debug/location?location[directory]=${encodeURIComponent(cwd)}`);
        const remaining = await serviceApi(cwd, 'GET', '/api/debug/location');
        evidence.locationEvicted = Array.isArray(remaining) && !remaining.some(entry => path.resolve(entry.directory).toLowerCase() === path.resolve(cwd).toLowerCase());
        const afterService = await serviceApi(cwd, 'GET', '/api/info');
        evidence.serviceIdentityUnchanged = afterService.pid === serviceIdentity.pid && afterService.version === serviceIdentity.version;
      }
    } catch { evidence.error = 'owned service session cleanup failed'; }
    finally { if (state) evidence.cleanup = await closePrivate(state); }
  }
  return evidence;
}

module.exports = { probeServiceReport, SERVICE_PERMISSIONS };
