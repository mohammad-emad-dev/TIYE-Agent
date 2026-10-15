import {Terminal} from '@xterm/xterm';
import {joinWrappedLines} from '../interaction/logical-lines';
function rowText(line){let end=line.length;while(end>0){const cell=line.getCell(end-1);if(cell.getChars()!==''||cell.getWidth()===0)break;end--;}return line.translateToString(false,0,end);}
function snapshot(term,member){
  const buffer=term.buffer.active,physical=[];
  for(let index=0;index<buffer.length;index++){const line=buffer.getLine(index);physical.push({isWrapped:line.isWrapped,text:rowText(line)});}
  return {cols:term.cols,rows:term.rows,baseY:buffer.baseY,cursorX:buffer.cursorX,cursorY:buffer.cursorY,physical,
    records:joinWrappedLines(physical).filter(line=>line.startsWith(`REC m=${member} n=`))};
}
const write=(term,text)=>new Promise(resolve=>term.write(text,resolve));
async function replay(input,mode,member){
  const cut=input.before.top[member].chunks,chunks=input.journal[member].chunks;
  const container=document.createElement('div');document.body.append(container);
  const term=new Terminal({cols:100,rows:12,scrollback:10000,windowsPty:input.before.top[member].windowsPty,fontSize:9});term.open(container);
  for(const text of chunks.slice(0,cut))await write(term,text);
  const checkpoints=[{stage:'prefix',...snapshot(term,member)}];
  if(mode==='resize-before'){
    term.resize(60,16);checkpoints.push({stage:'local-resize',...snapshot(term,member)});
  }
  for(let ordinal=cut;ordinal<chunks.length;ordinal++){
    await write(term,chunks[ordinal]);checkpoints.push({stage:'chunk',ordinal,...snapshot(term,member)});
    if(mode==='first-chunk-before-resize'&&ordinal===cut){term.resize(60,16);checkpoints.push({stage:'local-resize',...snapshot(term,member)});}
  }
  if(mode==='all-chunks-before-resize'){term.resize(60,16);checkpoints.push({stage:'local-resize',...snapshot(term,member)});}
  term.dispose();container.remove();return {mode,member,cut,chunkCount:chunks.length,checkpoints};
}
async function run(){
  const input=await window.replay.input(),observations=[];
  for(const mode of ['resize-before','first-chunk-before-resize','all-chunks-before-resize'])for(let member=0;member<5;member++)observations.push(await replay(input,mode,member));
  window.replay.complete({observations});
}
run().catch(error=>window.replay.failure(String(error.stack||error)));
