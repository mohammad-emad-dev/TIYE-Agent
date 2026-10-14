'use strict';
const {StringDecoder}=require('node:string_decoder');
function createWorkerDecoder() {
  const decoder=new StringDecoder('utf8');let buffer='',ended=false;
  return {
    push(chunk) {
      buffer+=decoder.write(chunk);
      if(buffer.length>1048576)throw Error('worker-frame-limit');
      const messages=[];let end;
      while((end=buffer.indexOf('\n'))>=0) {
        const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
        if(ended||!message||typeof message!=='object'||Array.isArray(message))throw Error('invalid-worker-message');
        if(message.event==='exit'&&Number.isInteger(message.exitCode))ended=true;
        else if(message.event!=='chunk'||typeof message.text!=='string'||message.text.length>1048576)throw Error('invalid-worker-message');
        messages.push(message);
      }
      return messages;
    },
    finish() {buffer+=decoder.end();if(buffer||!ended)throw Error('incomplete-worker-stream');}
  };
}
module.exports={createWorkerDecoder};
