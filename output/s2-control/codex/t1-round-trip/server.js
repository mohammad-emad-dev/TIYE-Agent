'use strict';
// Bounded stdio MCP fixture for the S2 Codex cohort. One process per member;
// the member identity and the append-only call log come from the environment.
// No network, no model call, no product effect: every call is acknowledged and
// recorded, and nothing is forwarded to the team engine.
const fs = require('node:fs');
const readline = require('node:readline');

const member = process.env.TIYE_MEMBER || '';
const logPath = process.env.TIYE_CALL_LOG || '';
if (!/^[a-z][a-z0-9-]{0,31}$/.test(member)) {
  process.stderr.write('TIYE_MEMBER must be a bounded member id\n');
  process.exit(2);
}
if (!logPath) {
  process.stderr.write('TIYE_CALL_LOG is required\n');
  process.exit(2);
}

function record(entry) {
  fs.appendFileSync(logPath, JSON.stringify({
    member,
    at: new Date().toISOString(),
    ...entry,
  }) + '\n');
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

const tools = [
  {
    name: 'report_result',
    description: 'Report the completed task result to the Leader.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['done', 'blocked', 'failed'] },
        summary: { type: 'string', minLength: 1, maxLength: 1000 },
      },
      required: ['status', 'summary'],
    },
  },
  {
    name: 'ask_leader',
    description: 'Ask the Leader one bounded clarification question.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        question: { type: 'string', minLength: 1, maxLength: 1000 },
      },
      required: ['question'],
    },
  },
  {
    name: 'delegate_task',
    description: 'Ask the Leader to delegate a bounded task to another member.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        member: { type: 'string', minLength: 1, maxLength: 64 },
        task: { type: 'string', minLength: 1, maxLength: 1000 },
      },
      required: ['member', 'task'],
    },
  },
];

function textResult(text) {
  return { content: [{ type: 'text', text }], isError: false };
}

function handleToolCall(id, params) {
  const name = params && typeof params.name === 'string' ? params.name : '';
  const args = params && typeof params.arguments === 'object' && params.arguments !== null
    ? params.arguments
    : {};
  if (!['report_result', 'ask_leader', 'delegate_task'].includes(name)) {
    record({ event: 'tool-error', name, reason: 'unknown-tool' });
    return send({
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: 'unknown tool' }], isError: true },
    });
  }
  record({ event: 'tool-call', name, arguments: args });
  if (name === 'report_result') {
    const okStatus = ['done', 'blocked', 'failed'].includes(args.status);
    const okSummary = typeof args.summary === 'string' && args.summary.length > 0 && args.summary.length <= 1000;
    if (!okStatus || !okSummary) {
      record({ event: 'tool-error', name, reason: 'invalid-arguments' });
      return send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: 'invalid report_result arguments' }], isError: true },
      });
    }
    return send({
      jsonrpc: '2.0',
      id,
      result: textResult(`report_result accepted for ${member}: ${args.status}`),
    });
  }
  if (name === 'ask_leader') {
    if (typeof args.question !== 'string' || args.question.length === 0 || args.question.length > 1000) {
      record({ event: 'tool-error', name, reason: 'invalid-arguments' });
      return send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: 'invalid ask_leader arguments' }], isError: true },
      });
    }
    return send({
      jsonrpc: '2.0',
      id,
      result: textResult(`question recorded for ${member}; no engine answer in this fixture`),
    });
  }
  record({ event: 'delegate-ack', name });
  return send({
    jsonrpc: '2.0',
    id,
    result: textResult(`delegation recorded for ${member}; no engine effect in this fixture`),
  });
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stderr.write('invalid JSON-RPC line\n');
    return;
  }
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params && typeof message.params.protocolVersion === 'string'
          ? message.params.protocolVersion
          : '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'tiye-team-tools', version: '0.1.0-codex-fixture' },
      },
    });
    return;
  }
  if (message.method === 'notifications/initialized') return;
  if (message.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: message.id, result: { tools } });
    return;
  }
  if (message.method === 'tools/call') {
    handleToolCall(message.id, message.params);
    return;
  }
  if (message.method === 'ping') {
    send({ jsonrpc: '2.0', id: message.id, result: {} });
    return;
  }
  if (message.id !== undefined) {
    send({ jsonrpc: '2.0', id: message.id, result: {} });
  }
});
input.on('close', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
