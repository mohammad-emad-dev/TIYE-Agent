'use strict';


const SIZE = 5;

const isEpoch = (value) => Number.isInteger(value) && value >= 0;
const isMember = (value) => Number.isInteger(value) && value >= 0 && value < SIZE;
const isOrdinal = (value) => Number.isInteger(value) && value >= 0;

function createLedger() {
  let epoch = -1;
  let sent = new Array(SIZE).fill(0);
  let acked = new Array(SIZE).fill(0);

  function begin(nextEpoch) {
    if (!isEpoch(nextEpoch)) throw new TypeError('begin: epoch must be an integer >= 0');
    if (nextEpoch !== epoch + 1) throw new RangeError('begin: epoch must advance by exactly one');
    epoch = nextEpoch;
    sent = new Array(SIZE).fill(0);
    acked = new Array(SIZE).fill(0);
  }

  function dispatch(epochOf, member, ordinal) {
    if (!isEpoch(epochOf)) throw new TypeError('dispatch: epoch must be an integer >= 0');
    if (!isMember(member)) throw new TypeError('dispatch: member must be an integer in [0, 4]');
    if (!isOrdinal(ordinal)) throw new TypeError('dispatch: ordinal must be an integer >= 0');
    if (epochOf !== epoch) throw new RangeError('dispatch: epoch must equal the current epoch');
    if (ordinal !== sent[member]) throw new RangeError('dispatch: ordinal must equal sent[member]');
    sent[member] += 1;
  }

  function acknowledge(epochOf, member, ordinal) {
    if (!isEpoch(epochOf)) throw new TypeError('acknowledge: epoch must be an integer >= 0');
    if (!isMember(member)) throw new TypeError('acknowledge: member must be an integer in [0, 4]');
    if (!isOrdinal(ordinal)) throw new TypeError('acknowledge: ordinal must be an integer >= 0');
    if (epochOf < epoch) return false; // stale epoch: reject without mutating acked
    if (epochOf > epoch) throw new RangeError('acknowledge: cannot acknowledge a future epoch');
    if (ordinal !== acked[member] || ordinal >= sent[member]) {
      throw new RangeError('acknowledge: ordinal must equal acked[member] and be < sent[member]');
    }
    acked[member] += 1;
    return true;
  }

  function snapshot() {
    return { epoch, sent: sent.slice(), acked: acked.slice() };
  }

  return { begin, dispatch, acknowledge, snapshot };
}

module.exports = { createLedger };
