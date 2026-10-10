// S1 step 9f crash-pty-survivor experiment (bounded Windows mock-detached
// descendant only, not a production crash guarantee).
//
// Controlled mock descendant launched by the mock CLI INSIDE the main-owned
// node-pty member tree: first main spawns ONE PTY member, writes
// `tree-detached`, observes the fixture's ready PID, captures exact
// PID+creation identities for the member root and the detached child while
// both live, requires child ParentProcessId==member-root PID and
// name==node.exe, atomically writes a SEPARATE versioned registry with
// lastIntent=run, prints READY, and holds. The runner alone terminates its
// owned Electron ChildProcess handle; a relaunched main reads the registry,
// verifies schema + intended origin/lineage + live PID+creation/name, and on
// success invokes scripts/verified-identity-stop.ps1 with the exact saved
// child identity (helper re-checks on its SAME handle), requiring STOPPED
// plus exact-gone re-enumeration. Mismatch/lookup error/helper refusal emit
// structured ALERT + PAUSED with no PID-only fallback and no duplicate PTY
// launch.
//
// Fixture contract (mock-cli/mock-detached-child.js, UNCHANGED here):
// detached spawn, stdio ignored, <=60s self-expiry. That puts a ~60s upper
// bound on every observation; anything near expiry is inconclusive, never a
// pass. If ConPTY kills the detached child on a host, the runner reports
// inconclusive with observations and the pass conditions are NOT weakened.
//
// Registry authenticity note: schema/version/lastIntent/member checks prove
// only that the file parses as THIS experiment's registry. They do NOT
// establish authenticity against same-user tampering (any local same-user
// process can rewrite the file). The tampered-creation scenario in
// scripts/run-crash-pty-survivor.js exercises exactly that fail-closed path.
// No HMAC secret is invented (a secret stored beside the registry would add
// no trust). Recovery never spawns a PTY and never launches a duplicate.
//
// Exit codes for the recovery mode:
//   0 = CLEANED (exact detached survivor verified, helper STOPPED exit 0,
//       exact gone, PAUSED with no duplicate)
//   1 = ALERT/PAUSED (fail-closed: absent, mismatched creation, inconsistent
//       recorded origin/lineage, helper refused/failed, or still alive after
//       the helper -- no fallback kill, no duplicate launch)
//   2 = harness failure (missing/malformed registry, lookup failure, timeout,
//       non-Windows -- never a pass)

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as pty from 'node-pty';
import {
  captureProcessWithRetry,
  lookupSingleProcess,
  resolveVerifiedStopScriptPath,
  runVerifiedStopHelper,
  sleepMs,
  writeRegistryAtomic,
  type CrashProcessIdentity,
} from './crash-identity';

export const CRASH_PTY_SURVIVOR_FLAG = '--crash-pty-survivor';
export const CRASH_PTY_SURVIVOR_RECOVERY_FLAG = '--crash-pty-survivor-recovery-check';
export const CRASH_PTY_SURVIVOR_REGISTRY_ENV = 'TIYE_CRASH_PTY_SURVIVOR_REGISTRY_PATH';
export const CRASH_PTY_SURVIVOR_REGISTRY_SCHEMA = 'tiye-crash-pty-survivor-registry';
export const CRASH_PTY_SURVIVOR_REGISTRY_VERSION = 1;
export const CRASH_PTY_SURVIVOR_MEMBER_ID = 'crash-pty-survivor-member';

export interface CrashPtySurvivorRegistry {
  schema: string;
  version: number;
  sessionId: string;
  memberId: string;
  mainPid: number;
  rootPid: number;
  rootCreationTime: string;
  rootName: string;
  childPid: number;
  childCreationTime: string;
  childName: string;
  childParentPid: number;
  lastIntent: string;
  createdAt: string;
}

export type PtySurvivorIdentity = CrashProcessIdentity;

function mockCliScriptPath(): string {
  return path.resolve(__dirname, '..', 'mock-cli', 'mock-cli.js');
}

function detachedFixtureScriptPath(): string {
  return path.resolve(__dirname, '..', 'mock-cli', 'mock-detached-child.js');
}

