// S1 step 9f crash-survivor feasibility experiment (Windows mock sidecar only).
// Controlled sidecar, NOT a CLI member tree: Electron main spawns
// mock-cli/mock-child.js DIRECTLY (outside any PTY, outside any unnamed Job),
// keeps its stdin pipe open, and records PID+creation identities in a separate
// versioned registry. The mock-child fixture ignores stdin EOF and
// self-expires at 60s (fixture behavior unchanged).
//
// --crash-survivor: spawn sidecar, require parentPid==mainPid and
//   name==node.exe, atomically write the survivor registry, validate it,
//   emit READY, stay alive until the runner kills ONLY its runner-owned
//   Electron ChildProcess handle.
// --crash-survivor-recovery-check: read + strictly validate the registry
//   (no PTY, no duplicate spawn), look up the saved PID by CIM, fail closed
//   with ALERT when absent/mismatched/inconsistent (NEVER invoking the stop
//   helper), otherwise invoke scripts/verified-identity-stop.ps1 with the
//   saved PID+creation (the helper verifies on its SAME handle), require
//   STOPPED exit 0, then re-enumerate the exact identity gone. No fallback
//   PID kill, no taskkill, no Stop-Process.
//
// Registry authenticity note: schema/version/lastIntent checks prove only
// that the file parses as this experiment's registry. They do NOT establish
// authenticity against same-user tampering (any local process of the same
// user can rewrite the file). The tampered-creation scenario in
// scripts/run-crash-survivor.js exercises exactly that fail-closed path.
// This is a controlled feasibility experiment, not a production cleanup
// guarantee. No HMAC secret is invented (a secret stored beside the registry
// would add no trust).
//
// Exit codes for the recovery mode:
//   0 = CLEANED (exact survivor verified, helper STOPPED exit 0, exact gone)
//   1 = ALERT/PAUSED (fail-closed: absent, mismatched creation, inconsistent
//       recorded parent/name, helper refused/failed, or still alive after the
//       helper -- no fallback kill, no duplicate launch)
//   2 = harness failure (missing/malformed registry, lookup failure, timeout,
//       non-Windows -- never a pass)

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  captureProcessWithRetry,
  lookupSingleProcess,
  resolveVerifiedStopScriptPath,
  runVerifiedStopHelper,
  sleepMs,
  writeRegistryAtomic,
  type CrashProcessIdentity,
} from './crash-identity';

export const CRASH_SURVIVOR_FLAG = '--crash-survivor';
export const CRASH_SURVIVOR_RECOVERY_FLAG = '--crash-survivor-recovery-check';
export const CRASH_SURVIVOR_REGISTRY_ENV = 'TIYE_CRASH_SURVIVOR_REGISTRY_PATH';
export const CRASH_SURVIVOR_REGISTRY_SCHEMA = 'tiye-crash-survivor-registry';
export const CRASH_SURVIVOR_REGISTRY_VERSION = 1;
export const CRASH_SURVIVOR_MEMBER_ID = 'crash-survivor-member';

export interface CrashSurvivorRegistry {
  schema: string;
  version: number;
  sessionId: string;
  memberId: string;
  mainPid: number;
  mainCreationTime: string;
  childPid: number;
  childCreationTime: string;
  childName: string;
  childParentPid: number;
  lastIntent: string;
  createdAt: string;
}

export type SurvivorIdentity = CrashProcessIdentity;

function sidecarScriptPath(): string {
  return path.resolve(__dirname, '..', 'mock-cli', 'mock-child.js');
}

function resolveSidecarNode(): string {
  if (process.versions.electron !== undefined) {
    const out = child_process.spawnSync('where.exe', ['node'], { encoding: 'utf8' });
    if (out.error) throw out.error;
    const first = (out.stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)[0];
    if (first !== undefined) return first;
    throw new Error('crash-survivor: node not found on PATH (Electron hosts mock-child on node)');
  }
  return process.execPath;
}

