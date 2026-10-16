'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnDirectProducer}=require('../direct-producer');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
test('direct child echoes input, decodes split UTF8 and closes only after complete output',async()=>{
  const expected='ACK x العربية 日本語\r\n',source="process.stdin.once('data',input=>{const bytes=Buffer.from('ACK '+input.toString()+' العربية 日本語\\r\\n');process.stdout.write(bytes.subarray(0,7));setTimeout(()=>process.stdout.write(bytes.subarray(7),()=>process.stdin.destroy()),5);});";
  const terminal=spawnDirectProducer({nodeBinary:process.execPath,args:['-e',source],cwd:process.cwd(),env:{...process.env}});let text='';terminal.onData(chunk=>{text+=chunk;});
  const completed=new Promise(resolve=>terminal.onExit(resolve)),timer=setTimeout(()=>terminal.kill(),3000);terminal.pause();terminal.write('x');setTimeout(()=>terminal.resume(),20);
  try{const exit=await completed;assert.equal(text,expected);assert.equal(exit.exitCode,0);assert.equal(exit.signal,null);assert.equal(exit.stderrBytes,0);assert.equal(exit.stdoutBytes,Buffer.byteLength(expected));assert.equal(exit.stdoutSha256,hash(Buffer.from(expected)));assert.throws(()=>terminal.write('late'),/direct-producer-closed/);}finally{clearTimeout(timer);terminal.kill();}
});
test('raw hash exposes invalid UTF8 replacement and stderr/nonzero exit remain observable',async()=>{
  const terminal=spawnDirectProducer({nodeBinary:process.execPath,args:['-e',"process.stdout.write(Buffer.from([0xe2,0x82]));process.stderr.write('diagnostic');process.exitCode=3;"],cwd:process.cwd(),env:{...process.env}});let text='';terminal.onData(chunk=>{text+=chunk;});const completed=new Promise(resolve=>terminal.onExit(resolve)),timer=setTimeout(()=>terminal.kill(),3000);
  try{const exit=await completed;assert.equal(exit.exitCode,3);assert.equal(exit.stderrBytes,10);assert.equal(exit.stdoutBytes,2);assert.equal(exit.stdoutSha256,hash(Buffer.from([0xe2,0x82])));assert.notEqual(exit.stdoutSha256,hash(Buffer.from(text)));}finally{clearTimeout(timer);terminal.kill();}
});
