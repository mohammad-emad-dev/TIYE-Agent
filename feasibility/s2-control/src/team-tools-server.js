'use strict';
// TIYE S2.1 minimal team-tools MCP server (feasibility only).
//
// Stateful Streamable HTTP server built on the official
// @modelcontextprotocol/sdk (1.32.1) transport. Exposes exactly the three
// Architecture 4.2 tools: report_result, ask_leader, delegate_task.
// No engine, no model, no side effects beyond a bounded log.
//
// Auth: two per-run bearer tokens (member-a, member-b) supplied via env
//   TIYE_S2_TOKENS_JSON='{"member-a":"<token>","member-b":"<token>"}'.
// Every /mcp request requires Authorization: Bearer <token> before any SDK
// processing; unknown/missing tokens get HTTP 401 and never reach the SDK.
// Each SDK session is bound at creation to the member whose token opened
// it; a session ID presented with another member's token gets HTTP 401,
// an unknown session ID gets HTTP 404 (per the MCP Streamable HTTP rules).
//
// Logging (privacy): only tool name + member identity + bounded metadata
// (session open/close, validation boolean, top-level argument count).
// NEVER logs tokens, Authorization values, session IDs, or argument
// contents, names, or values.
//
// Transport: SDK StreamableHTTPServerTransport for POST, GET (SSE), and
// DELETE on <url>/mcp. Binds only 127.0.0.1 on an ephemeral port chosen by
// the OS (listen(0, '127.0.0.1')).
//
// Tool handlers return a feasibility acknowledgment only ("no engine
// effect"). Argument schemas are enforced by the SDK (zod); calls that
// fail validation never reach the handlers.

const http = require('node:http');
const crypto = require('node:crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

const SERVER_NAME = 'tiye-team-tools';
const SERVER_VERSION = '0.1.0';
const MAX_STR_LEN = 2000;
const MAX_SESSIONS = 16;

function loadTokens() {
  const raw = process.env.TIYE_S2_TOKENS_JSON || '';
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object') return new Map();
  const map = new Map(); // token -> member
  for (const [member, token] of Object.entries(parsed)) {
    if ((member === 'member-a' || member === 'member-b') && typeof token === 'string' && token.length >= 16) {
      map.set(token, member);
    }
  }
  return map;
}

const TOKENS = loadTokens();

function log(msg) {
  // Single-line, bounded. Callers must never pass tokens, session IDs,
  // or caller-supplied argument contents, names, or values.
  const line = String(msg).slice(0, 500);
  process.stdout.write(`[mcp] ${line}\n`);
}

function memberForRequest(req) {
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(auth);
  if (!m) return null;
  // Strict equality; tokens are per-run random, compared in memory.
  return TOKENS.get(m[1]) || null;
}

function sessionIdOf(req) {
  const v = req.headers['mcp-session-id'];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// sessionId -> { transport, member }. Ownership is fixed at creation.
const sessions = new Map();

function createMemberServer(member) {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const ack = (tool) => async (args) => {
    const count = args && typeof args === 'object' && !Array.isArray(args) ? Object.keys(args).length : 0;
    log(`tool-call member=${member} tool=${tool} valid=true argumentCount=${count}`);
    return { content: [{ type: 'text', text: `ack ${tool} for ${member} (feasibility only, no engine effect)` }] };
  };
  server.tool(
    'report_result',
    'Feasibility ack only: member reports a task summary and status. No engine effect.',
    { summary: z.string().min(1).max(MAX_STR_LEN), status: z.enum(['done', 'failed']) },
    ack('report_result')
  );
  server.tool(
    'ask_leader',
    'Feasibility ack only: member asks the leader a question. No engine effect.',
    { question: z.string().min(1).max(MAX_STR_LEN) },
    ack('ask_leader')
  );
  server.tool(
    'delegate_task',
    'Feasibility ack only: leader delegates instructions to members. No engine effect.',
    {
      instructions: z.string().min(1).max(MAX_STR_LEN),
      members: z.array(z.string().max(64)).max(8).optional(),
      files: z.array(z.string().max(256)).max(16).optional(),
    },
    ack('delegate_task')
  );
  return server;
}

function unauthorized(res) {
  // Never log the presented credential.
  log('auth-rejected method-for-path=/mcp');
  res.writeHead(401, { 'www-authenticate': 'Bearer' });
  res.end();
}

const httpServer = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (url.pathname !== '/mcp') {
      res.writeHead(404);
      res.end();
      return;
    }
    const member = memberForRequest(req);
    if (!member) {
      unauthorized(res);
      return;
    }
    if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
      res.writeHead(405, { allow: 'POST, GET, DELETE' });
      res.end();
      return;
    }
    const sessionId = sessionIdOf(req);
    if (sessionId !== null) {
      const entry = sessions.get(sessionId);
      if (!entry) {
        log(`session-unknown member=${member} method=${req.method}`);
        res.writeHead(404);
        res.end();
        return;
      }
      if (entry.member !== member) {
        log(`session-ownership-rejected method=${req.method} owner=${entry.member} caller=${member}`);
        res.writeHead(401, { 'www-authenticate': 'Bearer' });
        res.end();
        return;
      }
      await entry.transport.handleRequest(req, res);
      return;
    }
    // No session ID: GET/DELETE outside a session are client errors;
    // POST without one must be an initialize (the SDK enforces this).
    if (req.method !== 'POST') {
      log(`session-missing member=${member} method=${req.method}`);
      res.writeHead(400);
      res.end();
      return;
    }
    if (sessions.size >= MAX_SESSIONS) {
      log(`session-limit member=${member} sessions=${sessions.size}`);
      res.writeHead(503);
      res.end();
      return;
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, member });
        log(`session-open member=${member} sessions=${sessions.size}`);
      },
      onsessionclosed: (id) => {
        const entry = sessions.get(id);
        sessions.delete(id);
        log(`session-close member=${entry ? entry.member : member} sessions=${sessions.size}`);
      },
    });
    const server = createMemberServer(member);
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    try {
      if (!res.headersSent) {
        res.writeHead(500);
        res.end();
      }
    } catch {
      /* already closed */
    }
  }
});

const requestedPort = Number(process.env.TIYE_S2_PORT || '0') || 0;
httpServer.listen(requestedPort, '127.0.0.1', () => {
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : requestedPort;
  // Do not print tokens. Port + bind address are safe.
  process.stdout.write(`[mcp] ready host=127.0.0.1 port=${port} tools=report_result,ask_leader,delegate_task\n`);
});

process.on('SIGTERM', async () => {
  try {
    await Promise.all(
      [...sessions.values()].map((entry) => entry.transport.close().catch(() => {}))
    );
  } catch {
    /* best effort */
  }
  sessions.clear();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
});
