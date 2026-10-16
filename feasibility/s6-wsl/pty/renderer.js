import {Terminal} from '@xterm/xterm';
const term = new Terminal({cols: 120, rows: 24, scrollback: 500, fontSize: 13, cursorBlink: false});
term.open(document.querySelector('#terminal'));
let queue = Promise.resolve(), received = '';
term.onData(text => window.mockPty.input(text));
window.mockPty.onOutput(text => {
  received += text;
  queue = queue.then(() => new Promise(resolve => term.write(text, resolve)));
});
window.__paste = text => term.paste(text);
window.__interrupt = () => term.input('\x03');
window.__resize = () => term.resize(100, 16);
window.__inspect = async () => {
  await queue;
  const lines = [];
  for (let i = 0; i < term.buffer.active.length; i++) lines.push(term.buffer.active.getLine(i).translateToString(true));
  const bytes = new TextEncoder().encode(received);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return {cols: term.cols, rows: term.rows, lines, receivedBytes: bytes.length,
    receivedSha256: Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')};
};
window.mockPty.ready();
