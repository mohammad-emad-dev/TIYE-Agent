#!/usr/bin/env node
'use strict';
// Scripted local mock CLI for TIYE S1 display/input checks.
// No vendor CLI, no network, no model. Exercises: banner/boxes/colors,
// prompt + editing/history (readline), permission prompt, resize reflow,
// multi-line paste, Ctrl+C interrupt, unicode echo, fast output, crash.
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const path = require('node:path');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

let hangTimer = null;
let treeChild = null;

// Crash-baseline mode (S1 9f feasibility probe only): when
// TIYE_MOCK_CRASH_MODE=1, the root stays alive until a bounded self-expire
// (≈55s) even if its stdin/PTY closes, so an immediate post-crash
// re-enumeration can observe survivors without a PID kill. Normal
// smoke/lifecycle paths (env unset) are unchanged: `exit` drains the child,
// readline `close` exits 0.
const CRASH_MODE = process.env.TIYE_MOCK_CRASH_MODE === '1';
const CRASH_SELF_EXPIRE_MS = 55 * 1000;

// Deterministic descendant fixture for the upcoming S1 9f crash
// experiment (mock-cli/mock-child.js). `tree` spawns it, `tree-stop`
// asks it to exit through its stdin and observes the exit event, and
// ordinary `exit` drains it the same way before closing. No PID
// targeting anywhere here: no child.kill(), no process.kill().
function isTreeChildAlive() {
  return treeChild !== null && treeChild.exitCode === null;
}

function drainTreeChild(child) {
  // Drain pipes so a silent long-lived child never blocks on a full
  // buffer. Child output is intentionally not echoed: the
  // `tree ready pid=…` / `tree stopped …` lines below are the fixture
  // contract for the future 9f experiment.
  if (child.stdout) {
    child.stdout.on('data', () => {});
    child.stdout.on('error', () => {});
  }
  if (child.stderr) {
    child.stderr.on('data', () => {});
    child.stderr.on('error', () => {});
  }
  if (child.stdin) {
    child.stdin.on('error', () => {});
  }
  child.on('error', (err) => {
    console.error(`tree child error: ${err.message}`);
  });
  child.on('exit', (code) => {
    if (treeChild === child) {
      console.log(`tree child exited pid=${child.pid} code=${code}`);
      treeChild = null;
    }
  });
}

function startTreeChild() {
  if (isTreeChildAlive()) {
    console.log(`tree already running pid=${treeChild.pid}`);
    return;
  }
  treeChild = null; // drop a stale exited handle, if any
  const script = path.join(__dirname, 'mock-child.js');
  const child = spawn(process.execPath, [script], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  treeChild = child;
  drainTreeChild(child);
  console.log(`tree ready pid=${child.pid}`);
}

function requestTreeChildExit(timeoutMs) {
  return new Promise((resolve) => {
    const child = treeChild;
    if (child === null || child.exitCode !== null) {
      resolve({ exited: true, code: child?.exitCode ?? null, pid: child?.pid ?? null });
      return;
    }
    const pid = child.pid;
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ exited: false, code: null, pid });
      }
    }, Math.max(1000, Math.min(timeoutMs || 5000, 10000)));
    child.once('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ exited: true, code, pid });
      }
    });
    try {
      child.stdin?.write('exit\n');
    } catch {
      /* pipe gone; the exit event or the timeout below decides */
    }
  });
}

function stopTreeChildForCommand() {
  if (!isTreeChildAlive()) {
    console.log('tree not running');
    rl.prompt();
    return;
  }
  const pid = treeChild.pid;
  console.log(`tree stopping pid=${pid} …`);
  requestTreeChildExit(5000).then(({ exited, code }) => {
    if (exited) {
      if (treeChild !== null) {
        // Raced the shared exit handler: report here so the stop line
        // is still deterministic.
        console.log(`tree child exited pid=${pid} code=${code}`);
        treeChild = null;
      }
      console.log(`tree stopped pid=${pid} exit=${code}`);
    } else {
      console.log(`tree stop timeout pid=${pid}; leaving to self-expire (no PID kill)`);
      try {
        treeChild?.stdin?.end();
      } catch {
        /* pipe already gone */
      }
    }
    rl.prompt();
  });
}

function exitWithTreeDrain() {
  if (!isTreeChildAlive()) {
    rl.close();
    return;
  }
  const pid = treeChild.pid;
  console.log(`stopping tree child pid=${pid} …`);
  requestTreeChildExit(5000).then(({ exited, code }) => {
    if (exited) {
      if (treeChild !== null) {
        // Raced the shared exit handler: report here so the exit path
        // still shows one deterministic child-exit line.
        console.log(`tree child exited pid=${pid} code=${code}`);
        treeChild = null;
      }
    } else {
      console.log(`tree child pid=${pid} did not exit on request; leaving to self-expire (no PID kill)`);
      try {
        treeChild?.stdin?.end();
      } catch {
        /* pipe already gone */
      }
    }
    rl.close();
  });
}

function banner() {
  console.log(`${C.cyan}╔════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  ${C.bold}mock-cli${C.reset}  scripted S1 stand-in  ${C.green}● ready${C.reset}      ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚════════════════════════════════════════════╝${C.reset}`);
  console.log(`cwd=${process.cwd()}  node=${process.version}`);
  console.log(`Type ${C.bold}help${C.reset} for commands.`);
}

