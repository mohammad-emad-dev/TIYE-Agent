'use strict';
// TIYE S2.1 probe runner (feasibility slice, no model request).
//
// Generates per-run tokens, starts src/team-tools-server.js (official
// @modelcontextprotocol/sdk, stateful Streamable HTTP) on 127.0.0.1, runs
// installed `opencode mcp list` with disposable config for two member
// tokens (no model request), then proves auth + tool listing at the MCP
// protocol level with the SDK client (initialize + tools/list, one bounded
// tools/call ack each, session DELETE, cross-member session 401,
// bad/missing-token 401). Records whether global or project config was
// touched. Bounded timeouts, controlled teardown.
//
// Exit: 0 PASS (CLI discovery + protocol prove 3 tools for both members),
// 2 PARTIAL (protocol proves tools but CLI exposure unproven), 1 FAIL
// (safety/auth/timeout; never invent pass evidence). No tokens printed.

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const SERVER_FILE = path.resolve(__dirname, '..', 'src', 'team-tools-server.js');
const EVIDENCE_DIR = path.resolve(__dirname, '..', 'evidence');
const SERVER_START_MS = 8000;
const CLI_TIMEOUT_MS = 25000;
const SDK_STEP_MS = 15000;
const HTTP_TIMEOUT_MS = 6000;
const NETSTAT_TIMEOUT_MS = 5000;
const EXPECTED_TOOLS = ['report_result', 'ask_leader', 'delegate_task'];
const SERVER_KEY = 'tiye-team-tools';
let activeCleanup = null;

function log(msg) {
  console.log(`[s2-probe] ${msg}`);
}
function fail(msg) {
  console.error(`[s2-probe] FAIL: ${msg}`);
}
function warn(msg) {
  console.error(`[s2-probe] note: ${msg}`);
}

function redact(text, secrets) {
  let out = String(text);
  for (const s of secrets) {
    if (s && s.length >= 8) out = out.split(s).join('[REDACTED-TOKEN]');
  }
  // Generic bearer fallback (never log credential values).
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, 'Bearer [REDACTED]');
  return out;
}

function snapshotConfigs() {
  const candidates = [
    path.join(os.homedir(), '.config', 'opencode', 'opencode.json'),
    path.resolve('D:/TIYE Agent/opencode.json'),
    path.resolve(__dirname, '..', 'opencode.json'),
  ];
  const snap = {};
  for (const p of candidates) {
    try {
      const st = fs.statSync(p);
      snap[p] = { exists: true, size: st.size, mtimeMs: st.mtimeMs };
    } catch {
      snap[p] = { exists: false };
    }
  }
  // Also record env pointers (do not resolve content).
  snap.__env = {
    hasOPENCODE_CONFIG: Boolean(process.env.OPENCODE_CONFIG),
    hasOPENCODE_CONFIG_CONTENT: Boolean(process.env.OPENCODE_CONFIG_CONTENT),
  };
  return snap;
}

function configsTouched(before, after) {
  for (const k of Object.keys(before)) {
    if (k === '__env') continue;
    const a = before[k];
    const b = after[k];
    if (!a || !b) continue;
    if (a.exists !== b.exists) return { touched: true, path: k, reason: 'existence-changed' };
    if (a.exists && (a.size !== b.size || a.mtimeMs !== b.mtimeMs)) {
      return { touched: true, path: k, reason: 'size-or-mtime-changed' };
    }
  }
  return { touched: false };
}

function opencodeBin() {
  return process.platform === 'win32' ? 'opencode.cmd' : 'opencode';
}

