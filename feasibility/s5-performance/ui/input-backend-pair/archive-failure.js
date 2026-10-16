'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
function archiveFailure(root,name,message){
  const destination=path.resolve(__dirname,'../../../../output/s5-input-backend-pair-failed-'+name);fs.mkdirSync(destination);
  const artifacts={},names=['prelaunch.json','trace-failure.json','host-stdout.log','host-stderr.log',...Array.from({length:5},(_,member)=>`backend-${member}.json`),...Array.from({length:5},(_,member)=>`member-${member}.log`)];
  const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
  for(const filename of names){const source=path.join(root,filename);if(!fs.existsSync(source))continue;const raw=fs.readFileSync(source),compressed=filename.startsWith('member-'),bytes=compressed?zlib.gzipSync(raw):raw,publicName=filename+(compressed?'.gz':'');fs.writeFileSync(path.join(destination,publicName),bytes,{flag:'wx'});artifacts[publicName]={sha256:hash(bytes),decodedSha256:hash(raw),decodedBytes:raw.length,encoding:compressed?'gzip':'identity'};}
  fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify({schema:'tiye-s5-backend-pair-failed-v1',profile:name,message,nativeCompleted:false,runtimeRetained:true,qualifying:false,artifacts},null,2)+'\n',{flag:'wx'});
}
module.exports={archiveFailure};
