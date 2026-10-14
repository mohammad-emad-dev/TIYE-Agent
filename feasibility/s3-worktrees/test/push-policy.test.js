'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {hookPermitted}=require('../fixtures/push-hook.cjs');
const {pushPolicyPassed}=require('../scripts/run-push-policy');
test('hook approval matches exactly one local remote, ref, SHA and prior tip',()=>{
  const grant={remote:'owned-local-remote',ref:'refs/heads/tiye/member-a',sourceHead:'a'.repeat(40),remoteTip:'b'.repeat(40)};
  const updates='HEAD '+grant.sourceHead+' '+grant.ref+' '+grant.remoteTip+'\n',request={grant,remote:grant.remote,updates};
  assert.equal(hookPermitted(request),true);
  for(const patch of [{grant:null},{remote:'other-remote'},{updates:updates+updates},{updates:''},
    {grant:{...grant,sourceHead:'c'.repeat(40)}},{grant:{...grant,remoteTip:'d'.repeat(40)}},
    {grant:{...grant,ref:'refs/heads/tiye/other'}},{grant:{...grant,sourceHead:'0'.repeat(40)}}])
    assert.equal(hookPermitted({...request,...patch}),false);
  assert.equal(hookPermitted({grant:{...grant,remoteTip:null},remote:grant.remote,updates:'HEAD '+grant.sourceHead+' '+grant.ref+' '+'0'.repeat(40)+'\n'}),true);
});
test('push qualification requires approval, native bypass observations and owned cleanup',()=>{
  const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/push-policy-latest.json')));assert.equal(pushPolicyPassed(record),true);
  for(const field of ['hookScopeMatched','engineDeniedWithoutApproval','normalHookDenied','approvedPushVerified','replayBlocked','staleSourceBlocked',
    'staleRemoteBlocked','noVerifyBypassVerified','hooksPathBypassVerified','unhookedWorktreeBypassVerified','bypassesLeaveLocalRefsUnchanged',
    'forceApprovalRequired','approvedForceVerified','hookBytesUnchanged','originalRootUnchanged','registryRootOnly','rootTempRemoved'])
    assert.equal(pushPolicyPassed({...record,[field]:false}),false,field);
  assert.equal(pushPolicyPassed({...record,hookLog:[{allowed:true},{allowed:true}]}),false);
  assert.equal(pushPolicyPassed({...record,worktreesRemoved:1}),false);
});
