'use strict';
const {spawn}=require('node:child_process');
const path=require('node:path');

function sampleProcesses(registry){
  const pids=[...registry.keys()];
  if(!pids.length||pids.length>32||pids.some(pid=>!Number.isInteger(pid)||pid<=0))throw Error('invalid-owned-processes');
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'sample-processes.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',overflow=false,timedOut=false;
    const deadline=setTimeout(()=>{timedOut=true;child.kill();},10000);
    child.stdin.on('error',error=>{if(error.code!=='EPIPE')reject(error);});
    child.stdout.on('data',chunk=>{if(stdout.length+chunk.length>65536){overflow=true;child.kill();}else stdout+=chunk.toString();});
    child.stderr.on('data',chunk=>{if(stderr.length<4096)stderr+=chunk.toString();});
    child.once('error',error=>{clearTimeout(deadline);reject(error);});
    child.once('close',code=>{
      clearTimeout(deadline);
      if(code!==0||timedOut||overflow){reject(Error('resource-sampler-failed code='+code+' timeout='+timedOut+' overflow='+overflow+' diagnostics='+stderr));return;}
      try{const rows=JSON.parse(stdout);validateRows(rows,pids);resolve(rows);}catch(error){reject(error);}
    });
    child.stdin.end(JSON.stringify(pids));
  });
}
function validateRows(rows,pids){
  if(!Array.isArray(rows)||rows.length!==pids.length)throw Error('resource-sample-count');
  rows.forEach((row,index)=>{
    if(row.pid!==pids[index]||!['present','exited','unavailable'].includes(row.status))throw Error('resource-sample-identity');
    if(row.status!=='present')return;
    if(typeof row.identity!=='string'||!/^\d+$/.test(row.identity))throw Error('resource-sample-start');
    for(const field of ['sampledAtMs','cpuMs','workingSetBytes','privateBytes'])if(!Number.isFinite(row[field])||row[field]<0)throw Error('resource-sample-number');
  });
}
function redactRows(rows,registry,identities){
  return rows.map(row=>{
    const role=registry.get(row.pid);
    if(row.status!=='present')return {role,status:row.status};
    if(identities.has(role)&&identities.get(role)!==row.identity)return {role,status:'identity-changed'};
    identities.set(role,row.identity);
    return {role,status:'present',sampledAtMs:row.sampledAtMs,cpuMs:row.cpuMs,workingSetBytes:row.workingSetBytes,privateBytes:row.privateBytes};
  });
}
module.exports={sampleProcesses,validateRows,redactRows};
