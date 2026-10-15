import {Terminal} from '@xterm/xterm';
const api=window.recovery,sessions=[];let epoch;
for(let member=0;member<5;member++){
  const card=document.createElement('section');card.innerHTML=`<h2>Member ${member+1}</h2><div></div>`;document.querySelector('#terminals').append(card);
  const term=new Terminal({cols:100,rows:12,scrollback:1000,fontSize:11,cursorBlink:false});term.open(card.querySelector('div'));
  sessions.push({member,term,chunks:0,bytes:0,chain:new Uint8Array(32),queue:Promise.resolve()});
}
api.onChunk(packet=>{
  if(packet?.epoch!==epoch||!Number.isInteger(packet.member)||packet.member<0||packet.member>4||typeof packet.text!=='string')throw Error('invalid-renderer-chunk');
  const session=sessions[packet.member];if(packet.ordinal!==session.chunks++)throw Error('renderer-order');
  const bytes=new TextEncoder().encode(packet.text);session.bytes+=bytes.length;
  session.queue=session.queue.then(async()=>{
    const joined=new Uint8Array(32+bytes.length);joined.set(session.chain);joined.set(bytes,32);session.chain=new Uint8Array(await crypto.subtle.digest('SHA-256',joined));
    await new Promise(resolve=>session.term.write(packet.text,resolve));api.ack({epoch,member:packet.member,ordinal:packet.ordinal});
  }).catch(error=>{api.failure(error.message);throw error;});
});
window.__recoveryFeed=events=>{
  const rows=document.querySelector('#rows');rows.replaceChildren();
  for(const event of events){const row=document.createElement('div');row.className='row';row.dataset.id=event.id;row.textContent=event.text;rows.append(row);}
  return {epoch,ids:[...rows.children].map(row=>Number(row.dataset.id)),text:[...rows.children].map(row=>row.textContent),domRows:rows.children.length};
};
window.__recoveryInspect=async()=>{
  await Promise.all(sessions.map(session=>session.queue));
  return {epoch,members:sessions.map(session=>{
    const lines=[];for(let index=0;index<session.term.buffer.active.length;index++)lines.push(session.term.buffer.active.getLine(index).translateToString(true).trim());
    const pattern=new RegExp(`^REC member=${session.member} generation=0 seq=(\\d+)$`);
    return {member:session.member,bytes:session.bytes,chunks:session.chunks,chain:Array.from(session.chain,byte=>byte.toString(16).padStart(2,'0')).join(''),
      records:lines.filter(line=>pattern.test(line)).map(line=>Number(line.match(pattern)[1])),ended:lines.includes(`END member=${session.member} generation=0`)};
  })};
};
window.addEventListener('error',event=>api.failure(event.message));window.addEventListener('unhandledrejection',event=>api.failure(String(event.reason)));
api.bootstrap().then(current=>{epoch=current;if(epoch===1)api.ack({epoch:0,member:0,ordinal:0,challenge:true});api.ready(epoch);}).catch(error=>api.failure(error.message));
