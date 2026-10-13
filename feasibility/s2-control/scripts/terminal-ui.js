'use strict';
let sequence = 0;

function terminalUI(state, action, fields = {}) {
  const requestID = `ui-${++sequence}`;
  return new Promise((resolve, reject) => {
    const child = state.child;
    const finish = (error, response) => {
      clearTimeout(timer);
      child.off('message', receive); child.off('close', closed); child.off('error', closed);
      if (error) reject(error); else resolve(response);
    };
    const closed = () => finish(new Error('owned terminal UI closed'));
    const receive = response => {
      if (response?.type !== 'terminal-ui-result' || response.requestID !== requestID) return;
      finish(response.failed ? new Error('owned terminal UI action failed') : null, response);
    };
    const timer = setTimeout(() => finish(new Error('owned terminal UI deadline')), 5000);
    child.on('message', receive); child.once('close', closed); child.once('error', closed);
    child.send({ type: 'terminal-ui', requestID, action, ...fields }, error => { if (error) closed(); });
  });
}

module.exports = { terminalUI };
