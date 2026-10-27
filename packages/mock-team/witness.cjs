'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const { requireCore } = require('../core/dist/command');
function environment() {
  const system=process.env.SystemRoot;
  requireCore(typeof system === 'string' && /^[A-Za-z]:\\/.test(system),'mock-system-root');
  return {SystemRoot:system,WINDIR:system,TEMP:os.tmpdir(),TMP:os.tmpdir(),
    PATH:[path.join(system,'System32'),path.join(system,'System32/WindowsPowerShell/v1.0'),path.dirname(process.execPath)].join(';')};
}
function run(mode,directory,plan) {
  return new Promise((resolve,reject)=>{
    let stdout=Buffer.alloc(0),stderrBytes=0,failed=false,exitSeen=false,terminating=false,closed=false,teardown;
    const child=spawn(process.execPath,[path.join(__dirname,'../core/test/witness.cjs'),mode,directory,plan.targetId],
      {cwd:directory,env:environment(),windowsHide:true,stdio:['pipe','pipe','pipe']});
    function fail() {
      if(closed||terminating)return;failed=true;terminating=true;child.kill();
      teardown=setTimeout(()=>reject(new Error('unverified fixed-observer exit')),5000);
    }
    const deadline=setTimeout(fail,10000);
    child.on('error',fail);
    child.on('exit',()=>{exitSeen=true;});
    child.stdout.on('data',block=>{if(stdout.length+block.length>16384)fail();else stdout=Buffer.concat([stdout,block]);});
    child.stderr.on('data',block=>{stderrBytes+=block.length;if(stderrBytes>8192)fail();});
    child.stdin.on('error',fail);
    child.on('close',code=>{
      closed=true;
      clearTimeout(deadline);clearTimeout(teardown);
      if(!exitSeen && child.pid) {reject(new Error('unverified fixed-observer identity'));return;}
      if(failed || code !== 0) {resolve({scope:'unavailable'});return;}
      try {const text=new TextDecoder('utf-8',{fatal:true}).decode(stdout),value=JSON.parse(text);
        requireCore(JSON.stringify(value)===text,'mock-observer-canonical');resolve(value);
      }catch{resolve({scope:'unavailable'});}
    });
    child.stdin.end(mode === 'create' ? '' : JSON.stringify({effectId:plan.effectId,attemptId:plan.attemptId}));
  });
}
async function createWitness(directory,plan) { requireCore((await run('create',directory,plan)).created === true,'mock-witness-create'); }
function observeWitness(directory,plan) { return run('observe',directory,plan); }
module.exports={ environment, createWitness, observeWitness };