function runOpencode(args, env, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const bin = opencodeBin();
    let child;
    try {
      child = spawn(bin, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        // .cmd shims need a shell on Windows; plain spawn gives EINVAL.
        shell: process.platform === 'win32',
      });
    } catch (e) {
      resolve({ timedOut: false, code: 2, out: '', err: `spawn-throw: ${e.message}` });
      return;
    }
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve({ timedOut: true, code: 2, out, err });
    }, timeoutMs || CLI_TIMEOUT_MS);
    child.stdout?.on('data', (d) => {
      out += d.toString('utf8');
    });
    child.stderr?.on('data', (d) => {
      err += d.toString('utf8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ timedOut: false, code: 2, out, err: err + `\nspawn-error: ${e.message}` });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ timedOut: false, code: code ?? 2, out, err });
    });
  });
}

function runCliMcpList(env, cwd) {
  return runOpencode(['mcp', 'list'], env, cwd, CLI_TIMEOUT_MS);
}

// Bounded wrapper: resolves { timedOut } instead of hanging the probe.
function bounded(ms, fn) {
  return Promise.race([
    Promise.resolve()
      .then(fn)
      .then((value) => ({ timedOut: false, value }))
      .catch((error) => ({ timedOut: false, error: String((error && error.message) || error).slice(0, 200) })),
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), ms)),
  ]);
}

function rawRequest(port, { method, token, sessionId, body }) {
  return new Promise((resolve) => {
    const payload = body !== undefined ? JSON.stringify(body) : '';
    const headers = { accept: 'application/json, text/event-stream' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    if (token) headers.authorization = `Bearer ${token}`;
    if (sessionId) headers['mcp-session-id'] = sessionId;
    const req = http.request(
      { host: '127.0.0.1', port, path: '/mcp', method, headers, timeout: HTTP_TIMEOUT_MS },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode || 0 }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('http-timeout')));
    req.on('error', () => resolve({ status: -1 }));
    if (body !== undefined) req.write(payload);
    req.end();
  });
}

function checkNetstat(port) {
  // Best-effort loopback-bind evidence: expect 127.0.0.1:port LISTENING,
  // and no 0.0.0.0:port wildcard for the same port.
  return new Promise((resolve) => {
    const child = spawn('netstat', ['-ano'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve({ ok: false, note: 'netstat-timeout' });
    }, NETSTAT_TIMEOUT_MS);
    child.stdout?.on('data', (d) => {
      out += d.toString('utf8');
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, note: 'netstat-unavailable' });
    });
    child.on('exit', () => {
      clearTimeout(timer);
      const lines = out.split(/\r?\n/).filter((l) => `:${port}`.length > 0 && l.includes(`:${port}`));
      const loopback = lines.some((l) => l.includes(`127.0.0.1:${port}`));
      const wildcard = lines.some((l) => l.includes(`0.0.0.0:${port}`));
      resolve({ ok: true, loopback, wildcard, lines: lines.slice(0, 6) });
    });
  });
}

function countSessionOpens(serverLog, member) {
  const re = new RegExp(`session-open member=${member}`, 'g');
  return (String(serverLog).match(re) || []).length;
}

