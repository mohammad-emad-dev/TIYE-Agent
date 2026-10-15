'use strict';
const phases=Object.freeze([
  {cols:100,rows:12,width:1500,height:950},{cols:60,rows:16,width:1100,height:1000},
  {cols:132,rows:10,width:1680,height:950},{cols:80,rows:20,width:1300,height:1000},{cols:100,rows:12,width:1500,height:950}
].map(Object.freeze));
function recordAt(member,sequence){return `REC m=${member} n=${String(sequence).padStart(4,'0')} ${'abcd'.repeat(20)} العربية 日本語 cafe\u0301` ;}
module.exports={phases,recordAt};
