// Shared Windows identity plumbing; callers retain their own recovery policy.

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CrashProcessIdentity {
  pid: number;
  parentPid: number;
  creationTime: string;
  name: string;
}

function powershellBin(): string {
  const system = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  try {
    if (fs.existsSync(system)) return system;
  } catch {
    /* fall through */
  }
  return 'powershell.exe';
}

export function resolveVerifiedStopScriptPath(): string {
  return path.resolve(__dirname, '..', 'scripts', 'verified-identity-stop.ps1');
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function lookupSingleProcess(pid: number, scenarioLabel: string, timeoutMs = 20000): Promise<CrashProcessIdentity | null> {
  const script =
    `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | ForEach-Object { $_.ProcessId.ToString() + "|" + $_.ParentProcessId.ToString() + "|" + $_.CreationDate.ToString("o") + "|" + $_.Name }`;
  return new Promise<CrashProcessIdentity | null>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let child: child_process.ChildProcess;
    try {
      child = child_process.spawn(powershellBin(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      reject(err as Error);
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* helper-owned enumeration only */
      }
      reject(new Error(`${scenarioLabel} single CIM lookup for PID ${pid} timed out`));
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${scenarioLabel} single CIM lookup failed (exit ${code}): ${stderr.slice(0, 200)}`));
        return;
      }
      const line = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] ?? '';
      if (line === '') {
        resolve(null);
        return;
      }
      const first = line.indexOf('|');
      const second = line.indexOf('|', first + 1);
      const third = line.indexOf('|', second + 1);
      if (first < 0 || second < 0 || third < 0) {
        reject(new Error(`${scenarioLabel}: malformed single CIM row`));
        return;
      }
      const gotPid = Number(line.slice(0, first));
      const parentPid = Number(line.slice(first + 1, second));
      const creationTime = line.slice(second + 1, third);
      const name = line.slice(third + 1);
      if (gotPid !== pid || !Number.isInteger(parentPid) || creationTime === '' || name === '') {
        reject(new Error(`${scenarioLabel}: invalid single identity for PID ${pid}`));
        return;
      }
      resolve({ pid: gotPid, parentPid, creationTime, name });
    });
  });
}

export async function captureProcessWithRetry(
  pid: number,
  label: string,
  scenarioLabel: string,
  timeoutMs = 10000,
): Promise<CrashProcessIdentity> {
  const deadline = Date.now() + timeoutMs;
  // biome-ignore lint: bounded capture retry
  while (true) {
    const found = await lookupSingleProcess(pid, scenarioLabel);
    if (found !== null) return found;
    if (Date.now() >= deadline) throw new Error(`${scenarioLabel}: ${label} PID ${pid} absent after ${timeoutMs}ms`);
    await sleepMs(500);
  }
}

export function writeRegistryAtomic<T>(finalPath: string, data: T): void {
  const dir = path.dirname(finalPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${finalPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, finalPath);
}

export function runVerifiedStopHelper(
  pid: number,
  creationISO: string,
  opts: { scenarioLabel: string; recoveryLogPrefix: string; helperScriptPath: string },
): Promise<{ code: number; output: string }> {
  const helperPs1 = opts.helperScriptPath;
  return new Promise((resolve, reject) => {
    let output = '';
    let child: child_process.ChildProcess;
    try {
      child = child_process.spawn(
        powershellBin(),
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPs1, '-TargetPid', String(pid), '-TargetCreationTime', creationISO],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
    } catch (err) {
      reject(err as Error);
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* own helper handle only */
      }
      reject(new Error(`${opts.scenarioLabel} recovery: verified-identity helper timed out (helper handle killed, no PID kill)`));
    }, 15000);
    child.stdout?.on('data', (d: Buffer) => {
      const text = d.toString('utf8');
      output += text;
      for (const line of text.split(/\r?\n/)) {
        if (line !== '') console.log(`[${opts.recoveryLogPrefix}] helper: ${line}`);
      }
    });
    child.stderr?.on('data', (d: Buffer) => {
      const text = d.toString('utf8');
      output += text;
      for (const line of text.split(/\r?\n/)) {
        if (line !== '') console.log(`[${opts.recoveryLogPrefix}] helper: ${line}`);
      }
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 2, output });
    });
  });
}