async function main() {
  const secrets = [];
  const evidence = {
    scope: 'S2.1 OpenCode MCP attachment without a model request (feasibility slice)',
    versions: {},
    bind: {},
    cli: {},
    protocol: {},
    configTouched: {},
    logs: {},
    result: 'unknown',
  };
  try {
    evidence.versions.node = process.version;
    evidence.versions.sdk = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json'), 'utf8')
    ).version;
  } catch {}
  // Installed CLI version (no model request; --version only).
  try {
    const v = await new Promise((resolve) => {
      let c;
      try {
        c = spawn(opencodeBin(), ['--version'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          shell: process.platform === 'win32',
        });
      } catch {
        resolve('spawn-throw');
        return;
      }
      let o = '';
      c.stdout?.on('data', (d) => {
        o += d.toString('utf8');
      });
      const t = setTimeout(() => {
        try {
          c.kill();
        } catch {}
        resolve('timeout');
      }, 10000);
      c.on('exit', () => {
        clearTimeout(t);
        resolve(o.trim().slice(0, 64));
      });
      c.on('error', () => {
        clearTimeout(t);
        resolve('spawn-error');
      });
    });
    evidence.versions.opencode = v;
    log(`versions: node=${evidence.versions.node} sdk=${evidence.versions.sdk} opencode=${v}`);
  } catch {
    evidence.versions.opencode = 'unknown';
  }

  if (!fs.existsSync(SERVER_FILE)) {
    fail(`server file missing: ${SERVER_FILE}`);
    process.exitCode = 1;
    return;
  }

  const beforeSnap = snapshotConfigs();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s2-'));
  const emptyCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tiye-s2-cwd-'));
  log(`tmp: disposable dir created (path withheld from logs for hygiene; len=${tmpRoot.length})`);

  // Per-run disposable tokens (never printed, never committed).
  const tokenA = crypto.randomBytes(32).toString('hex');
  const tokenB = crypto.randomBytes(32).toString('hex');
  const badToken = crypto.randomBytes(32).toString('hex');
  secrets.push(tokenA, tokenB, badToken);
  log(`tokens: generated 2 member tokens + 1 bad token (values withheld; lens=${tokenA.length},${tokenB.length})`);

  // Start loopback server.
  const serverEnv = {
    ...process.env,
    TIYE_S2_TOKENS_JSON: JSON.stringify({ 'member-a': tokenA, 'member-b': tokenB }),
    TIYE_S2_PORT: '0',
  };
  const serverChild = spawn(process.execPath, [SERVER_FILE], {
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  activeCleanup = () => teardown(serverChild, tmpRoot, emptyCwd);
  let serverOut = '';
  let serverErr = '';
  serverChild.stdout?.on('data', (d) => {
    serverOut += d.toString('utf8');
  });
  serverChild.stderr?.on('data', (d) => {
    serverErr += d.toString('utf8');
  });
  serverChild.on('error', (e) => {
    serverErr += `\nserver-spawn-error: ${e.message}`;
  });

  const port = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      clearInterval(poll);
      resolve(-1);
    }, SERVER_START_MS);
    const poll = setInterval(() => {
      const m = /port=(\d+)/.exec(serverOut);
      if (m) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve(Number(m[1]));
      }
    }, 50);
  });
  if (!port || port <= 0) {
    fail(`server did not report ready within ${SERVER_START_MS}ms (spawn failed; no pass). Raw (redacted): ${redact(serverOut + serverErr, secrets).slice(0, 800)}`);
    await teardown(serverChild, tmpRoot, emptyCwd);
    evidence.result = 'fail';
    writeEvidence(evidence, secrets);
    process.exitCode = 1;
    return;
  }
  log(`server: ready on 127.0.0.1:${port} (loopback-only by construction; verifying)`);
  evidence.bind.port = port;
  evidence.bind.readyLine = (serverOut.split(/\r?\n/).find((l) => l.includes('ready')) || '').slice(0, 200);

  // Loopback-bind check via netstat (best-effort, Windows).
  if (process.platform === 'win32') {
    const ns = await checkNetstat(port);
    evidence.bind.netstat = ns.ok ? { loopback: ns.loopback, wildcard: ns.wildcard, lines: ns.lines } : { note: ns.note };
    log(`bind-check: netstat loopback=${ns.loopback} wildcard=${ns.wildcard}`);
    if (ns.ok && !ns.loopback) warn('netstat did not show 127.0.0.1:port; bind claim rests on listen(127.0.0.1) + ready line only');
    if (ns.ok && ns.wildcard) {
      fail('server appears on 0.0.0.0 wildcard (not loopback-only)');
      await teardown(serverChild, tmpRoot, emptyCwd);
      evidence.result = 'fail';
      writeEvidence(evidence, secrets);
      process.exitCode = 1;
      return;
    }
  } else {
    evidence.bind.netstat = { note: 'non-windows, code binds 127.0.0.1 (unverified by netstat)' };
  }

  const buildConfig = (token) => ({
    mcp: {
      [SERVER_KEY]: {
        type: 'remote',
        url: `http://127.0.0.1:${port}/mcp`,
        enabled: true,
        oauth: false,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  });

  // CLI discovery for both members (no model request). `mcp list` shows the
  // installed CLI's server-status view; `debug config` runs in-process and
  // shows whether disposable config plumbing loaded; `api --standalone`
  // queries a private instance (not the background service), which
  // separates background-service caching from config/transport causes.
  const cliResults = {};
  let configMethod = 'OPENCODE_CONFIG_CONTENT';
  const baseCliEnv = { ...process.env };
  for (const [member, token] of [['member-a', tokenA], ['member-b', tokenB]]) {
    const cfg = JSON.stringify(buildConfig(token));
    const env = { ...baseCliEnv, OPENCODE_CONFIG_CONTENT: cfg };
    delete env.OPENCODE_CONFIG;
    const r = await runCliMcpList(env, emptyCwd);
    const redOut = redact(`${r.out}\n${r.err}`, secrets);
    const listsServer = redOut.toLowerCase().includes(SERVER_KEY.toLowerCase());
    const noServers = /no mcp servers configured/i.test(redOut);
    cliResults[member] = {
      method: 'OPENCODE_CONFIG_CONTENT',
      exit: r.code,
      timedOut: r.timedOut,
      listsServer,
      noServers,
      outputHead: redOut.slice(0, 1200),
    };
    log(`cli: ${member} via CONTENT exit=${r.code} listsServer=${listsServer} noServers=${noServers}`);
  }

  // If inline config was ignored, try OPENCODE_CONFIG file fallback once per member.
  const contentIgnored = Object.values(cliResults).every((v) => v.noServers);
  if (contentIgnored) {
    warn('OPENCODE_CONFIG_CONTENT appears ignored by this CLI build; trying OPENCODE_CONFIG file fallback (disposable temp file)');
    configMethod = 'OPENCODE_CONFIG(file-fallback)';
    for (const [member, token] of [['member-a', tokenA], ['member-b', tokenB]]) {
      const cfgPath = path.join(tmpRoot, `opencode-${member}.json`);
      fs.writeFileSync(cfgPath, JSON.stringify(buildConfig(token), null, 2), 'utf8');
      const env = { ...baseCliEnv, OPENCODE_CONFIG: cfgPath };
      delete env.OPENCODE_CONFIG_CONTENT;
      const r = await runCliMcpList(env, emptyCwd);
      const redOut = redact(`${r.out}\n${r.err}`, secrets);
      cliResults[member] = {
        method: 'OPENCODE_CONFIG',
        exit: r.code,
        timedOut: r.timedOut,
        listsServer: redOut.toLowerCase().includes(SERVER_KEY.toLowerCase()),
        noServers: /no mcp servers configured/i.test(redOut),
        outputHead: redOut.slice(0, 1200),
      };
      log(`cli-fallback: ${member} via FILE exit=${r.code} listsServer=${cliResults[member].listsServer}`);
    }
  }
  const listContact = {
    'member-a': countSessionOpens(serverOut, 'member-a'),
    'member-b': countSessionOpens(serverOut, 'member-b'),
  };
  log(`cli-contact: sessions opened during mcp-list phase member-a=${listContact['member-a']} member-b=${listContact['member-b']}`);

  // In-process `debug config` against a per-member project file proves
  // whether disposable config plumbing loads without a model call.
  for (const [member, token] of [['member-a', tokenA], ['member-b', tokenB]]) {
    const entry = cliResults[member];
    try {
      const memberCwd = path.join(tmpRoot, `cwd-${member}`);
      fs.mkdirSync(memberCwd, { recursive: true });
      fs.writeFileSync(path.join(memberCwd, 'opencode.json'), JSON.stringify(buildConfig(token), null, 2), 'utf8');
      const cleanEnv = { ...baseCliEnv };
      delete cleanEnv.OPENCODE_CONFIG;
      delete cleanEnv.OPENCODE_CONFIG_CONTENT;
      const dc = await runOpencode(['debug', 'config'], cleanEnv, memberCwd, CLI_TIMEOUT_MS);
      const redDc = redact(`${dc.out}\n${dc.err}`, secrets);
      entry.debugConfigShowsServer = redDc.toLowerCase().includes(SERVER_KEY.toLowerCase());
      entry.debugConfigHead = redDc.slice(0, 500);
      log(`cli-debug: ${member} debugConfigShows=${entry.debugConfigShowsServer}`);
    } catch (e) {
      entry.debugError = String(e.message || e).slice(0, 200);
    }
  }
  // Private-instance MCP state per member project (no background service).
  for (const [member] of [['member-a'], ['member-b']]) {
    const cwd = path.join(tmpRoot, `cwd-${member}`);
    const env = { ...baseCliEnv };
    delete env.OPENCODE_CONFIG;
    delete env.OPENCODE_CONFIG_CONTENT;
    const status = await runOpencode(['api', '--standalone', 'GET', '/api/mcp'], env, cwd, CLI_TIMEOUT_MS);
    const safeOutput = redact(status.out, secrets);
    let named = false;
    let connection = 'unknown';
    try {
      const data = JSON.parse(safeOutput).data;
      const entry = Array.isArray(data) ? data.find((item) => item.name === SERVER_KEY) : null;
      named = Boolean(entry);
      connection = entry?.status?.status || 'absent';
    } catch {}
    cliResults[member].standalone = { exit: status.code, named, connection, outputHead: safeOutput.slice(0, 300) };
    log(`cli-standalone: ${member} exit=${status.code} named=${named} connection=${connection}`);
  }
  const apiContact = {
    'member-a': countSessionOpens(serverOut, 'member-a') - listContact['member-a'],
    'member-b': countSessionOpens(serverOut, 'member-b') - listContact['member-b'],
  };
  log(`cli-contact: sessions opened during api phase member-a=${apiContact['member-a']} member-b=${apiContact['member-b']}`);
  try {
    const svc = await runOpencode(['service', 'status'], baseCliEnv, emptyCwd, 15000);
    evidence.cli.serviceStatus = redact(`${svc.out}\n${svc.err}`, secrets).slice(0, 300);
  } catch {
    evidence.cli.serviceStatus = 'unknown';
  }
  evidence.cli = {
    method: configMethod,
    members: cliResults,
    serviceStatus: evidence.cli.serviceStatus,
    sessionContact: { listPhase: listContact, apiPhase: apiContact },
  };
  evidence.cli.note =
    'Config files merge (global+custom/project+inline); disposable config adds on top, so total isolation from global settings is NOT claimed. sessionContact counts SDK sessions the fixture server observed per member token during each CLI phase.';

  // Protocol-level proof with the SDK client (stateful sessions, no model).
  const proto = { members: {}, badToken: {}, missingAuth: {}, badGet: {}, crossMember: {} };
  let protoOk = true;
  const memberTokens = [['member-a', tokenA], ['member-b', tokenB]];
  for (const [member, token] of memberTokens) {
    const entry = { connected: false, sessionEstablished: false, toolNames: [], hasAll: false, ackOk: false, sessionClosed: false };
    let transport = null;
    let client = null;
    try {
      transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      });
      client = new Client({ name: 'tiye-s2-probe', version: '0.1.0' }, { capabilities: {} });
      const conn = await bounded(SDK_STEP_MS, () => client.connect(transport));
      entry.connected = !conn.timedOut && !conn.error;
      entry.sessionEstablished = Boolean(transport.sessionId);
      if (entry.connected) {
        const listed = await bounded(SDK_STEP_MS, () => client.listTools());
        if (!listed.timedOut && !listed.error) {
          entry.toolNames = (listed.value.tools || []).map((t) => t.name);
          entry.hasAll = EXPECTED_TOOLS.every((t) => entry.toolNames.includes(t));
        }
        const called = await bounded(SDK_STEP_MS, () =>
          client.callTool({ name: 'report_result', arguments: { summary: 'feasibility ack probe', status: 'done' } })
        );
        if (!called.timedOut && !called.error) {
          const text = called.value?.content?.[0]?.text || '';
          entry.ackOk = text.includes('ack report_result') && text.includes(member);
        }
        // Cross-member session ownership: present this session ID with the
        // other member's token; the server must refuse before SDK handling.
        if (member === 'member-a') {
          const cross = await rawRequest(port, {
            method: 'POST',
            token: tokenB,
            sessionId: transport.sessionId,
            body: { jsonrpc: '2.0', id: 7, method: 'tools/list', params: {} },
          });
          proto.crossMember = { status: cross.status, rejected: cross.status === 401 };
          if (cross.status !== 401) protoOk = false;
        }
        const term = await bounded(SDK_STEP_MS, () => transport.terminateSession());
        entry.sessionClosed = !term.timedOut && !term.error;
      }
    } catch (e) {
      entry.error = String((e && e.message) || e).slice(0, 200);
    } finally {
      try {
        if (client) await client.close();
      } catch {}
    }
    proto.members[member] = entry;
    log(`proto: ${member} connected=${entry.connected} session=${entry.sessionEstablished} tools=[${entry.toolNames.join(',')}] ack=${entry.ackOk} closed=${entry.sessionClosed}`);
    if (!(entry.connected && entry.sessionEstablished && entry.hasAll && entry.ackOk && entry.sessionClosed)) protoOk = false;
  }
  // Bad token and missing auth must be rejected before SDK processing.
  const bad = await rawRequest(port, { method: 'POST', token: badToken, body: { jsonrpc: '2.0', id: 9, method: 'tools/list', params: {} } });
  proto.badToken = { status: bad.status, rejected: bad.status === 401 };
  log(`proto: bad-token status=${bad.status} rejected=${bad.status === 401}`);
  if (bad.status !== 401) protoOk = false;
  const missing = await rawRequest(port, { method: 'POST', body: { jsonrpc: '2.0', id: 10, method: 'tools/list', params: {} } });
  proto.missingAuth = { status: missing.status, rejected: missing.status === 401 };
  if (missing.status !== 401) protoOk = false;
  const badGet = await rawRequest(port, { method: 'GET', token: badToken });
  proto.badGet = { status: badGet.status, rejected: badGet.status === 401 };
  log(`proto: missing-auth status=${missing.status} bad-get status=${badGet.status}`);
  if (badGet.status !== 401) protoOk = false;
  evidence.protocol = proto;

  // Server-log hygiene: tool+member present; no tokens, no argument values.
  await new Promise((r) => setTimeout(r, 300));
  const serverLog = `${serverOut}`;
  const probeMarker = 'feasibility ack probe';
  const logHasTool = serverLog.includes('tool-call') && serverLog.includes('report_result');
  const logHasMembers = serverLog.includes('member-a') && serverLog.includes('member-b');
  const logLeaksToken = secrets.some((s) => s && serverLog.includes(s));
  const logLeaksContent = serverLog.includes(probeMarker);
  evidence.logs = {
    hasToolAndMembers: logHasTool && logHasMembers,
    leaksToken: logLeaksToken,
    leaksContent: logLeaksContent,
    head: redact(serverLog, secrets).slice(0, 2000),
  };
  log(`serverlog: tool+members=${logHasTool && logHasMembers} leaksToken=${logLeaksToken} leaksContent=${logLeaksContent}`);
  if (logLeaksToken || logLeaksContent) {
    fail('server log leaked credential or prompt content (privacy violation)');
    await teardown(serverChild, tmpRoot, emptyCwd);
    evidence.result = 'fail';
    writeEvidence(evidence, secrets);
    process.exitCode = 1;
    return;
  }

  const afterSnap = snapshotConfigs();
  const touch = configsTouched(beforeSnap, afterSnap);
  evidence.configTouched = { ...touch, before: beforeSnap, after: afterSnap };
  log(`config: touched=${touch.touched}${touch.touched ? ` path=${touch.path} reason=${touch.reason}` : ' (global/project unchanged by this probe)'}`);

  await teardown(serverChild, tmpRoot, emptyCwd);

  // Verdict. PASS needs the installed CLI itself to surface the server and
  // the exact tools; protocol proof alone is PARTIAL (CLI exposure unproven).
  const cliDiscovers = Object.values(cliResults).every((v) => v.exit === 0 && v.listsServer && /connected/i.test(v.outputHead) && !v.timedOut);
  const cliShowsExactTools = Object.values(cliResults).every((v) => EXPECTED_TOOLS.every((t) => v.outputHead.toLowerCase().includes(t.toLowerCase())));
  evidence.cli.discoversServer = cliDiscovers;
  evidence.cli.showsExactTools = cliShowsExactTools;
  evidence.cli.debugConfigShowsServer = Object.values(cliResults).every((v) => v.debugConfigShowsServer === true);

  if (!protoOk || touch.touched) {
    fail(`protocol ok=${protoOk} config untouched=${!touch.touched}; see evidence`);
    evidence.result = 'fail';
    writeEvidence(evidence, secrets);
    process.exitCode = 1;
    return;
  }
  if (cliDiscovers && cliShowsExactTools) {
    log('PASS: CLI discovery lists server and exact tools for both members; protocol confirms 3 tools + auth + ack; configs untouched.');
    evidence.result = 'pass';
    writeEvidence(evidence, secrets);
    process.exitCode = 0;
    return;
  }
  // Honest partial: protocol proves tools; CLI exposure stays UNPROVEN.
  warn(
    `PARTIAL: SDK protocol proves 3 tools for both members + session ownership + bad-token 401 + ack attribution, but the installed CLI does not surface the server (discoversServer=${cliDiscovers}, showsExactTools=${cliShowsExactTools}). CLI tool exposure UNPROVEN; no model call made.`
  );
  evidence.result = 'partial';
  evidence.caveat =
    'CLI tool exposure unproven: neither `opencode mcp list` nor the private `api --standalone` instance surface the server, while exact tools are proven at the MCP protocol level (SDK stateful sessions). See sessionContact for whether each CLI phase dialed the fixture. No S2.2 model round trip claimed.';
  writeEvidence(evidence, secrets);
  process.exitCode = 2;
}

