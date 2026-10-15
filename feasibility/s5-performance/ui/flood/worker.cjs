'use strict';
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const {s1Require}=require('../toolchain');
const member=Number(process.argv[4]),nodeBinary=process.argv[2],root=process.argv[3];
if(!Number.isInteger(member)||member<0||member>4||!path.isAbsolute(nodeBinary)||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner')))throw Error('invalid-worker');
const terminal=s1Require('node-pty').spawn(nodeBinary,[path.join(__dirname,'producer.cjs'),String(member)],{name:'xterm-256color',cols:100,rows:12,cwd:root,env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',TERM:'xterm-256color'}});
let controlPaused=false,outputBlocked=false,tail='';
function flow(){if(controlPaused||outputBlocked)terminal.pause();else terminal.resume();}
process.stdout.on('drain',()=>{outputBlocked=false;flow();});
terminal.onData(text=>{tail=(tail+text).slice(-8192);if(!process.stdout.write(JSON.stringify({event:'chunk',text})+'\n')){outputBlocked=true;flow();}});
const input=readline.createInterface({input:process.stdin});
input.on('line',line=>{
  if(line.length>64)throw Error('invalid-control');const command=JSON.parse(line);
  if(command.action==='pause'){controlPaused=true;flow();}
  else if(command.action==='resume'){controlPaused=false;flow();}
  else if(command.action==='start')terminal.write('g');
  else if(command.action==='probe')terminal.write('x');
  else throw Error('invalid-control');
});
terminal.onExit(({exitCode})=>{
  const end=tail.match(new RegExp(`FLOOD_END_${member} records=(\\d+) elapsed=(\\d+)`));
  const producer=end?{records:Number(end[1]),elapsedMs:Number(end[2])}:null;
  process.stdout.write(JSON.stringify({event:'exit',exitCode,producer})+'\n',()=>setTimeout(()=>process.exit(exitCode===0?0:1),100));
});
