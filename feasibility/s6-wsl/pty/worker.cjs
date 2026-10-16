'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {s1Require} = require('../../s5-performance/ui/toolchain');
const [nonce] = process.argv.slice(2);
if (!process.send || !/^[a-f0-9]{16}$/.test(nonce)) throw Error('invalid worker');
const code = fs.readFileSync(path.join(__dirname, 'mock.py'), 'utf8');
const terminal = s1Require('node-pty').spawn('C:\\Windows\\System32\\wsl.exe',
  ['-d', 'Ubuntu', '--cd', '/tmp', '--exec', '/usr/bin/env', '-i',
    'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'LC_ALL=C.UTF-8', 'TERM=xterm-256color', '/usr/bin/python3', '-u', '-c', code, nonce],
  {name: 'xterm-256color', useConpty: true, useConptyDll: true, cols: 120, rows: 24,
    cwd: __dirname, env: {SystemRoot: process.env.SystemRoot || 'C:\\Windows', TERM: 'xterm-256color'}});
process.send({event: 'windows-launcher', pid: terminal.pid});
terminal.onData(text => process.send({event: 'data', text}));
terminal.onExit(({exitCode}) => setTimeout(() => process.send({event: 'exit', exitCode}, () => process.exit(exitCode === 0 ? 0 : 1)), 100));
process.on('message', message => {
  if (message.event === 'input' && typeof message.text === 'string' && Buffer.byteLength(message.text) <= 16384) terminal.write(message.text);
  else if (message.event === 'resize') terminal.resize(100, 16);
  else if (message.event === 'kill') terminal.kill();
  else throw Error('invalid worker command');
});
process.on('disconnect', () => terminal.kill());