function resolvePtyNode(): string {
  if (process.versions.electron !== undefined) {
    const out = child_process.spawnSync('where.exe', ['node'], { encoding: 'utf8' });
    if (out.error) throw out.error;
    const first = (out.stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)[0];
    if (first !== undefined) return first;
    throw new Error('crash-pty-survivor: node not found on PATH (Electron hosts mock-cli on node)');
  }
  return process.execPath;
}

export function getCrashPtySurvivorRegistryPath(): string {
  const raw = (process.env[CRASH_PTY_SURVIVOR_REGISTRY_ENV] ?? '').trim();
  if (raw === '') {
    throw new Error(`crash-pty-survivor probe: ${CRASH_PTY_SURVIVOR_REGISTRY_ENV} is not set (runner must supply a test-specific registry path)`);
  }
  return raw;
}

export function parseCrashPtySurvivorRegistry(rawText: string, source: string): CrashPtySurvivorRegistry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`crash-pty-survivor recovery: registry at ${source} is not valid JSON (no pass)`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`crash-pty-survivor recovery: registry at ${source} is malformed (expected object, no pass)`);
  }
  const r = parsed as Record<string, unknown>;
  if (r['schema'] !== CRASH_PTY_SURVIVOR_REGISTRY_SCHEMA) {
    throw new Error(`crash-pty-survivor recovery: registry schema mismatch (want ${CRASH_PTY_SURVIVOR_REGISTRY_SCHEMA}, no pass)`);
  }
  if (r['version'] !== CRASH_PTY_SURVIVOR_REGISTRY_VERSION) {
    throw new Error(`crash-pty-survivor recovery: registry version mismatch (want ${CRASH_PTY_SURVIVOR_REGISTRY_VERSION}, no pass)`);
  }
  if (typeof r['sessionId'] !== 'string' || r['sessionId'] === '') {
    throw new Error('crash-pty-survivor recovery: registry sessionId missing/malformed (no pass)');
  }
  if (r['memberId'] !== CRASH_PTY_SURVIVOR_MEMBER_ID) {
    throw new Error('crash-pty-survivor recovery: registry memberId missing/malformed (no pass)');
  }
  if (!Number.isInteger(r['mainPid']) || (r['mainPid'] as number) <= 0) {
    throw new Error('crash-pty-survivor recovery: registry mainPid missing/malformed (no pass)');
  }
  if (!Number.isInteger(r['rootPid']) || (r['rootPid'] as number) <= 0) {
    throw new Error('crash-pty-survivor recovery: registry rootPid missing/malformed (no pass)');
  }
  if (typeof r['rootCreationTime'] !== 'string' || !Number.isFinite(Date.parse(r['rootCreationTime'] as string))) {
    throw new Error('crash-pty-survivor recovery: registry rootCreationTime missing/malformed (no pass)');
  }
  if (typeof r['rootName'] !== 'string' || r['rootName'] === '') {
    throw new Error('crash-pty-survivor recovery: registry rootName missing/malformed (no pass)');
  }
  if (!Number.isInteger(r['childPid']) || (r['childPid'] as number) <= 0) {
    throw new Error('crash-pty-survivor recovery: registry childPid missing/malformed (no pass)');
  }
  if (typeof r['childCreationTime'] !== 'string' || !Number.isFinite(Date.parse(r['childCreationTime'] as string))) {
    throw new Error('crash-pty-survivor recovery: registry childCreationTime missing/malformed (no pass)');
  }
  if (typeof r['childName'] !== 'string' || r['childName'] === '') {
    throw new Error('crash-pty-survivor recovery: registry childName missing/malformed (no pass)');
  }
  if (!Number.isInteger(r['childParentPid']) || (r['childParentPid'] as number) < 0) {
    throw new Error('crash-pty-survivor recovery: registry childParentPid missing/malformed (no pass)');
  }
  if (r['lastIntent'] !== 'run') {
    throw new Error('crash-pty-survivor recovery: registry lastIntent missing/invalid (want "run", no pass)');
  }
  if (typeof r['createdAt'] !== 'string' || !Number.isFinite(Date.parse(r['createdAt'] as string))) {
    throw new Error('crash-pty-survivor recovery: registry createdAt missing/malformed (no pass)');
  }
  return {
    schema: CRASH_PTY_SURVIVOR_REGISTRY_SCHEMA,
    version: CRASH_PTY_SURVIVOR_REGISTRY_VERSION,
    sessionId: r['sessionId'] as string,
    memberId: r['memberId'] as string,
    mainPid: r['mainPid'] as number,
    rootPid: r['rootPid'] as number,
    rootCreationTime: r['rootCreationTime'] as string,
    rootName: r['rootName'] as string,
    childPid: r['childPid'] as number,
    childCreationTime: r['childCreationTime'] as string,
    childName: r['childName'] as string,
    childParentPid: r['childParentPid'] as number,
    lastIntent: 'run',
    createdAt: r['createdAt'] as string,
  };
}

