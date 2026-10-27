'use strict';
const { decodeCanonical } = require('../core/dist/record');
const { exactFields, requireCore, UUID, validText } = require('../core/dist/command');

const MODES = Object.freeze(['normal', 'exit-before', 'exit-after', 'hang-before', 'hang-after',
  'barrier-before', 'barrier-after', 'result-hold', 'bad-ready', 'bad-result', 'duplicate-result',
  'truncated-result', 'wrong-id', 'extra-output', 'no-write', 'duplicate-write', 'conflict-write', 'write-abort']);
function validMode(mode) { return MODES.includes(mode); }
function control(record) {
  requireCore(record && record.version === 1, 'mock-version');
  if (record.type === 'mock.worker.stop') { exactFields(record, ['type', 'version']); return record; }
  exactFields(record, ['type','version','effectId','attemptId','targetId','operation','payloadHash','expiresAt']);
  requireCore(record.type === 'mock.worker.invoke' && record.operation === 'mock.record', 'mock-operation');
  for (const key of ['effectId','attemptId','targetId']) requireCore(typeof record[key] === 'string' && UUID.test(record[key]), 'mock-id');
  requireCore(typeof record.payloadHash === 'string' && /^[0-9a-f]{64}$/.test(record.payloadHash)
    && Number.isSafeInteger(record.expiresAt) && record.expiresAt >= 0, 'mock-invocation');
  return record;
}
function output(record) {
  requireCore(record && record.version === 1, 'mock-version');
  if (['mock.worker.ready','mock.worker.stopped'].includes(record.type)) exactFields(record,['type','version']);
  else if (record.type === 'mock.worker.barrier') {
    exactFields(record,['type','version','phase']); requireCore(['before_write','after_write'].includes(record.phase),'mock-barrier');
  } else {
    exactFields(record,['type','version','effectId','attemptId','status','summary']);
    requireCore(record.type === 'mock.worker.result' && UUID.test(record.effectId) && UUID.test(record.attemptId)
      && record.status === 'done' && validText(record.summary),'mock-result');
  }
  return record;
}
function encode(record) { return JSON.stringify(record) + '\n'; }
class Lines {
  constructor(accept) { this.accept=accept; this.pending=Buffer.alloc(0); this.total=0; }
  feed(block) {
    this.total += block.length; requireCore(this.total <= 65536,'mock-output-bound');
    let offset=0;
    while(offset < block.length) {
      const end=block.indexOf(10,offset), part=block.subarray(offset,end < 0 ? block.length : end);
      requireCore(this.pending.length + part.length <= 16384,'mock-frame-bound');
      this.pending=Buffer.concat([this.pending,part]);
      if(end < 0) break;
      const record=decodeCanonical(this.pending); this.pending=Buffer.alloc(0); this.accept(record); offset=end+1;
    }
  }
  end() { requireCore(this.pending.length === 0,'mock-truncated-frame'); }
}
module.exports={ MODES, validMode, control, output, encode, Lines };
