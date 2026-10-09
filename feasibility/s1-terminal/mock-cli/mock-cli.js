#!/usr/bin/env node
'use strict';
// Scripted local mock CLI for TIYE S1 display/input checks.
// No vendor CLI, no network, no model. Exercises: banner/boxes/colors,
// prompt + editing/history (readline), permission prompt, resize reflow,
// multi-line paste, Ctrl+C interrupt, unicode echo, fast output, crash.
const readline = require('node:readline');

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

function banner() {
  console.log(`${C.cyan}╔════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║${C.reset}  ${C.bold}mock-cli${C.reset}  scripted S1 stand-in  ${C.green}● ready${C.reset}      ${C.cyan}║${C.reset}`);
  console.log(`${C.cyan}╚════════════════════════════════════════════╝${C.reset}`);
  console.log(`cwd=${process.cwd()}  node=${process.version}`);
  console.log(`Type ${C.bold}help${C.reset} for commands.`);
}

function help() {
  console.log('commands: help | fast [n] | spinner [ms] | ask | multi | unicode | hang [ms] | crash | exit');
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
    case 'crash':
      console.error('mock-cli: simulated crash');
      process.exit(3);
      break;
    case 'exit':
      rl.close();
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
  console.log('bye');
  process.exit(0);
});

banner();
rl.prompt();
