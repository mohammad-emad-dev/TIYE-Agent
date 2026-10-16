'use strict';
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const {s1Require}=require('../toolchain'),{profileFor}=require('./profiles'),{createProbeReceiver}=require('./probe-transport');
const profile=profileFor(process.argv[5]);
const member=Number(process.argv[4]),nodeBinary=process.argv[2],root=process.argv[3];
if(!Number.isInteger(member)||member<0||member>4||!path.isAbsolute(nodeBinary)||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner')))throw Error('invalid-worker');
const terminal=s1Require('node-pty').spawn(nodeBinary,[path.join(__dirname,'producer.cjs'),String(member),process.argv[5]],{name:'xterm-256color',useConpty:true,useConptyDll:true,cols:100,rows:12,cwd:root,env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',TERM:'xterm-256color'}});
if(!process.send)throw Error('worker-ipc-required');
const modules=JSON.parse(require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'backend-modules.ps1'),String(process.pid)],{encoding:'utf8',windowsHide:true,timeout:15000}));
fs.writeFileSync(path.join(root,`backend-${member}.json`),JSON.stringify({workerPid:process.pid,useConptyDll:true,modules}),{flag:'wx'});
process.send({event:'producer-pid',pid:terminal.pid});
const loop=member===0?require('./loop-trace').createLoopTrace({clock:()=>performance.now(),periodMs:20,thresholdMs:20,schedule:setInterval,cancel:clearInterval,domain:'worker-monotonic'}):null;loop?.start();
const workerTrace=require('./worker-trace').createWorkerTrace(member,()=>performance.now(),packet=>process.send({...packet,transport:profile.probeTransport}));
let controlPaused=false,outputBlocked=false,tail='';
function flow(){if(controlPaused||outputBlocked)terminal.pause();else terminal.resume();}
process.stdout.on('drain',()=>{outputBlocked=false;flow();});
terminal.onData(text=>{workerTrace.ingress(text);tail=(tail+text).slice(-8192);if(!process.stdout.write(JSON.stringify({event:'chunk',text})+'\n')){outputBlocked=true;flow();}});
const receiver=createProbeReceiver({transport:profile.probeTransport,onProbe:ordinal=>{workerTrace.command(ordinal);workerTrace.writeStart(ordinal);terminal.write('x');workerTrace.writeEnd(ordinal);}});
process.on('message',command=>receiver.receive(command,'ipc'));
const input=readline.createInterface({input:process.stdin});
input.on('line',line=>{
  if(line.length>64)throw Error('invalid-control');const command=JSON.parse(line);
  if(command.action==='pause'){controlPaused=true;flow();}
  else if(command.action==='resume'){controlPaused=false;flow();}
  else if(command.action==='start')terminal.write('g');
  else if(command.action==='probe')receiver.receive(command,'pipe');
  else throw Error('invalid-control');
});
terminal.onExit(({exitCode})=>{
  if(loop){loop.stop();fs.writeFileSync(path.join(root,'s5-worker-0.json'),JSON.stringify({schema:'tiye-s5-worker-loop-v1',member,loop:loop.snapshot()}),{flag:'wx'});}
  const end=tail.match(new RegExp(`FLOOD_END_${member} records=(\\d+) elapsed=(\\d+)`));
  const producer=end?{records:Number(end[1]),elapsedMs:Number(end[2])}:null;
  process.stdout.write(JSON.stringify({event:'exit',exitCode,producer})+'\n',()=>setTimeout(()=>process.exit(exitCode===0?0:1),100));
});