function formatPtySurvivor(id: PtySurvivorIdentity): string {
  return `pid=${id.pid} created=${id.creationTime} name=${id.name} parentPid=${id.parentPid}`;
}

/**
 * --crash-pty-survivor first mode. Spawns ONE main-owned PTY member running
 * the local mock CLI, sends its `tree-detached` fixture command, captures
 * member-root + detached-child PID+creation identities via CIM while both
 * live, requires the detached lineage (parentPid==rootPid) and node.exe
 * names, writes the distinct registry atomically, emits READY, stays alive.
 */
export async function runCrashPtySurvivor(): Promise<number> {
  const fail = (msg: string): number => {
    console.error(`[crash-pty-survivor] FAIL: ${msg}`);
    return 2;
  };
  let registryPath: string;
  try {
    registryPath = getCrashPtySurvivorRegistryPath();
  } catch (err) {
    return fail((err as Error).message);
  }
  if (process.platform !== 'win32') {
    return fail(`crash-pty-survivor is Windows-only (platform=${process.platform}, no pass claimed)`);
  }
  let term: pty.IPty | null = null;
  let ptyExitCode: number | null = null;
  const askGracefulBestEffort = (): void => {
    // Best-effort `exit` through the PTY so a FAILED run does not linger.
    // This only asks the mock CLI to stop itself; the detached fixture has
    // no stdin link (stdio ignored) and is left to its <=60s self-expiry.
    // Never a PID kill here: the detached identity may be unverified.
    if (term === null || ptyExitCode !== null) return;
    try {
      term.write('exit\r');
    } catch {
      /* already gone */
    }
  };
  try {
    const mockCli = mockCliScriptPath();
    if (!fs.existsSync(mockCli)) return fail(`mock-cli fixture missing: ${mockCli}`);
    if (!fs.existsSync(detachedFixtureScriptPath())) return fail(`detached fixture missing: ${detachedFixtureScriptPath()}`);
    const nodeBin = resolvePtyNode();
    console.log(`[crash-pty-survivor] spawning ONE main-owned PTY member: ${nodeBin} ${mockCli} (mock CLI only, no vendor CLI, no network)`);
    try {
      term = pty.spawn(nodeBin, [mockCli], {
        name: 'xterm-256color',
        cols: 100,
        rows: 30,
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color' },
      });
    } catch (err) {
      return fail(`member PTY spawn failed: ${(err as Error).message}`);
    }
    const member: pty.IPty = term;
    const sessionId = `s1-${Date.now().toString(36)}-ptysurvivor-pid${member.pid}`;
    console.log(`[crash-pty-survivor] member session ${sessionId} pid=${member.pid} (single PTY member, no duplicate)`);
    member.onExit(({ exitCode }) => {
      ptyExitCode = exitCode;
    });
    let tap = '';
    member.onData((d: string) => {
      tap += d;
    });
    const waitForTap = (re: RegExp, timeoutMs: number, label: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (re.test(tap)) {
            clearInterval(timer);
            console.log(`[crash-pty-survivor] ok: ${label}`);
            resolve();
          } else if (ptyExitCode !== null) {
            clearInterval(timer);
            reject(new Error(`${label}: PTY exited early (code ${ptyExitCode})`));
          } else if (Date.now() - start > timeoutMs) {
            clearInterval(timer);
            reject(new Error(`${label}: timeout waiting for ${re}`));
          }
        }, 50);
      });
    await waitForTap(/mock-cli/i, 15000, 'banner');
    member.write('tree-detached\r');
    await waitForTap(/tree-detached ready pid=(\d+)/i, 10000, 'detached descendant ready');
    const readyMatch = tap.match(/tree-detached ready pid=(\d+)/i);
    if (readyMatch === null) {
      askGracefulBestEffort();
      return fail('detached ready PID not observed in PTY output (no pass)');
    }
    const childPid = Number(readyMatch[1]);
    if (!Number.isInteger(childPid) || childPid <= 0) {
      askGracefulBestEffort();
      return fail(`detached ready PID malformed (${JSON.stringify(readyMatch[1])}, no pass)`);
    }
    const rootPid = member.pid;
    if (!Number.isInteger(rootPid) || rootPid <= 0) {
      askGracefulBestEffort();
      return fail('member root PID missing after detached command (no pass)');
    }
    if (childPid === rootPid) {
      askGracefulBestEffort();
      return fail(`detached PID ${childPid} equals member root PID (not a descendant, no pass)`);
    }
    console.log(`[crash-pty-survivor] detached ready pid=${childPid} under member root pid=${rootPid} (fixture <=60s self-expiry)`);
    let rootIdentity: PtySurvivorIdentity;
    try {
      rootIdentity = await captureProcessWithRetry(rootPid, 'member-root', 'crash-pty-survivor');
      console.log(`[crash-pty-survivor] ROOT ${formatPtySurvivor(rootIdentity)}`);
    } catch (err) {
      askGracefulBestEffort();
      return fail(`member-root identity capture failed: ${(err as Error).message} (no pass)`);
    }
    if (rootIdentity.parentPid !== process.pid) {
      askGracefulBestEffort();
      return fail(`member-root parentPid=${rootIdentity.parentPid} != Electron main pid=${process.pid} (not the intended main-owned PTY lineage, no pass)`);
    }
    let childIdentity: PtySurvivorIdentity;
    try {
      childIdentity = await captureProcessWithRetry(childPid, 'detached-child', 'crash-pty-survivor');
      console.log(`[crash-pty-survivor] DETACHED ${formatPtySurvivor(childIdentity)}`);
    } catch (err) {
      askGracefulBestEffort();
      return fail(`detached-child identity capture failed: ${(err as Error).message} (no pass)`);
    }
    if (childIdentity.parentPid !== rootIdentity.pid) {
      askGracefulBestEffort();
      return fail(`detached parentPid=${childIdentity.parentPid} != member-root pid=${rootIdentity.pid} (not the intended PTY-tree lineage, no pass)`);
    }
    if (childIdentity.name.toLowerCase() !== 'node.exe') {
      askGracefulBestEffort();
      return fail(`detached name=${childIdentity.name} != node.exe (unexpected runtime, no pass)`);
    }
    if (rootIdentity.name.toLowerCase() !== 'node.exe') {
      askGracefulBestEffort();
      return fail(`member-root name=${rootIdentity.name} != node.exe (unexpected runtime, no pass)`);
    }
    console.log(`[crash-pty-survivor] ok: lineage parentPid==rootPid (${childIdentity.parentPid}) and names node.exe (root + detached)`);
    const registry: CrashPtySurvivorRegistry = {
      schema: CRASH_PTY_SURVIVOR_REGISTRY_SCHEMA,
      version: CRASH_PTY_SURVIVOR_REGISTRY_VERSION,
      sessionId,
      memberId: CRASH_PTY_SURVIVOR_MEMBER_ID,
      mainPid: process.pid,
      rootPid: rootIdentity.pid,
      rootCreationTime: rootIdentity.creationTime,
      rootName: rootIdentity.name,
      childPid: childIdentity.pid,
      childCreationTime: childIdentity.creationTime,
      childName: childIdentity.name,
      childParentPid: childIdentity.parentPid,
      lastIntent: 'run',
      createdAt: new Date().toISOString(),
    };
    writeRegistryAtomic(registryPath, registry);
    const roundTrip = fs.readFileSync(registryPath, 'utf8');
    parseCrashPtySurvivorRegistry(roundTrip, registryPath);
    console.log(`[crash-pty-survivor] ok: durable registry written atomically to ${registryPath} (session=${sessionId} member=${CRASH_PTY_SURVIVOR_MEMBER_ID} rootPid=${rootIdentity.pid} childPid=${childIdentity.pid} mainPid=${process.pid} lastIntent=run schema=${CRASH_PTY_SURVIVOR_REGISTRY_SCHEMA} v${CRASH_PTY_SURVIVOR_REGISTRY_VERSION})`);
    console.log(`[crash-pty-survivor] READY registry=${registryPath} session=${sessionId} member=${CRASH_PTY_SURVIVOR_MEMBER_ID} rootPid=${rootIdentity.pid} childPid=${childIdentity.pid}`);
    console.log('[crash-pty-survivor] alive until runner kills this Electron process (no graceful exit here; detached fixture self-expires within 60s)');
    if (ptyExitCode !== null) {
      return fail('member PTY exited before READY settled (harness failure, no pass)');
    }
    // Fail-closed visibility if the member dies first while main stays alive:
    // staying alive with no member would mislead the runner's post-kill
    // lineage reading, so log loudly (the detached proof still decides).
    member.onExit((e) => {
      console.error(`[crash-pty-survivor] FAIL: member PTY exited before main kill (code=${e.exitCode}, no pass)`);
    });
    await new Promise<void>(() => {});
    return 0;
  } catch (err) {
    askGracefulBestEffort();
    return fail((err as Error).message);
  }
}

