'use strict';
const { closePrivate, processInventory, ownedIdentities, waitUntil } = require('./persistent-cli');
const { ownedCrashTarget } = require('./recovery-evidence');

async function crashOwnedClient(request, servicePID) {
  const ready = request.readEvents().find(event => event.type === 'ready');
  const current = await processInventory();
  const identity = ownedCrashTarget({ pid: ready?.ptyPID, captured: request.state.captured,
    current: ownedIdentities(current, request.state.child.pid), rootPID: request.state.child.pid, servicePID });
  if (!identity) throw new Error('crash target ownership unverified');
  // Recheck the captured creation identity immediately before termination.
  const fresh = await processInventory();
  if (!ownedCrashTarget({ pid: identity.ProcessId, captured: [identity], current: ownedIdentities(fresh, request.state.child.pid), rootPID: request.state.child.pid, servicePID })) throw new Error('crash target identity changed');
  const startedAt = Date.now();
  process.kill(identity.ProcessId, 'SIGKILL');
  await waitUntil(() => request.readEvents().some(event => event.type === 'pty-exit') || request.state.closed, 10000);
  const exit = request.readEvents().filter(event => event.type === 'pty-exit');
  if (exit.length !== 1 || !Number.isFinite(exit[0].exitCode)) throw new Error('native CLI exit unverified');
  const cleanup = await closePrivate(request.state);
  return { crashTargetOwned: true, ptyExitObserved: true, ptyExitCode: exit[0].exitCode, ptyExitSignal: exit[0].signal ?? null, crashObservationMs: Date.now() - startedAt, firstClientCleanup: cleanup };
}

module.exports = { crashOwnedClient };
