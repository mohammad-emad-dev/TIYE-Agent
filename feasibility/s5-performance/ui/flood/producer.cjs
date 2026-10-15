'use strict';
const {once}=require('node:events');
const member=Number(process.argv[2]);if(!Number.isInteger(member)||member<0||member>4)process.exit(1);
if(process.stdin.isTTY)process.stdin.setRawMode(true);
let running=false,probe=0;
process.stdin.on('data',chunk=>{
  for(const letter of chunk.toString()) {
    if(letter==='g'&&!running){running=true;flood().catch(()=>process.exit(1));}
    if(letter==='x'&&running)process.stdout.write(`\x1b7\x1b[1;1H\x1b[2KS5_ACK_${member}_${++probe}\x1b8`);
  }
});
process.stdin.resume();process.stdout.write(`FLOOD_READY_${member}\r\n`);
async function flood() {
  const start=performance.now();let records=0;
  process.stdout.write('\x1b[2;12r\x1b[12;1H');
  while(performance.now()-start<60000) {
    let batch='';for(let index=0;index<8;index++)batch+=`\x1b[36mFLOOD m=${member} seq=${records++} العربية 日本語 ${'public '.repeat(24)}\x1b[0m\r\n`;
    if(!process.stdout.write(batch))await once(process.stdout,'drain');
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  process.stdout.write(`\x1b[r\r\nFLOOD_END_${member} records=${records} elapsed=${Math.floor(performance.now()-start)}\r\n`,()=>{process.stdin.pause();process.stdin.destroy();});
}
