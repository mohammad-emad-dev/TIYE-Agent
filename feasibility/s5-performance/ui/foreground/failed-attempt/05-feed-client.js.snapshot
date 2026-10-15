'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),{createDecoder}=require('../mixed/protocol');
class FeedClient{
  constructor(nodeBinary,root){
    this.worker=spawn(nodeBinary,[path.join(__dirname,'feed-worker.cjs'),root],{cwd:root,env:{SystemRoot:process.env.SystemRoot||'C:\\Windows'},windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.nextId=0;this.pending=new Map();this.decoder=createDecoder(262144);this.closed=false;this.failure=null;
    this.worker.stderr.resume();
    this.exit=new Promise((resolve,reject)=>{this.worker.once('error',reject);this.worker.once('close',code=>{
      this.closed=true;
      if(code!==0||this.pending.size||this.failure){const error=this.failure||Error('feed-worker-exit '+code);this.rejectPending(error);reject(error);}else resolve(code);
    });});this.exit.catch(()=>{});
    this.worker.stdout.on('data',chunk=>{try{this.receive(this.decoder.push(chunk));}catch(error){this.rejectPending(error);this.worker.kill();}});
    this.worker.stdout.on('end',()=>{try{this.receive(this.decoder.finish());}catch(error){this.rejectPending(error);}});
    this.worker.stdin.on('error',error=>this.rejectPending(error));
    this.worker.once('error',error=>this.rejectPending(error));
  }
  rejectPending(error){this.failure=error;for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}this.pending.clear();}
  receive(messages){
    for(const response of messages){
      const request=this.pending.get(response.id);if(!request||!response.payload||typeof response.payload!=='object')throw Error('uncorrelated-response');
      this.pending.delete(response.id);clearTimeout(request.timer);request.resolve(response.payload);
    }
  }
  request(action,page){
    if(this.closed||this.failure||this.pending.size>=2)return Promise.reject(this.failure||Error('feed-client-busy-or-closed'));
    const id=++this.nextId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.rejectPending(Error('feed-worker-timeout'));this.worker.kill();},15000);
      this.pending.set(id,{resolve,reject,timer});
      this.worker.stdin.write(JSON.stringify({id,action,...(page?{page}:{})})+'\n');
    });
  }
  async close(){const response=await this.request('close');if(response.closed!==true)throw Error('feed-close-mismatch');await this.exit;}
}
module.exports={FeedClient};