function help() {
  console.log('commands: help | fast [n] | spinner [ms] | ask | multi | unicode | hang [ms] | tree | tree-stop | crash | exit');
  console.log('anything else is echoed back (unicode-safe).');
}

function fast(n) {
  const count = Math.max(1, Math.min(Number(n) || 200, 5000));
  const colors = [C.green, C.yellow, C.cyan, C.magenta];
  for (let i = 1; i <= count; i++) {
    console.log(`${colors[i % colors.length]}fast ${i}/${count} \u2588\u2593\u2592\u2591 #${i}${C.reset}`);
  }
}

function spinner(ms, done) {
  const total = Math.max(100, Math.min(Number(ms) || 1500, 15000));
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const start = Date.now();
  let i = 0;
  const t = setInterval(() => {
    const pct = Math.min(100, Math.round(((Date.now() - start) / total) * 100));
    process.stdout.write(`\r${C.yellow}${frames[i++ % frames.length]} working… ${pct}%${C.reset} `);
    if (Date.now() - start >= total) {
      clearInterval(t);
      process.stdout.write('\r\x1b[K');
      console.log(`${C.green}done ✔${C.reset}`);
      done();
    }
  }, 60);
}

function ask(rl, done) {
  rl.question(`${C.yellow}Allow mock-cli to edit notes.txt? [y/n]${C.reset} `, (ans) => {
    const a = ans.trim().toLowerCase();
    if (a === 'y' || a === 'yes') console.log(`${C.green}approved: edit allowed${C.reset}`);
    else console.log(`${C.red}denied: edit refused${C.reset}`);
    done();
  });
}

function unicode() {
  console.log('unicode samples (shaping is terminal-dependent):');
  console.log('  Arabic   : \u0645\u0631\u062D\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645');
  console.log('  Chinese  : \u4F60\u597D\u4E16\u754C');
  console.log('  Japanese : \u3053\u3093\u306B\u3061\u306F\u4E16\u754C');
  console.log('  Korean   : \uC548\uB155\uD558\uC138\uC694 \uC138\uACC4');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
  historySize: 100,
});
rl.setPrompt(`${C.bold}${C.green}mock-cli>${C.reset} `);

let multiMode = false;
let multiLines = [];

function onLine(raw) {
  if (multiMode) {
    if (raw === '' || raw === '.') {
      console.log(`${C.cyan}pasted ${multiLines.length} line(s) intact:${C.reset}`);
      for (const l of multiLines) console.log(`  | ${l}`);
      multiMode = false;
      multiLines = [];
    } else {
      multiLines.push(raw);
    }
    rl.prompt();
    return;
  }
  const line = raw.trim();
  const [cmd, arg] = line.split(/\s+/, 2);
  switch (cmd) {
    case '': break;
    case 'help': help(); break;
    case 'fast': fast(arg); break;
    case 'spinner': spinner(arg, () => rl.prompt()); return;
    case 'ask': ask(rl, () => rl.prompt()); return;
    case 'multi':
      multiMode = true;
      multiLines = [];
      console.log('paste lines now; end with an empty line or a single dot.');
      break;
    case 'unicode': unicode(); break;
    case 'hang': {
      const ms = Math.max(1000, Math.min(Number(arg) || 10000, 60000));
      console.log(`hanging ${ms}ms — press Ctrl+C to interrupt…`);
      hangTimer = setTimeout(() => {
        hangTimer = null;
        console.log('hang finished');
        rl.prompt();
      }, ms);
      return;
    }
    case 'tree': startTreeChild(); break;
    case 'tree-stop': stopTreeChildForCommand(); return;
    case 'crash':
      console.error('mock-cli: simulated crash');
      process.exit(3);
      break;
    case 'exit':
      exitWithTreeDrain();
      return;
    default:
      console.log(`echo: ${raw}`);
  }
  rl.prompt();
}

rl.on('line', onLine);
rl.on('SIGINT', () => {
  if (hangTimer !== null) {
    clearTimeout(hangTimer);
    hangTimer = null;
    console.log('^C interrupted');
    rl.prompt();
  } else {
    console.log('(press "exit" or Ctrl+D to quit)');
    rl.prompt();
  }
});
rl.on('close', () => {
  if (CRASH_MODE) {
    // Crash-baseline fixture: a closed stdin after an abnormal parent exit
    // must NOT stop the root on its own — disappearance must come from the
    // OS job (absent in this baseline) or the bounded self-expire below.
    // Stay alive until the timer; the runner never PID-kills this process.
    try {
      console.error(`[mock-cli pid=${process.pid}] crash-mode: stdin closed, staying alive until self-expire (no PID kill)`);
    } catch {
      /* stderr gone */
    }
    return;
  }
  console.log('bye');
  process.exit(0);
});

if (CRASH_MODE) {
  setTimeout(() => {
    try {
      console.error(`[mock-cli pid=${process.pid}] crash-mode self-expire ${CRASH_SELF_EXPIRE_MS}ms, exiting 0 (no PID kill)`);
    } catch {
      /* stderr gone */
    }
    try {
      treeChild?.stdin?.end();
    } catch {
      /* pipe already gone */
    }
    process.exit(0);
  }, CRASH_SELF_EXPIRE_MS);
}

banner();
if (CRASH_MODE) {
  try {
    console.error(`[mock-cli pid=${process.pid}] crash-mode armed: stdin-close ignored, self-expire ${CRASH_SELF_EXPIRE_MS}ms (no PID kill)`);
  } catch {
    /* stderr gone */
  }
}
rl.prompt();
