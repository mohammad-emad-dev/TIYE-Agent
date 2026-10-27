'use strict';
// Fixed fixture worker. No core database, role handle, shell, network or child process.
const { randomUUID } = require('node:crypto');
const { requireCore, UUID } = require('../core/dist/command');
const { Lines, control, encode, validMode } = require('./protocol.cjs');
const { inspect, append } = require('./target.cjs');
const [directory,targetId,mode]=process.argv.slice(2);
requireCore(process.argv.length === 5 && UUID.test(targetId) && validMode(mode),'mock-worker-arguments');
const root=inspect(directory,targetId);
let invoked=false, ended=false, stopReceived=false, exitCode=0, held;
function send(record) { process.stdout.write(encode(record)); }
function exit(code) {
  if(ended) { if(code !== 0) exitCode=code; return; }
  ended=true; exitCode=code; clearInterval(held); process.stdin.pause();
  process.stdout.end(()=>process.exit(exitCode));
}
function hold(phase) { send({type:'mock.worker.barrier',version:1,phase}); held=setInterval(()=>{},1000); }
function invoke(record) {
  requireCore(!invoked && record.targetId === targetId,'mock-duplicate-or-wrong-target'); invoked=true;
  if(mode === 'exit-before') return exit(7);
  if(['hang-before','barrier-before'].includes(mode)) return hold('before_write');
  const {type,version,...invocation}=record;
  if(mode !== 'no-write') {
    append(root,mode === 'conflict-write' ? {...invocation,payloadHash:'0'.repeat(64)} : invocation,mode === 'write-abort');
    if(mode === 'duplicate-write') append(root,invocation);
  }
  if(mode === 'exit-after') return exit(7);
  if(['hang-after','barrier-after'].includes(mode)) return hold('after_write');
  const result={type:'mock.worker.result',version:1,effectId:invocation.effectId,attemptId:invocation.attemptId,status:'done',summary:'Fixed synthetic invocation finished'};
  if(mode === 'bad-result') result.actor='owner';
  if(mode === 'wrong-id') result.attemptId=randomUUID();
  if(mode === 'truncated-result') process.stdout.write(JSON.stringify(result));
  else { send(result); if(mode === 'duplicate-result') send(result); }
  if(mode === 'extra-output') process.stdout.write(Buffer.alloc(65537,65));
  if(mode === 'result-hold') { held=setInterval(()=>{},1000); return; }
  exit(0);
}
const lines=new Lines(candidate=>{
  const record=control(candidate);
  if(record.type === 'mock.worker.stop') {
    requireCore(!stopReceived,'mock-duplicate-stop'); stopReceived=true;
    if(['hang-before','hang-after'].includes(mode)) return;
    send({type:'mock.worker.stopped',version:1}); exit(0);
  } else invoke(record);
});
process.stdin.on('data',block=>{try{lines.feed(block);}catch{exit(8);}});
process.stdin.on('end',()=>{try{lines.end();}catch{exit(8);return;}if(!ended&&!held)exit(8);});
process.stdin.on('error',()=>exit(8));
if(mode === 'bad-ready') send({type:'mock.worker.ready',version:1,actor:'owner'});
else send({type:'mock.worker.ready',version:1});
