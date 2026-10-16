'use strict';
const {once}=require('node:events'),{profileFor}=require('./profiles');
const fs=require('node:fs'),path=require('node:path'),{createLoopTrace}=require('./loop-trace'),{createProducerTrace}=require('./producer-trace');
const member=Number(process.argv[2]),profile=profileFor(process.argv[3]);
if(!Number.isInteger(member)||member<0||member>4)throw Error('invalid-member');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
if(!fs.existsSync(path.join(process.cwd(),'.owner')))throw Error('producer-owned-root-required');
const loop=member===0?createLoopTrace({clock:()=>performance.now(),periodMs:20,thresholdMs:20,schedule:setInterval,cancel:clearInterval,domain:'producer-monotonic'}):null;
const ackTrace=member===0?createProducerTrace({clock:()=>performance.now(),write:(text,callback)=>process.stdout.write(text,callback)}):null;
let running=false,probe=0;
process.stdin.on('data',chunk=>{for(const letter of chunk.toString()){
  if(letter==='g'&&!running){running=true;loop?.start();flood().catch(()=>process.exit(1));}
  if(letter==='x'&&running){const inputReceivedMs=performance.now(),ordinal=++probe,text=`\x1b7\x1b[1;1H\x1b[2KS5_ACK_${member}_${ordinal}\x1b8`;if(ackTrace)ackTrace.ack(ordinal,text,inputReceivedMs);else process.stdout.write(text);}
}});
process.stdin.resume();process.stdout.write(`FLOOD_READY_${member}\r\n`);
async function flood(){
  const start=performance.now();let records=0;process.stdout.write('\x1b[2;12r\x1b[12;1H');
  while(performance.now()-start<profile.mixedMs){
    const burst=(performance.now()-start)%profile.cycleMs<profile.floodMs;let batch='';
    for(let index=0;index<(burst?8:1);index++)batch+=`\x1b[36mMIXED m=${member} seq=${records++} العربية 日本語 ${'public '.repeat(burst?24:2)}\x1b[0m\r\n`;
    if(!process.stdout.write(batch))await once(process.stdout,'drain');await new Promise(resolve=>setTimeout(resolve,burst?10:500));
  }
  if(loop){loop.stop();fs.writeFileSync(path.join(process.cwd(),'s5-producer-0.json'),JSON.stringify({schema:'tiye-s5-producer-ack-v1',member,loop:loop.snapshot(),ack:ackTrace.snapshot()}),{flag:'wx'});}
  process.stdout.write(`\x1b[r\r\nFLOOD_END_${member} records=${records} elapsed=${Math.floor(performance.now()-start)}\r\n`,()=>{process.stdin.pause();process.stdin.destroy();});
}
