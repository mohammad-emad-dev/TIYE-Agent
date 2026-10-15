'use strict';
const member=Number(process.argv[2]),generation=Number(process.argv[3]);
if(!Number.isInteger(member)||member<0||member>4||![0,1].includes(generation))throw Error('invalid-producer');
let sequence=0;
const timer=setInterval(()=>{
  process.stdout.write(`REC member=${member} generation=${generation} seq=${sequence++}\r\n`);
  if(sequence===600){clearInterval(timer);process.stdout.write(`END member=${member} generation=${generation}\r\n`);}
},20);
