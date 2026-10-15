'use strict';
const fs=require('node:fs'),path=require('node:path'),{recordAt}=require('./fixture');
const root=process.argv[2],member=Number(process.argv[3]);if(!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner'))||!Number.isInteger(member)||member<0||member>4)throw Error('owned-producer-required');
const expected=fs.openSync(path.join(root,`expected-${member}.jsonl`),'wx');let sequence=0,paused=false,partial='',ended=false;
const telemetry=fs.openSync(path.join(root,`control-${member}.jsonl`),'wx');
if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('tty-required');process.stdin.setRawMode(true);process.stdin.resume();
function finish(){if(ended)return;ended=true;clearInterval(timer);clearTimeout(deadline);fs.closeSync(expected);fs.closeSync(telemetry);process.stdout.write(`END m=${member} count=${sequence}\r\n`,()=>{process.stdin.pause();process.stdin.destroy();});}
const timer=setInterval(()=>{if(paused)return;const text=recordAt(member,sequence);fs.writeSync(expected,JSON.stringify({sequence,text})+'\n');process.stdout.write(text+'\r\n');if(++sequence===1000)finish();},20);
const deadline=setTimeout(()=>{clearInterval(timer);fs.closeSync(expected);process.exit(2);},45000);
process.stdin.on('data',bytes=>{partial+=bytes.toString();let boundary;while((boundary=partial.indexOf('\n'))>=0){
  const command=partial.slice(0,boundary).trim();partial=partial.slice(boundary+1);if(partial.length>128)throw Error('command-overflow');
  if(command==='GO')paused=false;
  else if(command==='FINISH')finish();
  else if(/^HOLD \d+$/.test(command)){paused=true;const token=Number(command.split(' ')[1]);fs.writeSync(telemetry,JSON.stringify({kind:'hold',token,count:sequence})+'\n');process.stdout.write(`HOLD m=${member} token=${token} count=${sequence}\r\n`);}
  else if(/^SIZE \d+$/.test(command)){const [cols,rows]=process.stdout.getWindowSize(),token=Number(command.split(' ')[1]);fs.writeSync(telemetry,JSON.stringify({kind:'size',token,cols,rows})+'\n');process.stdout.write(`SIZE m=${member} token=${token} cols=${cols} rows=${rows}\r\n`);}
  else throw Error('invalid-command');
}});
