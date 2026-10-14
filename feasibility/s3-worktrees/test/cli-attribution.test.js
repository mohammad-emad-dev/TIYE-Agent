'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {exactCliTool,cliAttributionPassed}=require('../scripts/cli-attribution-evidence');
const observation=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/cli-attribution-latest.json')));

test('native CLI proof rejects foreign session, extra tool, failed shell and prose echo',()=>{
  const record=observation(),command='rtk proxy node attribution-task.cjs';
  const native={type:'tool_use',part:record.nativeTool[0]},events=[native];
  assert.equal(exactCliTool(events,command,record.observation,record.cliSessionId),true);
  assert.equal(exactCliTool(events,command,record.observation,'ses_foreign'),false);
  assert.equal(exactCliTool([...events,native],command,record.observation,record.cliSessionId),false);
  assert.equal(exactCliTool([{type:'text',text:JSON.stringify(record.observation)}],command,record.observation,record.cliSessionId),false);
  for(const patch of [{tool:'bash'}, {state:{...native.part.state,status:'error'}},
    {state:{...native.part.state,input:{command:command+' --extra'}}},
    {state:{...native.part.state,metadata:{metadata:{exit:1,truncated:false}}}},
    {state:{...native.part.state,metadata:{metadata:{exit:0,truncated:true}}}},
    {state:{...native.part.state,output:'claimed success '+native.part.state.output}}]) {
    assert.equal(exactCliTool([{...native,part:{...native.part,...patch}}],command,record.observation,record.cliSessionId),false);
  }
});

test('CLI attribution requires native proof, unchanged worker and clean owned teardown',()=>{
  const record=observation();assert.equal(cliAttributionPassed(record),true);
  for(const field of ['cliCompleted','exactToolMatched','observationMatched','workerUnchanged','taskUnchanged','onlyExpectedFilesChanged',
    'cliDidNotCommit','fallbackCommitMatched','originalRootUnchanged','registryRootOnly','rootTempRemoved'])
    assert.equal(cliAttributionPassed({...record,[field]:false}),false,field);
  assert.equal(cliAttributionPassed({...record,nativeTool:[]}),false);
  assert.equal(cliAttributionPassed({...record,cliVersion:'opencode v2.0.29'}),false);
  assert.equal(cliAttributionPassed({...record,worktreesRemoved:0}),false);
  assert.equal(cliAttributionPassed({...record,fallbackCommit:{...record.fallbackCommit,sessions:[]}}),false);
});