export function getCrashSurvivorRegistryPath(): string {
  const raw = (process.env[CRASH_SURVIVOR_REGISTRY_ENV] ?? '').trim();
  if (raw === '') {
    throw new Error(`crash-survivor probe: ${CRASH_SURVIVOR_REGISTRY_ENV} is not set (runner must supply a test-specific registry path)`);
  }
  return raw;
}

export function parseCrashSurvivorRegistry(rawText: string, source: string): CrashSurvivorRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`crash-survivor recovery: registry at ${source} is not valid JSON (no pass)`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`crash-survivor recovery: registry at ${source} is malformed (expected object, no pass)`);
  }
  const r = parsed as Record<string, unknown>;
  if (r['schema'] !== CRASH_SURVIVOR_REGISTRY_SCHEMA) {
    throw new Error(`crash-survivor recovery: registry schema mismatch (want ${CRASH_SURVIVOR_REGISTRY_SCHEMA}, no pass)`);
  }
  if (r['version'] !== CRASH_SURVIVOR_REGISTRY_VERSION) {
    throw new Error(`crash-survivor recovery: registry version mismatch (want ${CRASH_SURVIVOR_REGISTRY_VERSION}, no pass)`);
  }
  if (typeof r['sessionId'] !== 'string' || r['sessionId'] === '') {
    throw new Error('crash-survivor recovery: registry sessionId missing/malformed (no pass)');
  }
  if (r['memberId'] !== CRASH_SURVIVOR_MEMBER_ID) {
    throw new Error('crash-survivor recovery: registry memberId missing/malformed (no pass)');
  }
  if (!Number.isInteger(r['mainPid']) || (r['mainPid'] as number) <= 0) {
    throw new Error('crash-survivor recovery: registry mainPid missing/malformed (no pass)');
  }
  if (typeof r['mainCreationTime'] !== 'string' || !Number.isFinite(Date.parse(r['mainCreationTime'] as string))) {
    throw new Error('crash-survivor recovery: registry mainCreationTime missing/malformed (no pass)');
  }
  if (!Number.isInteger(r['childPid']) || (r['childPid'] as number) <= 0) {
    throw new Error('crash-survivor recovery: registry childPid missing/malformed (no pass)');
  }
  if (typeof r['childCreationTime'] !== 'string' || !Number.isFinite(Date.parse(r['childCreationTime'] as string))) {
    throw new Error('crash-survivor recovery: registry childCreationTime missing/malformed (no pass)');
  }
  if (typeof r['childName'] !== 'string' || r['childName'] === '') {
    throw new Error('crash-survivor recovery: registry childName missing/malformed (no pass)');
  }
  if (!Number.isInteger(r['childParentPid']) || (r['childParentPid'] as number) < 0) {
    throw new Error('crash-survivor recovery: registry childParentPid missing/malformed (no pass)');
  }
  if (r['lastIntent'] !== 'run') {
    throw new Error('crash-survivor recovery: registry lastIntent missing/invalid (want "run", no pass)');
  }
  if (typeof r['createdAt'] !== 'string' || !Number.isFinite(Date.parse(r['createdAt'] as string))) {
    throw new Error('crash-survivor recovery: registry createdAt missing/malformed (no pass)');
  }
  return {
    schema: CRASH_SURVIVOR_REGISTRY_SCHEMA,
    version: CRASH_SURVIVOR_REGISTRY_VERSION,
    sessionId: r['sessionId'] as string,
    memberId: r['memberId'] as string,
    mainPid: r['mainPid'] as number,
    mainCreationTime: r['mainCreationTime'] as string,
    childPid: r['childPid'] as number,
    childCreationTime: r['childCreationTime'] as string,
    childName: r['childName'] as string,
    childParentPid: r['childParentPid'] as number,
    lastIntent: 'run',
    createdAt: r['createdAt'] as string,
  };
}

function formatSurvivor(id: SurvivorIdentity): string {
  return `pid=${id.pid} created=${id.creationTime} name=${id.name} parentPid=${id.parentPid}`;
}

/**
 * --crash-survivor first mode. Spawns mock-child.js as a DIRECT child of
 * Electron main (outside any PTY, outside any Job), keeps its stdin pipe
 * open, captures main+child PID+creation identities via CIM, requires
 * parentPid==mainPid and name==node.exe, writes the distinct survivor
 * registry atomically, validates it, emits READY, and stays alive.
 */
