// S1 step 9e: bounded Windows-only process-tree observation (read-only).
// Captures the member tree rooted at a PTY PID before 9c Stop / 9d Quit,
// with each process identified by PID AND Windows process creation time
// (Win32_Process CreationDate, round-trip ISO). After each stop the caller
// re-enumerates and reports whether every captured identity is gone.
// A PID that exists with a DIFFERENT creation time is a reuse, not a
// survivor: the original identity is gone.
//
// Read-only by design: this helper only runs Get-CimInstance. It never
// terminates any process (no Stop-Process, no taskkill, no kill of a
// captured PID). The only ChildProcess.kill() here targets this helper's
// own short-lived powershell.exe enumeration on timeout, never a member.
// No PID-only kills, no Job Object, no 9f crash cleanup, no extra deps.

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';

export interface ProcessIdentity {
  pid: number;
  parentPid: number;
  /** Win32_Process CreationDate as round-trip ISO (CreationDate.ToString("o")). */
  creationTime: string;
  name: string;
}

export interface GoneCheck {
  gone: ProcessIdentity[];
  /** Captured identities still present with the SAME pid+creationTime. */
  survivors: ProcessIdentity[];
  attempts: number;
}

/** 9e is a bounded Windows-specific CIM probe; other OSes must skip. */
export function isProcessTreeCheckSupported(): boolean {
  return process.platform === 'win32';
}

function powershellBin(): string {
  const system = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
  try {
    if (fs.existsSync(system)) return system;
  } catch {
    /* fall through to PATH lookup */
  }
  return 'powershell.exe';
}

// Single CIM enumeration script. Pipe-delimited lines:
//   pid|ppid|creation-o|name
const ENUM_SCRIPT =
  'Get-CimInstance Win32_Process | ForEach-Object { $_.ProcessId.ToString() + "|" + $_.ParentProcessId.ToString() + "|" + $_.CreationDate.ToString("o") + "|" + $_.Name }';

const ENUM_TIMEOUT_MS = 20000;
const MAX_LINE_CHARS = 4096;

interface Row {
  pid: number;
  parentPid: number;
  creationTime: string;
  name: string;
}

function parseEnumOutput(stdout: string): Map<number, Row> {
  const map = new Map<number, Row>();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (line.length > MAX_LINE_CHARS) throw new Error('9e CIM enumeration contained an oversized row');
    const first = line.indexOf('|');
    if (first < 0) throw new Error('9e CIM enumeration contained a malformed row');
    const second = line.indexOf('|', first + 1);
    if (second < 0) throw new Error('9e CIM enumeration contained a malformed row');
    const third = line.indexOf('|', second + 1);
    if (third < 0) throw new Error('9e CIM enumeration contained a malformed row');
    const pid = Number(line.slice(0, first));
    const parentPid = Number(line.slice(first + 1, second));
    const creationTime = line.slice(second + 1, third);
    const name = line.slice(third + 1);
    if (!Number.isInteger(pid) || pid < 0 || !Number.isInteger(parentPid) || parentPid < 0 || creationTime === '' || name === '') {
      throw new Error('9e CIM enumeration contained an invalid process identity');
    }
    if (map.has(pid)) throw new Error(`9e CIM enumeration repeated PID ${pid}`);
    map.set(pid, { pid, parentPid, creationTime, name });
  }
  return map;
}

function enumerateAllOnce(): Promise<Map<number, Row>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let child: child_process.ChildProcess;
    try {
      child = child_process.spawn(powershellBin(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ENUM_SCRIPT], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      reject(err as Error);
      return;
    }
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Timeout kill targets only this helper's own enumeration process
      // (handle-based, observed via the ChildProcess object), never a
      // captured member PID.
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      reject(new Error(`9e CIM enumeration timed out after ${ENUM_TIMEOUT_MS}ms`));
    }, ENUM_TIMEOUT_MS);
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
      if (stdout.length > 4_000_000) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try {
            child.kill();
          } catch {
            /* ignore */
          }
          reject(new Error('9e CIM enumeration output exceeded bound'));
        }
      }
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
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
      if (code !== 0) {
        reject(new Error(`9e CIM enumeration failed (exit ${code}): ${stderr.slice(0, 300)}`));
        return;
      }
      try {
        resolve(parseEnumOutput(stdout));
      } catch (err) {
        reject(err as Error);
      }
    });
  });
}

/**
 * Capture the live tree rooted at rootPid (root + all ParentProcessId
 * descendants). Throws when unsupported, when the root PID is invalid, or
 * when the root is absent (before a Stop the member must be alive).
 */
export async function captureProcessTree(rootPid: number): Promise<ProcessIdentity[]> {
  if (!isProcessTreeCheckSupported()) throw new Error('9e process-tree check is Windows-only');
  if (!Number.isInteger(rootPid) || rootPid <= 0) throw new Error(`9e capture: invalid root PID ${String(rootPid)}`);
  const all = await enumerateAllOnce();
  if (!all.has(rootPid)) throw new Error(`9e capture: root PID ${rootPid} not present (member not alive?)`);
  const out: ProcessIdentity[] = [];
  const visited = new Set<number>();
  const queue: number[] = [rootPid];
  while (queue.length > 0) {
    const pid = queue.shift() as number;
    if (visited.has(pid)) continue;
    visited.add(pid);
    const row = all.get(pid);
    if (row === undefined) continue;
    out.push({ pid: row.pid, parentPid: row.parentPid, creationTime: row.creationTime, name: row.name });
    for (const [childPid, childRow] of all) {
      if (childRow.parentPid === pid && !visited.has(childPid)) queue.push(childPid);
    }
  }
  return out;
}

/** Single re-enumeration: which captured identities are still present? */
async function checkOnce(captured: ProcessIdentity[]): Promise<GoneCheck> {
  const all = await enumerateAllOnce();
  const gone: ProcessIdentity[] = [];
  const survivors: ProcessIdentity[] = [];
  for (const id of captured) {
    const current = all.get(id.pid);
    if (current !== undefined && current.creationTime === id.creationTime) survivors.push(id);
    else gone.push(id);
  }
  return { gone, survivors, attempts: 1 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Bounded read-only re-enumeration after a Stop/Quit. Polls up to
 * timeoutMs (default 8000ms) so a slow ConPTY teardown does not flake the
 * smoke, then reports survivors. Never terminates anything.
 */
export async function verifyIdentitiesGone(captured: ProcessIdentity[], timeoutMs = 8000, intervalMs = 750): Promise<GoneCheck> {
  if (!isProcessTreeCheckSupported()) throw new Error('9e process-tree check is Windows-only');
  if (captured.length === 0) return { gone: [], survivors: [], attempts: 0 };
  const deadline = Date.now() + Math.max(1000, Math.min(timeoutMs, 20000));
  const step = Math.max(250, Math.min(intervalMs, 2000));
  let attempts = 0;
  // biome-ignore lint: bounded poll loop
  while (true) {
    attempts += 1;
    const once = await checkOnce(captured);
    if (once.survivors.length === 0) return { gone: once.gone, survivors: [], attempts };
    if (Date.now() >= deadline) return { gone: once.gone, survivors: once.survivors, attempts };
    await sleep(step);
  }
}

/** One-line identity for smoke logs: pid + creationTime + name. */
export function formatIdentity(id: ProcessIdentity): string {
  return `pid=${id.pid} created=${id.creationTime} name=${id.name}`;
}
