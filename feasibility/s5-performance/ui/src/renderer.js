import {Terminal} from '@xterm/xterm';
import {isChunk} from '../protocol';
import {record} from '../fixture';
const sessions=Array.from({length:5},(_,member)=>{
  const card=document.createElement('section');card.className='member';
  const heading=document.createElement('h2');heading.textContent=`Member ${member+1}`;card.append(heading);
  const element=document.createElement('div');card.append(element);document.querySelector('#grid').append(card);
  const term=new Terminal({cols:100,rows:12,scrollback:500,cursorBlink:false,allowProposedApi:false});term.open(element);
  return {member,term,receivedChunks:0,pending:0,bytes:0,chunks:[],failed:false};
});
document.body.classList.toggle('focus',window.s5.view==='focus');
window.s5.onChunk(packet=>{
  if(!isChunk(packet)) throw Error('invalid-member-chunk');
  const session=sessions[packet.member];
  if(packet.ordinal!==session.receivedChunks) {session.failed=true;return;}
  session.receivedChunks++;session.pending++;
  const bytes=new TextEncoder().encode(packet.text);session.bytes+=bytes.length;session.chunks.push(bytes);
  session.term.write(packet.text,()=>{session.pending--;});
});
window.__s5Finish=async()=>{
  if(sessions.some(session=>session.pending)) return null;
  return Promise.all(sessions.map(async session=>{
    if(session.failed) throw Error('out-of-order-member-data');
    const all=new Uint8Array(session.bytes);let offset=0;for(const chunk of session.chunks){all.set(chunk,offset);offset+=chunk.length;}
    const digest=await crypto.subtle.digest('SHA-256',all);
    const lines=[];const buffer=session.term.buffer.active;
    for(let index=0;index<buffer.length;index++) {
      const line=buffer.getLine(index),text=line.translateToString(true);
      if(line.isWrapped&&lines.length) lines[lines.length-1]+=text;else lines.push(text);
    }
    const recordsFound=Array.from({length:40},(_,sequence)=>record(session.member,sequence)).filter(expected=>lines.some(line=>line.includes(expected))).length;
    return {member:session.member,receivedChunks:session.receivedChunks,pending:session.pending,bytes:session.bytes,
      sha256:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join(''),recordsFound};
  }));
};
window.s5.ready();
