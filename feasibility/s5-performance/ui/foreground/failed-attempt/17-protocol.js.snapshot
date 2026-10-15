'use strict';
const {StringDecoder}=require('node:string_decoder');
function createDecoder(maxBytes){
  const decoder=new StringDecoder('utf8');let buffer='';
  function consume(text){
    buffer+=text;const messages=[];let newline;
    while((newline=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
      if(Buffer.byteLength(line)>maxBytes)throw Error('oversized-frame');messages.push(JSON.parse(line));
    }
    if(Buffer.byteLength(buffer)>maxBytes)throw Error('oversized-frame');
    return messages;
  }
  return {push:chunk=>consume(decoder.write(chunk)),finish:()=>{const messages=consume(decoder.end());if(buffer)throw Error('truncated-frame');return messages;}};
}
module.exports={createDecoder};
