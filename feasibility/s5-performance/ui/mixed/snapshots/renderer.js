'use strict';
const api=window.feed,viewport=document.querySelector('#viewport'),spacer=document.querySelector('#spacer'),rows=document.querySelector('#rows'),query=document.querySelector('#query');
const rowHeight=28,visibleRows=20;
let currentTotal=0,scrollOrdinal=0,probing=false;
const observations=[];
async function paintPage(request){
  const started=performance.now(),response=await api.page(request);
  if(!response||!Number.isInteger(response.total)||!Array.isArray(response.rows)||response.rows.length>visibleRows)throw Error('invalid-feed-response');
  rows.replaceChildren();spacer.style.height=Math.max(1,response.total)*rowHeight+'px';currentTotal=response.total;
  rows.style.top=request.offset*rowHeight+'px';
  for(const event of response.rows){
    const row=document.createElement('div');row.className='row';row.dataset.id=String(event.id);row.textContent=`${event.id} · ${event.kind} · member ${event.member+1} · ${event.text}`;rows.append(row);
  }
  document.querySelector('#status').textContent=`${response.total} events · ${rows.children.length} visible rows`;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const ids=[...rows.children].map(row=>Number(row.dataset.id)),renderedText=[...rows.children].map(row=>row.textContent);
  const viewportRect=viewport.getBoundingClientRect();
  const visible=ids.length>0&&[...rows.children].every(row=>{const rect=row.getBoundingClientRect();return rect.top>=viewportRect.top&&rect.bottom<=viewportRect.bottom;});
  const report={request,ids,renderedText,total:response.total,queryMs:response.queryMs,requestToRafMs:performance.now()-started,
    domRows:document.querySelectorAll('.row').length,visible,documentVisible:document.visibilityState==='visible'};
  observations.push(report);await api.rendered(report);return report;
}
viewport.addEventListener('scroll',()=>{
  if(probing)return;
  const ordinal=++scrollOrdinal;requestAnimationFrame(()=>{if(ordinal!==scrollOrdinal)return;const offset=Math.min(Math.max(0,currentTotal-visibleRows),Math.floor(viewport.scrollTop/rowHeight));paintPage({query:query.value,offset,limit:visibleRows}).catch(showError);});
});
document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();viewport.scrollTop=0;paintPage({query:query.value,offset:0,limit:visibleRows}).catch(showError);});
function showError(error){document.querySelector('#status').textContent=error.message;window.__feedError=error.message;}
window.__feedProbe=async()=>{
  probing=true;
  const baseline=await paintPage({query:'',offset:0,limit:visibleRows});
  viewport.scrollTop=(50000-visibleRows)*rowHeight;
  const tail=await paintPage({query:'',offset:50000-visibleRows,limit:visibleRows});
  viewport.scrollTop=0;
  const search=await paintPage({query:'needle',offset:0,limit:visibleRows});
  const empty=await paintPage({query:'absenttoken',offset:0,limit:visibleRows});
  const restored=await paintPage({query:'',offset:0,limit:visibleRows});
  probing=false;
  return {baseline,tail,search,empty,restored,observations:observations.length};
};
