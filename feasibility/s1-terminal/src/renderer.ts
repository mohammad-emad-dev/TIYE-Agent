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
    __tiyePasteProbe?: {
      token: string;
      isBracketedPasteEnabled(): boolean;
      pasteFixed(data: string): boolean;
    };
    __tiyeUnicodeProbe?: {
      token: string;
      isBracketedPasteEnabled(): boolean;
      pasteFixed(data: string): boolean;
      checkDisplay(): {
        ar: boolean;
        zh: boolean;
        ja: boolean;
        ko: boolean;
        all: boolean;
        bufLen: number;
        domLen: number;
      };
    };
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
// Container resize is the actual xterm trigger: window resize alone proved
// flaky for automated BrowserWindow content resizes (viewport updated but no
// follow-up RESIZE IPC within 15s in 3 of 4 runs). Observing #terminal
// covers the same real layout change through the existing fit+api.resize
// path (no synthetic dims, no new IPC channel).
try {
  const ro = new ResizeObserver(() => reportSize());
  ro.observe(el);
} catch {
  /* ResizeObserver unavailable: window resize listener above still applies */
}

// Initial size once laid out, then signal main to flush buffered output.
reportSize();
api.ready();
term.focus();

// Bounded S1 multiline-paste probe hook (test mode ONLY, never production
// UI). Enabled solely when main loads index.html with
// `?tiye-paste-probe=1` (see createWindow paste branch). The hook validates
// the single fixed harmless multiline ASCII token and requires the real TUI
// to have enabled bracketed paste mode before calling xterm's
// `Terminal.paste()` — the terminal paste path, NOT the OS clipboard
// (no clipboard read/overwrite, no Ctrl+V). Any payload mismatch or a
// disabled bracketed mode throws and never pastes (fail closed).
const CLI_PASTE_PROBE_TOKEN = 'TIYEPASTE_A7\nTIYEPASTE_B8\nTIYEPASTE_C9';
try {
  const pasteProbeEnabled =
    new URLSearchParams(window.location.search).get('tiye-paste-probe') === '1';
  if (pasteProbeEnabled) {
    window.__tiyePasteProbe = {
      token: CLI_PASTE_PROBE_TOKEN,
      isBracketedPasteEnabled: () => term.modes.bracketedPasteMode,
      pasteFixed: (data: string) => {
        if (data !== CLI_PASTE_PROBE_TOKEN) {
          throw new Error('paste probe: payload mismatch (fixed token only)');
        }
        if (!term.modes.bracketedPasteMode) {
          throw new Error('paste probe: bracketedPasteMode off (fail closed, no paste)');
        }
        term.paste(data);
        return true;
      },
    };
  }
} catch {
  /* probe hook unavailable: paste mode fails closed in main */
}

// Bounded S1 step-8 Unicode probe hook (test mode ONLY, never production
// UI). Enabled solely when main loads index.html with
// `?tiye-unicode-probe=1` (see createWindow unicode branch). Same safety as
// the paste hook: fixed single-line Unicode token ONLY (Arabic + Chinese +
// Japanese + Korean with ASCII delimiters, no newline, no Enter), bracketed
// paste mode required, Terminal.paste() path only (no OS clipboard
// read/overwrite, no Ctrl+V). checkDisplay() is a read-only semantic
// renderer gate: it scans the xterm buffer + #terminal DOM for the four
// fixed script substrings and returns booleans + lengths only (never full
// text, never secrets). Main requires all=true plus changed screenshots;
// hash difference alone is never cited as display proof.
const CLI_UNICODE_PROBE_TOKEN = 'TIYE_U8[AR:مرحبا][ZH:你好][JA:こんにちは][KO:안녕]';
try {
  const unicodeProbeEnabled =
    new URLSearchParams(window.location.search).get('tiye-unicode-probe') === '1';
  if (unicodeProbeEnabled) {
    const UNI_AR = 'مرحبا';
    const UNI_ZH = '你好';
    const UNI_JA = 'こんにちは';
    const UNI_KO = '안녕';
    window.__tiyeUnicodeProbe = {
      token: CLI_UNICODE_PROBE_TOKEN,
      isBracketedPasteEnabled: () => term.modes.bracketedPasteMode,
      pasteFixed: (data: string) => {
        if (data !== CLI_UNICODE_PROBE_TOKEN) {
          throw new Error('unicode probe: payload mismatch (fixed token only)');
        }
        if (!term.modes.bracketedPasteMode) {
          throw new Error('unicode probe: bracketedPasteMode off (fail closed, no paste)');
        }
        term.paste(data);
        return true;
      },
      checkDisplay: () => {
        let bufText = '';
        try {
          const buf = term.buffer.active;
          const parts: string[] = [];
          const start = Math.max(0, buf.length - 100);
          for (let i = start; i < buf.length; i += 1) {
            const line = buf.getLine(i);
            if (line) parts.push(line.translateToString(true));
          }
          bufText = parts.join('\n');
        } catch {
          bufText = '';
        }
        let domText = '';
        try {
          domText = (document.getElementById('terminal')?.innerText ?? '').slice(0, 20000);
        } catch {
          domText = '';
        }
        const combined = bufText + '\n' + domText;
        const ar = combined.includes(UNI_AR);
        const zh = combined.includes(UNI_ZH);
        const ja = combined.includes(UNI_JA);
        const ko = combined.includes(UNI_KO);
        return { ar, zh, ja, ko, all: ar && zh && ja && ko, bufLen: bufText.length, domLen: domText.length };
      },
    };
  }
} catch {
  /* probe hook unavailable: unicode mode fails closed in main */
}
