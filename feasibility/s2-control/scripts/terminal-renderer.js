'use strict';
const { Terminal } = require('../../s1-terminal/node_modules/@xterm/xterm');
const term = new Terminal({ cols: 120, rows: 38, fontSize: 14, scrollback: 3000 });
term.open(document.getElementById('terminal'));
term.onData(data => window.terminalBridge.input(data));
window.terminalBridge.data(data => term.write(data));
window.pasteTask = text => {
  if (!term.modes.bracketedPasteMode) return false;
  term.focus();
  term.paste(text);
  return true;
};
window.terminalBridge.ready();
