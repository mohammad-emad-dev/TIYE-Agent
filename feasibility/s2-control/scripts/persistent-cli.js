'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const CONTROLLER = path.resolve(__dirname, '../../s1-terminal/scripts/job-probe-controller.ps1');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('private CLI lifecycle deadline exceeded');
    await delay(100);
  }
}

function nativeExecutable() {
  if (process.platform !== 'win32') throw new Error('persistent fixture currently requires Windows');
  for (const directory of process.env.PATH.split(path.delimiter)) {
    const executable = path.join(directory, 'node_modules/@opencode/cli/bin/opencode.exe');
    if (fs.existsSync(path.join(directory, 'opencode.cmd')) && fs.existsSync(executable)) return executable;
  }
  throw new Error('installed OpenCode native executable not resolved beside npm shim');
}

async function processInventory() {
  const command = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,@{n="Created";e={$_.CreationDate.ToUniversalTime().ToString("o")}} | ConvertTo-Json -Compress';
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true });
  let output = '';
  let spawnError = null;
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.resume();
  child.on('error', (error) => { spawnError = error; });
  try {
    await waitUntil(() => spawnError || child.exitCode !== null, 8000);
    if (spawnError || child.exitCode !== 0) throw new Error('private CLI process inventory unavailable');
    return JSON.parse(output);
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

function ownedIdentities(inventory, rootPid) {
  const owned = new Set([rootPid]);
  for (let previous = -1; previous !== owned.size;) {
    previous = owned.size;
    for (const identity of inventory) {
      if (owned.has(identity.ParentProcessId)) owned.add(identity.ProcessId);
    }
  }
  return inventory.filter((identity) => owned.has(identity.ProcessId));
}

function startPrivate(cwd, password) {
  const env = { ...process.env, OPENCODE_PASSWORD: password };
  delete env.OPENCODE_CONFIG;
  delete env.OPENCODE_CONFIG_CONTENT;
  const child = spawn(nativeExecutable(), ['serve', '--stdio', '--hostname', '127.0.0.1', '--port', '0'], {
    cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const state = { child, url: null, error: null };
  child.stdin.on('error', () => { state.error = 'private CLI input pipe closed'; });
  let output = '';
  child.on('error', () => { state.error = 'private CLI spawn failed'; });
  child.stderr.on('data', () => {}); // Never persist startup output: it may contain credentials.
  child.stdout.on('data', (chunk) => {
    output = (output + chunk).slice(-16000);
    for (const line of output.split('\n')) {
      try { state.url = new URL(JSON.parse(line).url); } catch { /* incomplete/non-handshake line */ }
    }
  });
  return state;
}

async function attachJob(state) {
  const root = (await processInventory()).find((identity) => identity.ProcessId === state.child.pid);
  if (!root) throw new Error('private CLI creation identity unavailable');
  state.controller = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', CONTROLLER,
    '-ChildPid', String(root.ProcessId), '-ChildCreationTime', root.Created, '-HoldUntilStdinClose',
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  let failed = false;
  state.controller.stdout.on('data', (chunk) => { output += chunk; });
  state.controller.stderr.on('data', () => { failed = true; });
  state.controller.on('error', () => { failed = true; });
  state.controller.stdin.on('error', () => { failed = true; });
  await waitUntil(() => failed || output.includes(`[job-controller] READY childPid=${root.ProcessId} `), 12000);
  if (failed || !output.includes('read-back flags=0x2000') || !output.includes(`IsProcessInJob(pid=${root.ProcessId})=true`)) {
    throw new Error('private CLI Job Object assignment unverified');
  }
  state.jobVerified = true;
}

async function apiRequest(state, password, pathname) {
  const url = new URL(pathname, state.url);
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`private CLI API status ${response.status}`);
  return response.json();
}

async function pollCatalog(state, password, serverKey) {
  const polls = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await apiRequest(state, password, '/api/mcp');
    if (!Array.isArray(response.data)) throw new Error('private CLI MCP response schema unexpected');
    const server = response.data.find((entry) => entry.name === serverKey);
    const connection = server?.status?.status || 'absent';
    polls.push({ attempt, elapsedMs: Date.now() - state.startedAt, connection });
    if (connection === 'connected') break;
    await delay(500);
  }
  return polls;
}

async function closePrivate(state) {
  let captured = null;
  let inventoryFailed = false;
  try {
    captured = state.captured || ownedIdentities(await processInventory(), state.child.pid);
  } catch {
    inventoryFailed = true;
  } finally {
    // Release containment even when the inventory itself fails.
    state.child.stdin.end();
    if (state.controller) state.controller.stdin.end();
  }
  try {
    await waitUntil(() => state.child.exitCode !== null || state.child.signalCode !== null, 5000);
    if (state.controller) await waitUntil(() => state.controller.exitCode !== null || state.controller.signalCode !== null, 5000);
  } catch (error) {
    state.child.kill();
    if (state.controller) state.controller.kill();
    throw error;
  }
  if (inventoryFailed) throw new Error('private CLI pre-close process inventory unavailable');
  const remaining = await processInventory();
  const survivors = captured.filter((identity) => remaining.some((current) =>
    current.ProcessId === identity.ProcessId && current.Created === identity.Created));
  if (survivors.length) throw new Error('private CLI captured process tree still alive');
  return { verified: true, capturedProcesses: captured.length, jobVerified: state.jobVerified === true };
}

async function probePersistent({ cwd, serverKey }) {
  const password = crypto.randomBytes(32).toString('hex');
  const state = startPrivate(cwd, password);
  state.startedAt = Date.now();
  const evidence = { polls: [], connected: false, exactToolsProven: false };
  try {
    await attachJob(state);
    await waitUntil(() => state.error || state.url, 8000);
    if (state.error) throw new Error(state.error);
    if (state.url.hostname !== '127.0.0.1' || state.url.protocol !== 'http:') throw new Error('private CLI endpoint not loopback');
    evidence.polls = await pollCatalog(state, password, serverKey);
    evidence.connected = evidence.polls.at(-1)?.connection === 'connected';
  } catch (error) {
    // Fixed errors only; never copy startup output, response bodies, or credentials.
    evidence.error = /private CLI|persistent fixture|installed OpenCode/.test(error.message)
      ? error.message : 'private CLI probe failed';
  } finally {
    evidence.cleanup = await closePrivate(state);
  }
  return evidence;
}

async function probeStandaloneReport({ cwd, summary, member }) {
  const model = 'opencode/muse-spark-1.3-contributor-free#xhigh';
  const env = { ...process.env };
  delete env.OPENCODE_CONFIG;
  delete env.OPENCODE_CONFIG_CONTENT;
  const child = spawn(nativeExecutable(), ['run', '--standalone', '--model', model, '--agent', 'build', '--format', 'json'], {
    cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const state = { child };
  let output = '';
  let truncated = false;
  child.stdout.on('data', (chunk) => {
    const next = output + chunk;
    truncated ||= next.length > 64000;
    output = next.slice(-64000);
  });
  child.stderr.resume();
  child.on('error', () => { state.error = true; });
  child.on('close', () => { state.closed = true; });
  child.stdin.on('error', () => { state.error = true; });
  const evidence = { model, completedAck: false };
  try {
    await attachJob(state);
    state.captured = ownedIdentities(await processInventory(), child.pid);
    const startedAt = Date.now();
    child.stdin.end(`This is a feasibility acknowledgment task. Call tiye-team-tools_report_result exactly once with summary ${JSON.stringify(summary)} and status "done". Do not use other tools. After it returns, finish briefly. Do not simulate the call in prose.`);
    await waitUntil(() => state.error || state.closed, 120000);
    evidence.elapsedMs = Date.now() - startedAt;
    evidence.cliExitCode = child.exitCode;
    Object.assign(evidence, summarizeToolEvents({ output, summary, member }));
    evidence.outputTruncated = truncated;
    evidence.cliSpawnError = state.error === true;
  } catch {
    evidence.error = 'standalone CLI lifecycle failed';
  } finally {
    evidence.cleanup = await closePrivate(state);
  }
  return evidence;
}

function summarizeToolEvents({ output, summary, member }) {
  let malformed = false;
  const events = output.split('\n').filter((line) => line.trim()).flatMap((line) => {
    try { const event = JSON.parse(line); if (!event || typeof event !== 'object') throw new Error(); return [event]; }
    catch { malformed = true; return []; }
  });
  const failure = events.find((event) => event.type === 'error')?.error;
  const tools = events.filter((event) => event.type === 'tool_use' && event.part?.type === 'tool').map((event) => event.part);
  const reports = tools.filter((part) => part.tool === 'tiye-team-tools_report_result' && part.state?.status === 'completed');
  return {
    malformedEvents: malformed,
    ...(failure ? { failure: { category: failure.type === 'provider.auth' ? 'provider.auth' : 'other', httpStatus: Number.isInteger(failure.status) ? failure.status : null } } : {}),
    completedReports: reports.length,
    otherToolCalls: tools.filter((part) => part.tool !== 'tiye-team-tools_report_result').length,
    completedAck: !malformed && reports.length === 1 && reports[0].state.input?.summary === summary && reports[0].state.input?.status === 'done'
      && reports[0].state.output === `ack report_result for ${member} (feasibility only, no engine effect)`,
  };
}

module.exports = { probePersistent, probeStandaloneReport, summarizeToolEvents, nativeExecutable, attachJob, closePrivate, waitUntil, processInventory, ownedIdentities };
