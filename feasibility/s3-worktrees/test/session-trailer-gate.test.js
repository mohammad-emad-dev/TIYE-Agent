'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createWorktreeLifecycle,git}=require('../scripts/worktree-lifecycle');
const {initialize,removeTemp}=require('../scripts/run-basics');
const {attributionGit}=require('../scripts/attribution-git');
const {createSessionTrailerGate,commitProblems}=require('../scripts/session-trailer-gate');
const {trailerPolicyPassed}=require('../scripts/run-trailer-policy');

test('native range audit rejects empty, oversized, nonlinear, foreign-base and wrong-session selections',()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'tiye-s3-trailer-gate-test-')),root=path.join(base,'root'),slots=path.join(base,'slots');
  fs.mkdirSync(root);fs.mkdirSync(slots);initialize(root,slots);
  const lifecycle=createWorktreeLifecycle({repository:root,base:slots});
  const member=lifecycle.create({name:'member',branch:'codex/test-trailer-member'}),integration=lifecycle.create({name:'integration',branch:'codex/test-trailer-integration'});
  const baseCommit=git(root,['rev-parse','HEAD']).output,tree=git(root,['rev-parse','HEAD^{tree}']).output;
  const identity={memberId:'member-a',memberName:'Fixture Member A',sessionId:'gate-test-session'};
  const gate=createSessionTrailerGate({lifecycle,integrationIdentity:{memberId:'integration',memberName:'Fixture Integration',sessionId:identity.sessionId}});
  const request={member,integration,baseCommit,identity};
  const objectCommit=(parents,message)=>attributionGit(member,['commit-tree',tree,...parents.flatMap(id=>['-p',id])],identity,message+'\n\nTiye-Session: '+identity.sessionId+'\n').trim();
  const setHead=id=>{lifecycle.validate(member);git(member,['update-ref','HEAD',id,git(member,['rev-parse','HEAD']).output]);};
  try {
    assert.deepEqual(gate.audit(request).problems,['empty-range']);
    assert.throws(()=>gate.audit({...request,baseCommit:'HEAD'}));
    assert.equal(gate.audit({...request,identity:{...identity,sessionId:'foreign-session'}}).problems.includes('wrong-gate-session'),true);
    const left=objectCommit([baseCommit],'left'),right=objectCommit([baseCommit],'right'),merged=objectCommit([left,right],'nonlinear member');
    setHead(merged);const nonlinear=gate.audit(request);
    assert.equal(nonlinear.eligible,false);assert.equal(nonlinear.commits.some(commit=>commit.problems.includes('unsupported-parent-count')),true);
    assert.equal(gate.audit({...request,baseCommit:right}).problems.includes('base-not-ancestor'),true);
    let oversized=baseCommit;for(let index=0;index<51;index++)oversized=objectCommit([oversized],'bounded range '+index);
    setHead(oversized);assert.deepEqual(gate.audit(request).problems,['range-limit']);
    setHead(left);const valid=gate.audit(request);assert.equal(valid.eligible,true);
    assert.equal(gate.merge({...valid,eligible:true}).reason,'unapproved-audit');
    const sequencer=git(member,['rev-parse','--path-format=absolute','--git-path','sequencer']).output;
    fs.mkdirSync(sequencer);assert.equal(gate.merge(valid).reason,'active-operation');fs.rmdirSync(sequencer);
    assert.equal(gate.merge(valid).merged,true);
    assert.equal(gate.audit(request).problems.includes('already-integrated'),true);
    assert.equal(gate.merge(valid).reason,'unapproved-audit');
    git(integration,['update-ref','HEAD',valid.integrationHead,git(integration,['rev-parse','HEAD']).output]);
    assert.equal(gate.merge(valid).reason,'unapproved-audit');
  }finally{for(const entry of lifecycle.owned().reverse())lifecycle.remove(entry.directory);assert.equal(lifecycle.registry().length,1);removeTemp(base,'tiye-s3-trailer-gate-test-');}
});

test('sealed policy evidence requires complete rejection, lineage and cleanup proof',()=>{
  const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/trailer-policy-latest.json')));
  assert.equal(trailerPolicyPassed(record),true);
  for(const field of ['fullRangeRejected','rejectedRangeUnchanged','forgedDecisionBlocked','staleMemberBlocked','staleIntegrationBlocked',
    'dirtyBlocked','activeOperationBlocked','validRangeMerged','memberMetadataPreserved','rejectedHistoryUnchanged','originalRootUnchanged','registryRootOnly','rootTempRemoved'])
    assert.equal(trailerPolicyPassed({...record,[field]:false}),false,field);
  assert.equal(trailerPolicyPassed({...record,worktreesRemoved:2}),false);
  assert.equal(record.rejectedAudit.commits.some(commit=>commit.problems.includes('missing-session')),true);
  const accepted=record.acceptedAudit.commits[0];
  const identity={memberId:'member-a',memberName:accepted.authorName,sessionId:accepted.sessions[0]};
  assert.deepEqual(commitProblems({...accepted,committerEmail:'foreign@tiye.local'},identity),['committer-mismatch']);
});
