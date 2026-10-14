'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');const {assessS3}=require('../scripts/assess-s3');
test('verified cohorts remain partial and distinguish historical source from matching recorded bytes',()=>{
 const assessment=assessS3();assert.equal(assessment.cohorts.length,12);assert.deepEqual(assessment.historicalSourceOnlyCohorts,['basics','checkpoints']);
 assert.equal(assessment.sections.length,7);assert.equal(assessment.sections.every(item=>item.status==='partial'&&item.missing.length),true);
 assert.equal(assessment.fullS3Qualified,false);assert.equal(assessment.productionEligible,false);assert.equal(assessment.allProvidersQualified,false);
 assert.equal(assessment.s4Entry.readOnlyResearchMayBegin,true);assert.equal(assessment.s4Entry.providerClassifications,'unreviewed');assert.equal(assessment.s4Entry.implementationOrReleaseGatePassed,false);
});
test('assessment refuses corrupted latest/seal/manifest data and unavailable historical source',()=>{
 const evidence=path.resolve(__dirname,'../evidence');
 for(const variant of ['latest','sealed','manifest']){
  const readFile=file=>{const bytes=fs.readFileSync(file);if(variant==='latest'&&file===path.join(evidence,'basics-latest.json'))return Buffer.concat([bytes,Buffer.from(' ')]);
   if(variant==='sealed'&&file.includes('supplements'+path.sep+'basics')&&path.basename(file)==='basics.json')return Buffer.concat([bytes,Buffer.from(' ')]);
   if(variant==='manifest'&&file.includes('supplements'+path.sep+'basics')&&path.basename(file)==='manifest.json'){const value=JSON.parse(bytes);value.versions.node='unreviewed';return Buffer.from(JSON.stringify(value));}return bytes;};
  assert.throws(()=>assessS3({readFile}),variant);
 }
 const gitRead=args=>{if(args[0]==='show'&&args[1].endsWith(':feasibility/s3-worktrees/scripts/run-basics.js'))return Buffer.from('incorrect historical source');const result=spawnSync('git',args,{cwd:path.resolve(__dirname,'../../..'),windowsHide:true,timeout:20000});if(result.status!==0)throw new Error('test history unavailable');return result.stdout;};
 assert.throws(()=>assessS3({gitRead}),/historical source mismatch/);
});