/**
 * --crash-pty-survivor-recovery-check. Read-only until the exact-survivor
 * path: no PTY spawn, no detached spawn, no duplicate member. Fail closed
 * with ALERT on absent / mismatched / inconsistent identities (never
 * invoking the helper there). On the exact detached survivor with consistent
 * recorded origin/lineage, invoke the verified-identity stop helper with the
 * SAVED identity, require STOPPED exit 0, then re-enumerate the exact
 * identity gone. No fallback PID kill. The live parent PID is logged for
 * observation only: after abnormal main death the orphan may be reparented,
 * so only the RECORDED lineage (childParentPid==rootPid at capture) gates
 * the helper, plus the live PID+creation+name match.
 */
export async function runCrashPtySurvivorRecovery(): Promise<number> {
  let registryPath: string;
  try {
    registryPath = getCrashPtySurvivorRegistryPath();
  } catch (err) {
    console.error(`[crash-pty-survivor-recovery] FAIL: ${(err as Error).message}`);
    return 2;
  }
  if (process.platform !== 'win32') {
    console.error(`[crash-pty-survivor-recovery] FAIL: crash-pty-survivor recovery is Windows-only (platform=${process.platform}, no pass claimed)`);
    return 2;
  }
  if (!fs.existsSync(resolveVerifiedStopScriptPath())) {
    console.error('[crash-pty-survivor-recovery] FAIL: verified-identity-stop.ps1 missing (no pass)');
    return 2;
  }
  let raw: string;
  try {
    raw = fs.readFileSync(registryPath, 'utf8');
  } catch {
    console.error(`[crash-pty-survivor-recovery] FAIL: durable registry missing at ${registryPath} (no pass)`);
    console.log('[crash-pty-survivor-recovery] ALERT reason=registry-missing (identity cannot be verified; helper NEVER invoked)');
    console.log('[crash-pty-survivor-recovery] PAUSED member=unknown session=unknown no-duplicate-launch no-pty-spawn no-helper-invoked reason=registry-missing');
    return 2;
  }
  let registry: CrashPtySurvivorRegistry;
  try {
    registry = parseCrashPtySurvivorRegistry(raw, registryPath);
  } catch (err) {
    console.error(`[crash-pty-survivor-recovery] FAIL: ${(err as Error).message}`);
    console.log('[crash-pty-survivor-recovery] ALERT reason=registry-invalid (identity cannot be verified; helper NEVER invoked)');
    console.log('[crash-pty-survivor-recovery] PAUSED member=unknown session=unknown no-duplicate-launch no-pty-spawn no-helper-invoked reason=registry-invalid');
    return 2;
  }
  const pausedNoHelper = (reason: string): number => {
    console.log(`[crash-pty-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn no-helper-invoked reason=${reason} (fail-closed; no PID kill)`);
    return 1;
  };
  console.log(`[crash-pty-survivor-recovery] REGISTRY path=${registryPath} session=${registry.sessionId} member=${registry.memberId} rootPid=${registry.rootPid} childPid=${registry.childPid} mainPid=${registry.mainPid} lastIntent=${registry.lastIntent} schema=${registry.schema} v${registry.version}`);
  console.log(`[crash-pty-survivor-recovery] IDENTITY root pid=${registry.rootPid} created=${registry.rootCreationTime} name=${registry.rootName}`);
  console.log(`[crash-pty-survivor-recovery] IDENTITY detached pid=${registry.childPid} created=${registry.childCreationTime} name=${registry.childName} parentPid=${registry.childParentPid}`);
  console.log('[crash-pty-survivor-recovery] NO-DUPLICATE no PTY spawn, no detached spawn in recovery (read-only until verified cleanup)');
  // Recorded origin/lineage gates the helper BEFORE any live lookup.
  if (registry.childPid === registry.rootPid) {
    console.log(`[crash-pty-survivor-recovery] ALERT reason=recorded-lineage-inconsistent childPid=${registry.childPid} rootPid=${registry.rootPid} (not a descendant; helper NEVER invoked)`);
    return pausedNoHelper('recorded-lineage-inconsistent');
  }
  if (registry.childParentPid !== registry.rootPid) {
    console.log(`[crash-pty-survivor-recovery] ALERT reason=recorded-parent-inconsistent childParentPid=${registry.childParentPid} rootPid=${registry.rootPid} (registry inconsistent; helper NEVER invoked)`);
    return pausedNoHelper('recorded-parent-inconsistent');
  }
  if (registry.childName.toLowerCase() !== 'node.exe') {
    console.log(`[crash-pty-survivor-recovery] ALERT reason=recorded-name-inconsistent childName=${registry.childName} (want node.exe; helper NEVER invoked)`);
    return pausedNoHelper('recorded-name-inconsistent');
  }
  if (registry.rootName.toLowerCase() !== 'node.exe') {
    console.log(`[crash-pty-survivor-recovery] ALERT reason=recorded-root-name-inconsistent rootName=${registry.rootName} (want node.exe; helper NEVER invoked)`);
    return pausedNoHelper('recorded-root-name-inconsistent');
  }
  // Current-PID lookup by CIM before acting.
  let current: PtySurvivorIdentity | null;
  try {
    current = await lookupSingleProcess(registry.childPid, 'crash-pty-survivor', 15000);
  } catch (err) {
    console.error(`[crash-pty-survivor-recovery] FAIL: identity lookup failed: ${(err as Error).message} (no pass)`);
    console.log(`[crash-pty-survivor-recovery] ALERT reason=identity-lookup-failed pid=${registry.childPid} (identity cannot be verified; helper NEVER invoked)`);
    console.log(`[crash-pty-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn no-helper-invoked reason=identity-lookup-failed`);
    return 2;
  }
  if (current === null) {
    console.log(`[crash-pty-survivor-recovery] ALERT reason=detached-absent pid=${registry.childPid} (saved identity absent in CIM; nothing to clean; helper NEVER invoked)`);
    return pausedNoHelper('detached-absent');
  }
  console.log(`[crash-pty-survivor-recovery] CURRENT pid=${current.pid} created=${current.creationTime} name=${current.name} parentPid=${current.parentPid}`);
  console.log(`[crash-pty-survivor-recovery] LIVE-PARENT liveParentPid=${current.parentPid} savedParentPid=${registry.childParentPid} (observation only; orphans may reparent after main death, not a refusal cause)`);
  if (current.creationTime !== registry.childCreationTime) {
    console.log(`[crash-pty-survivor-recovery] ALERT reason=creation-mismatch pid=${registry.childPid} saved=${registry.childCreationTime} current=${current.creationTime} (PID reused or tampered registry; helper NEVER invoked)`);
    return pausedNoHelper('creation-mismatch');
  }
  if (current.name.toLowerCase() !== 'node.exe') {
    console.log(`[crash-pty-survivor-recovery] ALERT reason=live-name-inconsistent liveName=${current.name} (want node.exe; helper NEVER invoked)`);
    return pausedNoHelper('live-name-inconsistent');
  }
  if (current.name.toLowerCase() !== registry.childName.toLowerCase()) {
    console.log(`[crash-pty-survivor-recovery] ALERT reason=live-name-mismatch liveName=${current.name} savedName=${registry.childName} (helper NEVER invoked)`);
    return pausedNoHelper('live-name-mismatch');
  }
  // Exact detached survivor with consistent recorded origin/lineage: invoke
  // the verified-identity stop helper with the SAVED identity. The helper
  // re-verifies creation on its SAME opened handle.
  console.log(`[crash-pty-survivor-recovery] HELPER-INVOKED pid=${registry.childPid} (verified-identity-stop.ps1 with saved PID+creation; helper re-checks on its SAME handle)`);
  let helper: { code: number; output: string };
  try {
    helper = await runVerifiedStopHelper(registry.childPid, registry.childCreationTime, {
      scenarioLabel: 'crash-pty-survivor',
      recoveryLogPrefix: 'crash-pty-survivor-recovery',
      helperScriptPath: resolveVerifiedStopScriptPath(),
    });
  } catch (err) {
    console.log(`[crash-pty-survivor-recovery] ALERT reason=helper-harness-failure detail=${(err as Error).message.slice(0, 200)} (no fallback PID kill)`);
    console.log(`[crash-pty-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn helper-failed (fail-closed; no PID kill)`);
    return 1;
  }
  const stopped = helper.code === 0 && /\[verified-stop\] STOPPED/.test(helper.output);
  if (!stopped) {
    const refused = helper.code === 1 && /\[verified-stop\] REFUSED/.test(helper.output);
    console.log(`[crash-pty-survivor-recovery] ALERT reason=helper-not-stopped exit=${helper.code} refused=${refused} (want exit 0 + STOPPED; no fallback PID kill)`);
    console.log(`[crash-pty-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn helper-failed (fail-closed; no PID kill)`);
    return 1;
  }
  console.log(`[crash-pty-survivor-recovery] ok: helper STOPPED exit 0 for pid=${registry.childPid}`);
  // Re-enumerate the EXACT identity gone (bounded, read-only).
  const deadline = Date.now() + 10000;
  let attempts = 0;
  // biome-ignore lint: bounded poll loop
  while (true) {
    attempts += 1;
    let cur: PtySurvivorIdentity | null = null;
    try {
      cur = await lookupSingleProcess(registry.childPid, 'crash-pty-survivor', 15000);
    } catch (err) {
      console.error(`[crash-pty-survivor-recovery] FAIL: post-cleanup lookup failed: ${(err as Error).message} (no pass)`);
      console.log(`[crash-pty-survivor-recovery] ALERT reason=post-cleanup-lookup-failed pid=${registry.childPid} (cleanup outcome unverified; no fallback PID kill)`);
      console.log(`[crash-pty-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn helper-attempted reason=post-cleanup-lookup-failed`);
      return 2;
    }
    if (cur === null || cur.creationTime !== registry.childCreationTime) break;
    if (Date.now() >= deadline) {
      console.log(`[crash-pty-survivor-recovery] ALERT reason=survivor-still-alive pid=${registry.childPid} attempts=${attempts} (helper STOPPED but exact identity still present; no fallback PID kill)`);
      console.log(`[crash-pty-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn helper-stopped-but-alive (fail-closed; no PID kill)`);
      return 1;
    }
    await sleepMs(250);
  }
  console.log(`[crash-pty-survivor-recovery] CLEANED pid=${registry.childPid} (exact PID+creation gone, attempts=${attempts}, helper STOPPED exit 0)`);
  console.log(`[crash-pty-survivor-recovery] PAUSED member=${registry.memberId} session=${registry.sessionId} no-duplicate-launch no-pty-spawn helper-stopped (recovery paused; no duplicate member launched)`);
  return 0;
}
