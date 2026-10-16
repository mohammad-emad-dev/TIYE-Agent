'use strict';
const {spawn}=require('node:child_process'),{StringDecoder}=require('node:string_decoder'),crypto=require('node:crypto'),assert=require('node:assert/strict');
function spawnDirectProducer({nodeBinary,args,cwd,env}){
  const child=spawn(nodeBinary,args,{cwd,env,stdio:['pipe','pipe','pipe'],windowsHide:true}),decoder=new StringDecoder('utf8'),hash=crypto.createHash('sha256');
  let dataCallback,exitCallback,stdoutBytes=0,stderrBytes=0,closed=false;
  const fail=error=>{throw error;};child.once('error',fail);for(const stream of [child.stdin,child.stdout,child.stderr])stream.on('error',fail);
  function deliver(text){if(text){assert.equal(typeof dataCallback,'function');dataCallback(text);}}
  child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;});
  child.stdout.on('data',chunk=>{stdoutBytes+=chunk.length;hash.update(chunk);deliver(decoder.write(chunk));});
  child.once('close',(exitCode,signal)=>{closed=true;deliver(decoder.end());assert.equal(typeof exitCallback,'function');exitCallback({exitCode,signal,stderrBytes,stdoutBytes,stdoutSha256:hash.digest('hex')});});
  return {
    pid:child.pid,
    write(text){assert(!closed,'direct-producer-closed');return child.stdin.write(text);},
    pause(){child.stdout.pause();},resume(){child.stdout.resume();},
    onData(callback){assert.equal(dataCallback,undefined);dataCallback=callback;},
    onExit(callback){assert.equal(exitCallback,undefined);exitCallback=callback;},
    kill(){if(child.exitCode===null&&child.signalCode===null)child.kill();}
  };
}
module.exports={spawnDirectProducer};
