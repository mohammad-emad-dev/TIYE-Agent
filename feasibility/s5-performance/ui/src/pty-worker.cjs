'use strict';
const path=require('node:path'),fs=require('node:fs');
const {s1Require}=require('../toolchain');
const pty=s1Require('node-pty');
const [nodeBinary,root,memberText]=process.argv.slice(2),member=Number(memberText);
if(!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner'))||!path.isAbsolute(nodeBinary)||!Number.isInteger(member)||member<0||member>4)throw Error('invalid-owned-worker-launch');
const terminal=pty.spawn(nodeBinary,[path.join(__dirname,'display-producer.cjs'),memberText],{name:'xterm-256color',cols:100,rows:12,cwd:root,env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',TERM:'xterm-256color'}});
let readyText='',started=false,exited=false;
terminal.onData(text=>{
  process.stdout.write(JSON.stringify({event:'chunk',text})+'\n');
  if(!started) {
    readyText=(readyText+text).slice(-1024);
    if(readyText.includes(`S5_READY_${member}`)) {started=true;setImmediate(()=>{if(!exited)terminal.write('GO\r');});}
  }
});
terminal.onExit(({exitCode})=>{
  exited=true;
  process.stdout.write(JSON.stringify({event:'exit',exitCode})+'\n',()=>setTimeout(()=>process.exit(exitCode===0?0:1),100));
});
