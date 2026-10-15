import {Terminal} from '@xterm/xterm';
import {distribution} from './metrics';
const api=window.flood,sessions=[];
let active=false,started=0,lastFrame=0,visibilityLost=false,inputOrdinal=0,pendingInput=null;
const frameGaps=[],inputLatencies=[];
document.body.classList.toggle('focus',api.view==='focus');
for(let member=0;member<5;member++) {
  const card=document.createElement('section');card.className='member';card.innerHTML=`<h2>Member ${member+1}</h2><div></div>`;document.querySelector('main').append(card);
  const term=new Terminal({cols:100,rows:12,scrollback:500,cursorBlink:false,fontSize:12});term.open(card.querySelector('div'));
  const session={member,term,chunks:[],bytes:0,ordinal:0,pending:0};sessions.push(session);
  if(member===0) {
    term.onData(text=>{if(active&&text==='x'&&!pendingInput){pendingInput={ordinal:++inputOrdinal,start:performance.now()};api.input();}});
    term.onRender(()=>{
      if(!pendingInput)return;
      const buffer=term.buffer.active,line=buffer.getLine(buffer.viewportY)?.translateToString(true)||'';
      if(line.includes(`S5_ACK_0_${pendingInput.ordinal}`)){inputLatencies.push(performance.now()-pendingInput.start);api.rendered(pendingInput.ordinal);pendingInput=null;}
    });
  }
}
function frame(now){if(active){if(lastFrame)frameGaps.push(now-lastFrame);lastFrame=now;if(document.visibilityState!=='visible')visibilityLost=true;if(now-started>=60000)active=false;}requestAnimationFrame(frame);}
requestAnimationFrame(frame);
api.onChunk(packet=>{
  const session=sessions[packet.member];if(packet.ordinal!==session.ordinal++)throw Error('chunk-order');
  const bytes=new TextEncoder().encode(packet.text);session.chunks.push(bytes);session.bytes+=bytes.length;session.pending++;
  session.term.write(packet.text,()=>{session.pending--;api.ack(packet.member,packet.ordinal);});
});
window.__floodStart=()=>{started=performance.now();active=true;lastFrame=0;sessions[0].term.focus();return true;};
window.__floodFinish=async()=>{
  if(sessions.some(session=>session.pending))return null;active=false;
  const members=await Promise.all(sessions.map(async session=>{
    const bytes=new Uint8Array(session.bytes);let offset=0;for(const chunk of session.chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return {member:session.member,chunks:session.ordinal,bytes:session.bytes,sha256:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')};
  }));
  return {members,frameGaps,inputLatencies,inputEvents:inputOrdinal,missingInputs:pendingInput?1:0,visibilityLost,
    frameSummary:distribution(frameGaps),inputSummary:distribution(inputLatencies)};
};
api.ready();
