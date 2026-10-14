'use strict';
const {record}=require('../fixture');
const member=Number(process.argv[2]);
if(!Number.isInteger(member)||member<0||member>4) process.exit(1);
process.stdin.once('data',()=>{
  for(let sequence=0;sequence<40;sequence++) process.stdout.write(`\x1b[32m${record(member,sequence)}\x1b[0m\r\n`);
  process.stdin.pause();process.stdin.destroy();
});
process.stdin.resume();
