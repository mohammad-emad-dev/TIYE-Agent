'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const { captureFive }=require('./capture');
async function runProbe() {
  const normal=await captureFive(1000,'normal'),rich=await captureFive(1000,'rich');
  const root=path.resolve(__dirname,'..');
  const files=['scripts/workload.js','scripts/producer.js','scripts/capture.js','scripts/run-ingress.js'];
  const evidence={schema:'tiye-s5-ingress-v1',recordedAt:new Date().toISOString(),platform:process.platform,node:process.version,
    countPerMember:1000,normal,rich,sourceHashes:Object.fromEntries(files.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')])),
    providerRequests:0,ptyMeasured:false,uiMeasured:false,inputLatencyMeasured:false,fullS5Qualified:false,productionEligible:false};
  fs.writeFileSync(path.join(root,'evidence.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({normalElapsedMs:normal.elapsedMs,richElapsedMs:rich.elapsedMs,fullS5Qualified:false}));
}
runProbe().catch(error=>{console.error(error);process.exitCode=1;});
