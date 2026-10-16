'use strict';
// One bounded pipe request to the parent's mock server; credentials stay in memory.
const http = require('node:http');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (Buffer.byteLength(input) > 65536) process.exit(2);
});
process.stdin.on('end', () => {
  try {
    const message = JSON.parse(input);
    if (!Number.isInteger(message.port) || message.port < 1 || message.port > 65535 || message.port === 40900) process.exit(2);
    if (!['POST', 'DELETE'].includes(message.method)) process.exit(2);
    const request = http.request({host: '127.0.0.1', port: message.port, path: '/mcp',
      method: message.method, headers: message.headers, timeout: 5000}, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 65536) request.destroy(new Error('response-limit'));
        else chunks.push(chunk);
      });
      response.on('end', () => process.stdout.write(JSON.stringify({status: response.statusCode,
        headers: response.headers, body: Buffer.concat(chunks).toString('utf8')})));
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', () => { process.exitCode = 2; });
    request.end(message.body);
  } catch { process.exitCode = 2; }
});
