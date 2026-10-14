'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const cohorts=[['basics','run-basics','basicsPassed'],['dependencies','run-dependencies','dependenciesPassed'],['attribution','run-attribution','attributionPassed'],['cli-attribution','cli-attribution-evidence','cliAttributionPassed'],['trailer-policy','run-trailer-policy','trailerPolicyPassed'],['push-policy','run-push-policy','pushPolicyPassed'],['ownership','run-ownership','ownershipPassed'],['checkpoints','run-checkpoints','checkpointsPassed'],['shadow-checkpoints','run-shadow-checkpoints','shadowPassed'],['final-merge','run-final-merge','finalMergePassed'],['windows','run-windows','windowsPassed'],['windows-create','run-windows-create','windowsCreatePassed']];
const sections=[
 {id:'S3.1',cohorts:['basics','dependencies'],observed:'Disposable lifecycle, offline local dependency setup, merges/conflict abort, separate modules/shared cache and junction comparison',missing:['A4/representative project setup and cost','Broader package/project dependency matrix']},
 {id:'S3.2',cohorts:['attribution','cli-attribution','trailer-policy'],observed:'Synthetic identity/trailers, one standalone Muse shell identity and parent fallback commit, full member-range audit',missing:['Each supported CLI creating its own commits','CLI-specific extra trailers/author overrides','Shared-service launch propagation and durable session binding']},
 {id:'S3.3',cohorts:['push-policy'],observed:'Local bare-remote fixture approval and leases; three hook bypasses observed without local-ref changes',missing:['Provider CLI push refusal/reporting','Authenticated external remote route','Actual approval UI and durable push broker']},
 {id:'S3.4',cohorts:['ownership'],observed:'Controlled polling detection and fixture-approved selective recovery',missing:['Provider CLI burst edits and latency cohort','Outside-worktree detection scope','User/Leader notification and reviewed approval UI']},
 {id:'S3.5',cohorts:['checkpoints','shadow-checkpoints'],observed:'Raw file snapshots, fresh ordinary Git reader, safety snapshot, ignored preservation, shadow storage and tiny timings',missing:['Complete selected-change rollback semantics for deletions/modes/index','Global session/ownership reconstruction','Member suspension and approval/event-store coordination','Representative project timing']},
 {id:'S3.6',cohorts:['final-merge'],observed:'Fixture-approved pinned fast-forward final transfer; dirty/divergent/stale refusal and safety checkpoint',missing:['Real diff approval UI','Leader/integration test gates','Durable interrupted-merge reconciliation']},
 {id:'S3.7',cohorts:['windows','windows-create'],observed:'303-character ASCII path, casing preflight, raw CRLF and FileShare.None removal refusal through explicit wrappers',missing:['Other volumes/UNC/Unicode path policy','Additional sharing modes and atomic removal limits','Antivirus contribution and representative creation timing','Production adoption of explicit wrappers']},
];
function nativeRead(args){const result=spawnSync('git',args,{cwd:path.resolve(__dirname,'../../..'),windowsHide:true,timeout:20000,maxBuffer:9000000});if(result.error||result.status!==0)throw new Error('S3 historical Git read failed');return result.stdout;}
function assessS3({readFile=fs.readFileSync,gitRead=nativeRead}={}){
 const root=path.resolve(__dirname,'..'),inventory=[];const historyCache=new Map();function history(args){const key=JSON.stringify(args);if(!historyCache.has(key))historyCache.set(key,gitRead(args));return historyCache.get(key);}
 for(const [id,moduleName,predicateName]of cohorts){
  const qualificationPath='evidence/'+id+'-qualification.json',qualificationBytes=readFile(path.join(root,qualificationPath)),qualification=JSON.parse(qualificationBytes);
  const reference=qualification.supplementalReference,digest=qualification.supplementalSha256;
  if(typeof reference!=='string'||!/^supplements\/[a-z-]+\/[a-f0-9]{64}\/[a-z-]+\.json$/.test(reference)||path.posix.basename(path.posix.dirname(reference))!==digest)throw new Error('S3 sealed reference invalid');
  const sealedPath='evidence/'+reference,bytes=readFile(path.join(root,sealedPath)),latest=readFile(path.join(root,'evidence/'+id+'-latest.json')),record=JSON.parse(bytes),manifest=JSON.parse(readFile(path.join(root,path.dirname(sealedPath),'manifest.json')));
  if(!bytes.equals(latest)||sha(bytes)!==digest||manifest.records?.length!==1||manifest.records[0].name!==path.posix.basename(reference)||manifest.records[0].sha256!==digest)throw new Error('S3 seal or latest bytes mismatch');
  if(qualification.platform!=='win32'||record.platform!=='win32'||manifest.platform!=='win32'||qualification.versions?.git!=='git version 2.55.0.windows.5'||qualification.versions?.node!=='v26.7.0'
   ||record.git!==qualification.versions.git||record.node!==qualification.versions.node||Object.entries(qualification.versions).some(([key,value])=>manifest.versions?.[key]!==value))throw new Error('S3 recorded versions unreviewed');
  if(!record.passed||!require('./'+moduleName)[predicateName](record)||qualification.result!==record.result||qualification.fullS3Qualified!==false||qualification.productionEligible!==false)throw new Error('S3 cohort qualification invalid');
  const repoQualification='feasibility/s3-worktrees/'+qualificationPath,commit=history(['log','--diff-filter=A','--format=%H','-1','--',repoQualification]).toString('utf8').trim();
  if(!/^[a-f0-9]{40}$/.test(commit)||!history(['show',commit+':'+repoQualification]).equals(qualificationBytes))throw new Error('S3 qualification provenance mismatch');
  if(!record.sourceHashes||!Object.keys(record.sourceHashes).length)throw new Error('S3 source bindings missing');const sources=[];
  for(const [name,expected]of Object.entries(record.sourceHashes)){
   const relative=path.posix.normalize(name.startsWith('scripts/')||name.startsWith('fixtures/')?name:'scripts/'+name);
   if(!/^(scripts|fixtures)\/[a-zA-Z0-9_./-]+$/.test(relative)||relative.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(expected))throw new Error('S3 source path invalid');
   const historical=history(['show',commit+':feasibility/s3-worktrees/'+relative]);if(sha(historical)!==expected)throw new Error('S3 historical source mismatch');
   sources.push({path:relative,sha256:expected,historicalCommit:commit,currentBytesMatch:sha(readFile(path.join(root,relative)))===expected});
  }
  inventory.push({id,result:record.result,recordedAt:record.recordedAt,qualification:qualificationPath,qualificationSha256:sha(qualificationBytes),sealedObservation:sealedPath,observationSha256:digest,manifestSha256:sha(readFile(path.join(root,path.dirname(sealedPath),'manifest.json'))),versions:qualification.versions,
   sourceCommit:commit,sourceApplicability:sources.every(item=>item.currentBytesMatch)?'recorded-source-bytes-match':'historical-source-only',sources});
 }
 return {schema:'tiye-s3-assessment-v1',result:'VERIFIED_BOUNDED_EVIDENCE_S3_PARTIAL',cohorts:inventory,sections:sections.map(section=>({...section,status:'partial'})),
  historicalSourceOnlyCohorts:inventory.filter(item=>item.sourceApplicability==='historical-source-only').map(item=>item.id),liveNativeCohortsRerun:false,allProvidersQualified:false,fullS3Qualified:false,productionEligible:false,
  s4Entry:{readOnlyResearchMayBegin:true,providerClassifications:'unreviewed',implementationOrReleaseGatePassed:false,requirements:['Official provider/access-route sources and review date','Separate permitted-access and native-capability evidence','Exact CLI/model/provider identities and versions','No token extraction, credential changes or login actions in this assessment','Unclear access stays unreviewed; delegation success supplies no classification','Preserve S3 blockers while researching S4']}};
}
function main(){const target=path.join(__dirname,'../evidence/assessment.json');try{const bytes=Buffer.from(JSON.stringify(assessS3(),null,2)+'\n');if(process.argv.includes('--check')){if(!fs.readFileSync(target).equals(bytes))throw new Error('S3 assessment stale');}else fs.writeFileSync(target,bytes);console.log('[s3-assessment] VERIFIED_BOUNDED_EVIDENCE_S3_PARTIAL');}catch{console.error('[s3-assessment] evidence or historical source verification failed');process.exitCode=2;}}
if(require.main===module)main();module.exports={assessS3};