export async function runCrashSurvivor(): Promise<number> {
  const fail = (msg: string): number => {
    console.error(`[crash-survivor] FAIL: ${msg}`);
    return 2;
  };
  let registryPath: string;
  try {
    registryPath = getCrashSurvivorRegistryPath();
  } catch (err) {
    return fail((err as Error).message);
  }
  if (process.platform !== 'win32') {
    return fail(`crash-survivor is Windows-only (platform=${process.platform}, no pass claimed)`);
  }
  let sidecar: child_process.ChildProcess | null = null;
  const askSidecarExitBestEffort = async (): Promise<void> => {
    if (sidecar === null) return;
    try {
      sidecar.stdin?.write('exit\n');
    } catch {
      /* pipe gone */
    }
  };
  try {
    const script = sidecarScriptPath();
    if (!fs.existsSync(script)) return fail(`sidecar fixture missing: ${script}`);
    const nodeBin = resolveSidecarNode();
    console.log(`[crash-survivor] spawning controlled sidecar (direct child, OUTSIDE PTY, no job): ${nodeBin} ${script}`);
    console.log('[crash-survivor] note: sidecar is a controlled sidecar, not a CLI member tree; no PTY, no unnamed job');
    try {
      sidecar = child_process.spawn(nodeBin, [script], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        // Detached so the controlled sidecar is not reaped with Electron main
        // on this host's kill path: it stays a direct child (parentPid==main
        // at capture) but survives main death for the recovery step. It is
        // still OUTSIDE any PTY and OUTSIDE the crash-job unnamed job.
        detached: true,
      });
      // Allow Electron to exit independently; the runner proves liveness via
      // CIM identity, not via the ChildProcess handle.
      try {
        sidecar.unref();
      } catch {
        /* unref is best-effort */
      }
    } catch (err) {
      return fail(`sidecar spawn failed: ${(err as Error).message}`);
    }
    const child: child_process.ChildProcess = sidecar;
    child.stdout?.on('data', () => {
      /* drain so the fixture can never block; CIM identity is the proof */
    });
    child.stderr?.on('data', (d: Buffer) => {
      const text = d.toString('utf8');
      for (const line of text.split(/\r?\n/)) {
        if (line.trim() !== '') console.log(`[crash-survivor] sidecar-stderr: ${line.slice(0, 200)}`);
      }
    });
    child.stdin?.on('error', () => {});
    child.on('error', (err) => {
      console.error(`[crash-survivor] sidecar spawn error: ${(err as Error).message}`);
    });
    const childPid = child.pid;
    if (childPid === undefined) {
      return fail('sidecar has no OS PID (no pass)');
    }
    console.log(`[crash-survivor] sidecar spawned pid=${childPid}; stdin held open (fixture ignores stdin EOF, 60s self-expire)`);
    // Capture main + child identities via CIM. Retry briefly for CIM lag.
    let mainIdentity: SurvivorIdentity;
    try {
      mainIdentity = await captureProcessWithRetry(process.pid, 'main', 'crash-survivor');
      console.log(`[crash-survivor] MAIN ${formatSurvivor(mainIdentity)}`);
    } catch (err) {
      await askSidecarExitBestEffort();
      return fail(`main identity capture failed: ${(err as Error).message} (no pass)`);
    }
    let childIdentity: SurvivorIdentity;
    try {
      childIdentity = await captureProcessWithRetry(childPid, 'sidecar', 'crash-survivor');
      console.log(`[crash-survivor] CHILD ${formatSurvivor(childIdentity)}`);
    } catch (err) {
      await askSidecarExitBestEffort();
      return fail(`sidecar identity capture failed: ${(err as Error).message} (no pass)`);
    }
    // Require direct-child layout and node runtime.
    if (childIdentity.parentPid !== mainIdentity.pid) {
      await askSidecarExitBestEffort();
      return fail(`sidecar parentPid=${childIdentity.parentPid} != mainPid=${mainIdentity.pid} (not a direct child, no pass)`);
    }
    if (childIdentity.name.toLowerCase() !== 'node.exe') {
      await askSidecarExitBestEffort();
      return fail(`sidecar name=${childIdentity.name} != node.exe (unexpected runtime, no pass)`);
    }
    console.log(`[crash-survivor] ok: direct-child check parentPid==mainPid (${childIdentity.parentPid}) and name==node.exe`);
    const sessionId = `s1-${Date.now().toString(36)}-survivor-pid${childPid}`;
    const registry: CrashSurvivorRegistry = {
      schema: CRASH_SURVIVOR_REGISTRY_SCHEMA,
      version: CRASH_SURVIVOR_REGISTRY_VERSION,
      sessionId,
      memberId: CRASH_SURVIVOR_MEMBER_ID,
      mainPid: mainIdentity.pid,
      mainCreationTime: mainIdentity.creationTime,
      childPid: childIdentity.pid,
      childCreationTime: childIdentity.creationTime,
      childName: childIdentity.name,
      childParentPid: childIdentity.parentPid,
      lastIntent: 'run',
      createdAt: new Date().toISOString(),
    };
    writeRegistryAtomic(registryPath, registry);
    const roundTrip = fs.readFileSync(registryPath, 'utf8');
    parseCrashSurvivorRegistry(roundTrip, registryPath);
    console.log(`[crash-survivor] ok: durable registry written atomically to ${registryPath} (session=${sessionId} member=${CRASH_SURVIVOR_MEMBER_ID} childPid=${childIdentity.pid} mainPid=${mainIdentity.pid} lastIntent=run schema=${CRASH_SURVIVOR_REGISTRY_SCHEMA} v${CRASH_SURVIVOR_REGISTRY_VERSION})`);
    console.log(`[crash-survivor] READY registry=${registryPath} session=${sessionId} member=${CRASH_SURVIVOR_MEMBER_ID} childPid=${childIdentity.pid} mainPid=${mainIdentity.pid}`);
    console.log('[crash-survivor] alive until runner kills this Electron process (no graceful exit here; sidecar self-expires within 60s)');
    if (child.exitCode !== null) {
      return fail('sidecar exited before READY settled (harness failure, no pass)');
    }
    // Fail closed if the sidecar dies first while main stays alive: staying
    // alive with no survivor would mislead the runner's post-kill check.
    child.on('exit', (code) => {
      console.error(`[crash-survivor] FAIL: sidecar exited before main kill (code=${code}, no pass)`);
    });
    await new Promise<void>(() => {});
    return 0;
  } catch (err) {
    try {
      await askSidecarExitBestEffort();
    } catch {
      /* best-effort only */
    }
    return fail((err as Error).message);
  }
}

