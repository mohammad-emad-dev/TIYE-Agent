import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

interface TiyeTerminalApi {
  ready(): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (info: { exitCode: number; signal?: number }) => void): void;
  sendInput(data: string): void;
  resize(cols: number, rows: number): void;
}

declare global {
  interface Window {
    tiyeTerminal: TiyeTerminalApi;
  }
}

const el = document.getElementById('terminal');
if (el === null) throw new Error('#terminal element missing');

const term = new Terminal({
  cols: 100,
  rows: 30,
  cursorBlink: true,
  scrollback: 10000,
  allowProposedApi: false,
});
const fit = new FitAddon();
term.loadAddon(fit);
term.open(el);
fit.fit();

const api = window.tiyeTerminal;
if (api === undefined) throw new Error('tiyeTerminal bridge missing');

api.onData((data) => {
  term.write(data);
});
api.onExit((info) => {
  term.writeln(`\r\n[pty exited with code ${info.exitCode}]`);
});

term.onData((data) => {
  api.sendInput(data);
});

let resizeTimer: number | undefined;
function reportSize(): void {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    try {
      fit.fit();
    } catch {
      /* terminal not laid out yet */
    }
    if (term.cols >= 2 && term.rows >= 1) api.resize(term.cols, term.rows);
  }, 100);
}
window.addEventListener('resize', reportSize);

// Initial size once laid out, then signal main to flush buffered output.
reportSize();
api.ready();
term.focus();
