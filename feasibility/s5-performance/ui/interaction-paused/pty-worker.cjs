'use strict';
const fs=require('node:fs'),path=require('node:path'),{s1Require}=require('../toolchain');
const [root,nodeBinary,memberText]=process.argv.slice(2),member=Number(memberText);
if(!process.send||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner'))||!path.isAbsolute(nodeBinary)||!Number.isInteger(member)||member<0||member>4)throw Error('owned-worker-required');
const terminal=s1Require('node-pty').spawn(nodeBinary,[path.join(__dirname,'producer.cjs'),root,memberText],{name:'xterm-256color',useConpty:true,cols:100,rows:12,cwd:root,env:{SystemRoot:process.env.SystemRoot||'C:\\Windows',TERM:'xterm-256color'}});
process.send({event:'producer-pid',pid:terminal.pid});terminal.onData(text=>process.send({event:'chunk',text}));
process.on('message',command=>{
  if(command?.action==='resize'&&Number.isInteger(command.cols)&&command.cols>=60&&command.cols<=132&&Number.isInteger(command.rows)&&command.rows>=10&&command.rows<=20&&Number.isInteger(command.token)){
    terminal.resize(command.cols,command.rows);terminal.write(`SIZE ${command.token}\n`);
  }else if(command?.action==='input'&&typeof command.text==='string'&&/^(GO|FINISH|HOLD \d+|SIZE \d+)\n$/.test(command.text))terminal.write(command.text);
  else throw Error('invalid-worker-command');
});
terminal.onExit(({exitCode})=>setTimeout(()=>process.send({event:'terminal-exit',exitCode},()=>process.exit(exitCode===0?0:1)),100));
