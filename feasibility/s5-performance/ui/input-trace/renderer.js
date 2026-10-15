import {Terminal} from '@xterm/xterm';
const chunkStages=new Map(),longTasks=[];const longTaskSupported=PerformanceObserver.supportedEntryTypes.includes('longtask');
if(longTaskSupported)new PerformanceObserver(list=>{for(const entry of list.getEntries()){if(longTasks.length>=10000)throw Error('longtask-trace-limit');longTasks.push({startMs:entry.startTime,durationMs:entry.duration});}}).observe({type:'longtask',buffered:true});
const api=window.combined,sessions=[],frames={grid:[],focus:[]},inputLatencies=[];
let view='grid',active=false,lastFrame=0,visibilityLost=false,pendingInput=null,inputOrdinal=0;
for(let member=0;member<5;member++){
  const card=document.createElement('section');card.innerHTML=`<h2>Member ${member+1}</h2><div></div>`;document.querySelector('#terminals').append(card);
  const term=new Terminal({cols:100,rows:12,scrollback:500,fontSize:11,cursorBlink:false});term.open(card.querySelector('div'));
  const session={member,term,bytes:0,chunks:0,pending:0,chain:new Uint8Array(32),queue:Promise.resolve()};sessions.push(session);
  if(member===0){term.onData(text=>{if(active&&text==='x'&&!pendingInput){pendingInput={ordinal:++inputOrdinal,start:performance.now(),view};api.input({ordinal:pendingInput.ordinal,rendererInputMs:pendingInput.start,queueDepth:session.pending});}});
    term.onRender(()=>{if(!pendingInput)return;const buffer=term.buffer.active,line=buffer.getLine(buffer.viewportY)?.translateToString(true)||'';
      if(line.includes(`S5_ACK_0_${pendingInput.ordinal}`)){inputLatencies.push({view:pendingInput.view,ms:performance.now()-pendingInput.start});const renderMs=performance.now();api.rendered({ordinal:pendingInput.ordinal,rendererInputMs:pendingInput.start,renderMs,chunkStages:chunkStages.get(pendingInput.ordinal)||[],longTaskSupported,longTasks:longTasks.filter(task=>task.startMs<renderMs&&task.startMs+task.durationMs>pendingInput.start)});pendingInput=null;}
    });}
}
api.onChunk(packet=>{
  const session=sessions[packet.member];if(packet.ordinal!==session.chunks++)throw Error('chunk-order');session.pending++;
  const receivedMs=performance.now(),probeOrdinals=packet.probeOrdinals||[];
  const bytes=new TextEncoder().encode(packet.text);session.bytes+=bytes.length;
  session.queue=session.queue.then(async()=>{
    const queueStartMs=performance.now();const combined=new Uint8Array(32+bytes.length);combined.set(session.chain);combined.set(bytes,32);
    session.chain=new Uint8Array(await crypto.subtle.digest('SHA-256',combined));
    const hashEndMs=performance.now();await new Promise(resolve=>session.term.write(packet.text,resolve));const writeEndMs=performance.now();
    for(const ordinal of probeOrdinals){const stages=chunkStages.get(ordinal)||[];stages.push({chunkOrdinal:packet.ordinal,receivedMs,queueStartMs,hashEndMs,writeEndMs});chunkStages.set(ordinal,stages);}session.pending--;api.ack(packet.member,packet.ordinal);
  });
});
function frame(now){if(active){if(lastFrame)frames[view].push(now-lastFrame);lastFrame=now;if(document.visibilityState!=='visible')visibilityLost=true;}requestAnimationFrame(frame);}
requestAnimationFrame(frame);
window.__combinedStart=()=>{active=true;lastFrame=0;sessions[0].term.focus();return true;};
window.__combinedView=next=>{view=next;document.body.classList.toggle('focus',view==='focus');document.querySelector('#view').textContent=view;sessions[0].term.focus();return view;};
window.__combinedSearch=async request=>{
  const start=performance.now(),response=await api.page(request),rows=document.querySelector('#rows');rows.replaceChildren();
  for(const event of response.rows){const row=document.createElement('div');row.className='row';row.dataset.id=String(event.id);row.textContent=event.text;rows.append(row);}
  document.querySelector('#feed-status').textContent=`${response.countAtQuery} persisted events · ${response.total} matches`;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const rect=rows.getBoundingClientRect(),children=[...rows.children];
  const report={token:response.token,view,ids:children.map(row=>Number(row.dataset.id)),text:children.map(row=>row.textContent),domRows:children.length,
    visible:children.every(row=>{const item=row.getBoundingClientRect();return item.top>=rect.top&&item.bottom<=rect.bottom;}),documentVisible:document.visibilityState==='visible',requestToRafMs:performance.now()-start};
  await api.report(report);return true;
};
window.__combinedFinish=async()=>{
  if(sessions.some(session=>session.pending))return null;active=false;await Promise.all(sessions.map(session=>session.queue));
  return {members:sessions.map(session=>({member:session.member,bytes:session.bytes,chunks:session.chunks,chain:Array.from(session.chain,byte=>byte.toString(16).padStart(2,'0')).join('')})),
    frames,inputLatencies,inputEvents:inputOrdinal,missingInputs:pendingInput?1:0,visibilityLost};
};
api.ready();