/**
 * --crash-survivor-recovery-check. Read-only until the exact-survivor path:
 * no PTY, no sidecar spawn, no duplicate. Fail closed with ALERT on absent /
 * mismatched / inconsistent identities (never invoking the helper there).
 * On the exact survivor with consistent recorded parent+name, invoke the
 * verified-identity stop helper with the SAVED identity, require STOPPED
 * exit 0, then re-enumerate the exact identity gone. No fallback PID kill.
 */
export async function runCrashSurvivorRecovery(): Promise<number> {
  let registryPath: string;
  try {
    registryPath = getCrashSurvivorRegistryPath();
  } catch (err) {
    console.error(`[crash-survivor-recovery] FAIL: ${(err as Error).message}`);
    return 2;
  }
  if (process.platform !== 'win32') {
    console.error(`[crash-survivor-recovery] FAIL: crash-survivor recovery is Windows-only (platform=${process.platform}, no pass claimed)`);
    return 2;
  }
  if (!fs.existsSync(resolveVerifiedStopScriptPath())) {
    console.error('[crash-survivor-recovery] FAIL: verified-identity-stop.ps1 missing (no pass)');
    return 2;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(registryPath, 'utf8');
  } catch {
    console.error(`[crash-survivor-recovery] FAIL: durable registry missing at ${registryPath} (no pass)`);
    console.log('[crash-survivor-recovery] ALERT reason=registry-missing (identity cannot be verified; helper NEVER invoked)');
    console.log('[crash-survivor-recovery] PAUSED member=unknown session=unknown no-duplicate-launch no-pty-spawn no-helper-invoked reason=registry-missing');
    return 2;
  }
  let registry: CrashSurvivorRegistry;
  try {
    registry = parseCrashSurvivorRegistry(raw, registryPath);
  } catch (err) {
    console.error(`[crash-survivor-recovery] FAIL: ${(err as Error).message}`);
    console.log('[crash-survivor-recovery] ALERT reason=registry-invalid (identity cannot be verified; helper NEVER invoked)');
    console.log('[crash-survivor-recovery] PAUSED member=unknown session=unknown no-duplicate-launch no-pty-spawn no-helper-invoked reason=registry-invalid');
    return 2;
  }
  const pausedNoHelper = (reason: string): number => {
    console.log(`[crash-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn no-helper-invoked reason=${reason} (fail-closed; no PID kill)`);
    return 1;
  };
  console.log(`[crash-survivor-recovery] REGISTRY path=${registryPath} session=${registry.sessionId} member=${registry.memberId} childPid=${registry.childPid} mainPid=${registry.mainPid} lastIntent=${registry.lastIntent} schema=${registry.schema} v${registry.version}`);
  console.log(`[crash-survivor-recovery] IDENTITY child pid=${registry.childPid} created=${registry.childCreationTime} name=${registry.childName} parentPid=${registry.childParentPid}`);
  console.log(`[crash-survivor-recovery] IDENTITY main pid=${registry.mainPid} created=${registry.mainCreationTime}`);
  console.log('[crash-survivor-recovery] NO-DUPLICATE no PTY spawn, no sidecar spawn in recovery (read-only until verified cleanup)');
  // Current-PID lookup by CIM before acting.
  let current: SurvivorIdentity | null;
  try {
    current = await lookupSingleProcess(registry.childPid, 'crash-survivor', 15000);
  } catch (err) {
    console.error(`[crash-survivor-recovery] FAIL: identity lookup failed: ${(err as Error).message} (no pass)`);
    console.log(`[crash-survivor-recovery] ALERT reason=identity-lookup-failed pid=${registry.childPid} (identity cannot be verified; helper NEVER invoked)`);
    console.log(`[crash-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn no-helper-invoked reason=identity-lookup-failed`);
    return 2;
  }
  if (current === null) {
    console.log(`[crash-survivor-recovery] ALERT reason=child-absent pid=${registry.childPid} (saved identity absent in CIM; nothing to clean; helper NEVER invoked)`);
    return pausedNoHelper('child-absent');
  }
  console.log(`[crash-survivor-recovery] CURRENT pid=${current.pid} created=${current.creationTime} name=${current.name} parentPid=${current.parentPid}`);
  if (current.creationTime !== registry.childCreationTime) {
    console.log(`[crash-survivor-recovery] ALERT reason=creation-mismatch pid=${registry.childPid} saved=${registry.childCreationTime} current=${current.creationTime} (PID reused or tampered registry; helper NEVER invoked)`);
    return pausedNoHelper('creation-mismatch');
  }
  // Exact survivor so far. Check RECORDED parent+name for internal
  // consistency before touching anything.
  if (registry.childParentPid !== registry.mainPid) {
    console.log(`[crash-survivor-recovery] ALERT reason=recorded-parent-inconsistent childParentPid=${registry.childParentPid} mainPid=${registry.mainPid} (registry inconsistent; helper NEVER invoked)`);
    return pausedNoHelper('recorded-parent-inconsistent');
  }
  if (current.parentPid !== registry.childParentPid) {
    console.log(`[crash-survivor-recovery] ALERT reason=live-parent-inconsistent liveParentPid=${current.parentPid} savedParentPid=${registry.childParentPid} (helper NEVER invoked)`);
    return pausedNoHelper('live-parent-inconsistent');
  }
  if (registry.childName.toLowerCase() !== 'node.exe') {
    console.log(`[crash-survivor-recovery] ALERT reason=recorded-name-inconsistent childName=${registry.childName} (want node.exe; helper NEVER invoked)`);
    return pausedNoHelper('recorded-name-inconsistent');
  }
  if (current.name.toLowerCase() !== 'node.exe') {
    console.log(`[crash-survivor-recovery] ALERT reason=live-name-inconsistent liveName=${current.name} (want node.exe; helper NEVER invoked)`);
    return pausedNoHelper('live-name-inconsistent');
  }
  if (current.name.toLowerCase() !== registry.childName.toLowerCase()) {
    console.log(`[crash-survivor-recovery] ALERT reason=live-name-mismatch liveName=${current.name} savedName=${registry.childName} (helper NEVER invoked)`);
    return pausedNoHelper('live-name-mismatch');
  }
  // Exact survivor with consistent recorded identity: invoke the
  // verified-identity stop helper with the SAVED identity. The helper
  // re-verifies creation on its SAME opened handle.
  console.log(`[crash-survivor-recovery] HELPER-INVOKED pid=${registry.childPid} (verified-identity-stop.ps1 with saved PID+creation; helper re-checks on its SAME handle)`);
  let helper: { code: number; output: string };
  try {
    helper = await runVerifiedStopHelper(registry.childPid, registry.childCreationTime, {
      scenarioLabel: 'crash-survivor',
      recoveryLogPrefix: 'crash-survivor-recovery',
      helperScriptPath: resolveVerifiedStopScriptPath(),
    });
  } catch (err) {
    console.log(`[crash-survivor-recovery] ALERT reason=helper-harness-failure detail=${(err as Error).message.slice(0, 200)} (no fallback PID kill)`);
    console.log(`[crash-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn helper-failed (fail-closed; no PID kill)`);
    return 1;
  }
  const stopped = helper.code === 0 && /\[verified-stop\] STOPPED/.test(helper.output);
  if (!stopped) {
    const refused = helper.code === 1 && /\[verified-stop\] REFUSED/.test(helper.output);
    console.log(`[crash-survivor-recovery] ALERT reason=helper-not-stopped exit=${helper.code} refused=${refused} (want exit 0 + STOPPED; no fallback PID kill)`);
    console.log(`[crash-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn helper-failed (fail-closed; no PID kill)`);
    return 1;
  }
  console.log(`[crash-survivor-recovery] ok: helper STOPPED exit 0 for pid=${registry.childPid}`);
  // Re-enumerate the EXACT identity gone (bounded, read-only).
  const deadline = Date.now() + 10000;
  let attempts = 0;
  // biome-ignore lint: bounded poll loop
  while (true) {
    attempts += 1;
    let cur: SurvivorIdentity | null = null;
    try {
      cur = await lookupSingleProcess(registry.childPid, 'crash-survivor', 15000);
    } catch (err) {
      console.error(`[crash-survivor-recovery] FAIL: post-cleanup lookup failed: ${(err as Error).message} (no pass)`);
      console.log(`[crash-survivor-recovery] ALERT reason=post-cleanup-lookup-failed pid=${registry.childPid} (cleanup outcome unverified; no fallback PID kill)`);
      console.log(`[crash-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn helper-attempted reason=post-cleanup-lookup-failed`);
      return 2;
    }
    if (cur === null || cur.creationTime !== registry.childCreationTime) break;
    if (Date.now() >= deadline) {
      console.log(`[crash-survivor-recovery] ALERT reason=survivor-still-alive pid=${registry.childPid} attempts=${attempts} (helper STOPPED but exact identity still present; no fallback PID kill)`);
      console.log(`[crash-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn helper-stopped-but-alive (fail-closed; no PID kill)`);
      return 1;
    }
    await sleepMs(250);
  }
  console.log(`[crash-survivor-recovery] CLEANED pid=${registry.childPid} (exact PID+creation gone, attempts=${attempts}, helper STOPPED exit 0)`);
  console.log(`[crash-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn helper-stopped (recovery paused; no duplicate member launched)`);
  return 0;
}
