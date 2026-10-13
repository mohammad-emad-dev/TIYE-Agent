'use strict';
const path = require('node:path');
const { serviceApi } = require('./service-cli');
const { inspectStrictAsk } = require('./strict-ask-preflight');

async function createStrictAskMonitor({ context, suspend, api = serviceApi, intervalMs = 2000 }) {
  if (typeof context?.cwd !== 'string' || !path.isAbsolute(context.cwd) || context.cwd.includes('\0')
    || typeof context.projectDirectory !== 'string' || !path.isAbsolute(context.projectDirectory) || context.projectDirectory.includes('\0')
    || typeof context.projectID !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(context.projectID)
    || context.version !== '2.0.28' || !Number.isSafeInteger(context.servicePID) || context.servicePID <= 0
    || typeof suspend !== 'function' || typeof api !== 'function' || !Number.isInteger(intervalMs) || intervalMs < 20 || intervalMs > 60000) {
    throw new Error('strict ask monitor input invalid');
  }
  const pinned = Object.freeze({ ...context });
  let state = 'armed', reason, closed = false, timer, inFlight;
  const status = () => ({ status: closed ? 'closed' : state, ...(closed ? { disposition: state } : {}), ...(reason ? { reason } : {}) });

  function schedule() {
    if (!closed && state === 'armed') timer = setTimeout(() => { timer = undefined; void check(); }, intervalMs);
  }

  function check() {
    if (inFlight) return inFlight;
    if (closed || state !== 'armed') return Promise.resolve(status());
    clearTimeout(timer); timer = undefined;
    inFlight = (async () => {
      const inspected = await inspectStrictAsk(pinned.cwd, api);
      if (closed) return status();
      const current = inspected.context;
      const sameIdentity = current && ['cwd', 'projectID', 'projectDirectory', 'servicePID', 'version'].every(key => current[key] === pinned[key]);
      if (inspected.evidence.status === 'clear' && sameIdentity) return status();
      reason = inspected.evidence.status === 'clear' ? 'launch-identity-changed' : inspected.evidence.reason;
      // Latch before calling the adapter. A failed stop is never retried or auto-resumed.
      state = 'suspending';
      try {
        const stopped = await suspend({ reason });
        state = stopped?.verified === true ? 'suspended' : 'stop-unverified';
      } catch { state = 'stop-unverified'; }
      return status();
    })().finally(() => { inFlight = undefined; schedule(); });
    return inFlight;
  }

  async function close() {
    closed = true;
    clearTimeout(timer); timer = undefined;
    await inFlight;
    return status();
  }

  // The adapter must await this initial check before accepting input for its owned session.
  await check();
  return { check, close, status };
}

module.exports = { createStrictAskMonitor };
