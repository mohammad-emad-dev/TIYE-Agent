import {Terminal} from '@xterm/xterm';
import {joinWrappedLines} from './logical-lines';
const api=window.interaction,sessions=[];
function rowText(line){let end=line.length;while(end>0){const cell=line.getCell(end-1);if(cell.getChars()!==''||cell.getWidth()===0)break;end--;}return line.translateToString(false,0,end);}
for(let member=0;member<5;member++){
  const card=document.createElement('section');card.innerHTML=`<h2>Member ${member+1}</h2><div class="holder"></div>`;document.querySelector('#terminals').append(card);
  const term=new Terminal({cols:100,rows:12,scrollback:10000,windowsPty:api.windowsPty,fontSize:9,cursorBlink:false});term.open(card.querySelector('.holder'));
  sessions.push({member,term,chunks:0,bytes:0,chain:new Uint8Array(32),queue:Promise.resolve()});
}
api.onChunk(packet=>{
  const session=sessions[packet?.member];if(!session||typeof packet.text!=='string'||packet.ordinal!==session.chunks++)throw Error('invalid-chunk');
  const bytes=new TextEncoder().encode(packet.text);session.bytes+=bytes.length;
  session.queue=session.queue.then(async()=>{const joined=new Uint8Array(32+bytes.length);joined.set(session.chain);joined.set(bytes,32);session.chain=new Uint8Array(await crypto.subtle.digest('SHA-256',joined));
    await new Promise(resolve=>session.term.write(packet.text,resolve));api.ack(packet.member,packet.ordinal);
  }).catch(error=>{api.failure(error.message);throw error;});
});
window.__interactionResize=async({cols,rows})=>{await Promise.all(sessions.map(session=>session.queue));for(const session of sessions){session.term.resize(cols,rows);session.term.element.parentElement.style.height=(rows*13+18)+'px';}return true;};
window.__interactionSnapshot=async action=>{
  await Promise.all(sessions.map(session=>session.queue));
  return sessions.map(session=>{
    const term=session.term;if(action==='top')term.scrollToTop();if(action==='middle')term.scrollLines(7);if(action==='bottom')term.scrollToBottom();
    const buffer=term.buffer.active,physical=[];for(let index=0;index<buffer.length;index++){const line=buffer.getLine(index);physical.push({isWrapped:line.isWrapped,text:rowText(line)});}
    const logical=joinWrappedLines(physical);
    return {member:session.member,windowsPty:term.options.windowsPty,bufferType:buffer.type,cols:term.cols,rows:term.rows,baseY:buffer.baseY,viewportY:buffer.viewportY,topLine:buffer.getLine(buffer.viewportY).translateToString(true),line7:buffer.getLine(7)?.translateToString(true)||'',
      records:logical.filter(line=>line.startsWith(`REC m=${session.member} n=`)),wrappedRows:physical.filter(line=>line.isWrapped).length,
      bytes:session.bytes,chunks:session.chunks,chain:Array.from(session.chain,byte=>byte.toString(16).padStart(2,'0')).join('')};
  });
};
window.addEventListener('error',event=>api.failure(event.message));window.addEventListener('unhandledrejection',event=>api.failure(String(event.reason)));api.ready();