async function teardown(serverChild, tmpRoot, emptyCwd) {
  if (serverChild.exitCode === null && serverChild.signalCode === null) serverChild.kill('SIGTERM');
  if (serverChild.exitCode === null && serverChild.signalCode === null) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 2000);
      serverChild.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (serverChild.exitCode === null && serverChild.signalCode === null) {
    throw new Error('server process exit unproven after bounded teardown');
  }
  removeDisposableDir(tmpRoot, 'tiye-s2-');
  removeDisposableDir(emptyCwd, 'tiye-s2-cwd-');
  log('teardown: server stopped, disposable dirs removed (bounded)');
}

function removeDisposableDir(dir, expectedPrefix) {
  if (!fs.existsSync(dir)) return;
  const tempRoot = fs.realpathSync(os.tmpdir()).toLowerCase();
  const resolved = fs.realpathSync(dir).toLowerCase();
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith(expectedPrefix)) {
    throw new Error('refusing recursive delete outside owned temporary directory');
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeEvidence(evidence, secrets) {
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const safe = JSON.parse(redact(JSON.stringify(evidence), secrets));
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'latest.json'), JSON.stringify(safe, null, 2), 'utf8');
    log('evidence: wrote evidence/latest.json (redacted, no tokens)');
  } catch (e) {
    warn(`evidence write failed: ${e.message}`);
  }
}

main().catch(async (e) => {
  fail(`harness error: ${e && e.message ? e.message : e} (no pass)`);
  if (activeCleanup) {
    try {
      await activeCleanup();
    } catch (cleanupError) {
      fail(`cleanup unproven: ${cleanupError.message}`);
    }
  }
  process.exitCode = 1;
});
