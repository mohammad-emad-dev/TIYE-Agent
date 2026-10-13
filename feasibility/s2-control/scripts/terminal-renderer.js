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
window.terminalScreen = () => {
  const buffer = term.buffer.active;
  return Array.from({ length: term.rows }, (_, index) => buffer.getLine(buffer.viewportY + index)?.translateToString(true) || '').join('\n');
};
window.terminalChoices = () => {
  const buffer = term.buffer.active;
  return Array.from({ length: term.rows }, (_, row) => {
    const line = buffer.getLine(buffer.viewportY + row);
    const text = line?.translateToString(true) || '';
    return ['Allow once', 'Always allow', 'Reject'].flatMap(label => {
      const column = text.indexOf(label);
      if (column < 0) return [];
      const cell = line.getCell(column);
      return [{ label, row, column, fg: cell.getFgColor(), bg: cell.getBgColor(), fgMode: cell.getFgColorMode(), bgMode: cell.getBgColorMode(), inverse: cell.isInverse() }];
    });
  }).flat();
};
window.terminalBridge.ready();
