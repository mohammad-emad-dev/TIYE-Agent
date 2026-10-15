'use strict';
const {spawn}=require('node:child_process'),path=require('node:path'),{StringDecoder}=require('node:string_decoder');
class FeedClient{
  constructor(nodeBinary,root){
    this.worker=spawn(nodeBinary,[path.join(__dirname,'feed-worker.cjs'),root],{cwd:root,env:{SystemRoot:process.env.SystemRoot||'C:\\Windows'},windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.nextId=0;this.pending=new Map();this.decoder=new StringDecoder('utf8');this.buffer='';this.closed=false;
    this.worker.stderr.resume();
    this.exit=new Promise((resolve,reject)=>{this.worker.once('error',reject);this.worker.once('close',code=>{
      this.closed=true;
      if(code!==0||this.pending.size||this.buffer){const error=Error('feed-worker-exit '+code);this.rejectPending(error);reject(error);}else resolve(code);
    });});this.exit.catch(()=>{});
    this.worker.stdout.on('data',chunk=>{try{this.receive(this.decoder.write(chunk));}catch(error){this.rejectPending(error);this.worker.kill();}});
    this.worker.stdout.on('end',()=>{try{this.receive(this.decoder.end());if(this.buffer)throw Error('truncated-response');}catch(error){this.rejectPending(error);}});
    this.worker.stdin.on('error',error=>this.rejectPending(error));
  }
  rejectPending(error){for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(error);}this.pending.clear();}
  receive(text){
    this.buffer+=text;if(Buffer.byteLength(this.buffer)>262144)throw Error('oversized-response');
    let newline;
    while((newline=this.buffer.indexOf('\n'))>=0){
      const response=JSON.parse(this.buffer.slice(0,newline));this.buffer=this.buffer.slice(newline+1);
      const request=this.pending.get(response.id);if(!request||!response.payload||typeof response.payload!=='object')throw Error('uncorrelated-response');
      this.pending.delete(response.id);clearTimeout(request.timer);request.resolve(response.payload);
    }
  }
  request(action,page){
    if(this.closed||this.pending.size>=2)return Promise.reject(Error('feed-client-busy-or-closed'));
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
