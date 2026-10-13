'use strict';
const { createStrictAskMonitor } = require('./strict-ask-monitor');

async function createStrictAskInputGate({ context, send, stop, api, intervalMs }) {
  if (typeof send !== 'function' || typeof stop !== 'function') throw new Error('strict ask input handlers invalid');
  let closed = false, latched = false, reason, queue = Promise.resolve();
  const monitor = await createStrictAskMonitor({ context, api, intervalMs, suspend: async event => {
    // Close input before awaiting ownership checks or interrupt transport; stop never waits for the send queue.
    latched = true; reason = event.reason;
    return stop(event);
  } });
  const status = () => ({ status: closed ? 'closed' : latched || monitor.status().status !== 'armed' ? 'blocked' : 'open',
    monitor: monitor.status(), ...(reason ? { reason } : {}) });
  const blocked = () => ({ status: 'blocked', reason: closed ? 'input-closed' : reason || 'permission-state-unverified' });

  function submit(text) {
    if (typeof text !== 'string' || text.length === 0 || text.length > 64000) return Promise.resolve({ status: 'blocked', reason: 'input-invalid' });
    const operation = queue.then(async () => {
      if (closed || latched || monitor.status().status !== 'armed') return blocked();
      const checked = await monitor.check();
      if (closed || latched || checked.status !== 'armed') return blocked();
      try { return { status: 'submitted', value: await send(text) }; }
      catch {
        // Delivery may have happened. Close subsequent input and let the owner reconcile the session.
        latched = true; reason = 'delivery-unverified';
        return { status: 'delivery-unverified' };
      }
    }).catch(() => {
      latched = true; reason = 'input-state-unverified';
      return { status: 'input-state-unverified' };
    });
    queue = operation;
    return operation;
  }

  async function close() {
    closed = true;
    await Promise.all([monitor.close(), queue]);
    return status();
  }

  return { submit, check: monitor.check, status, close };
}

module.exports = { createStrictAskInputGate };
