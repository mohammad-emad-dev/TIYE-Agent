'use strict';
const fs=require('node:fs'),path=require('node:path');
const {git}=require('./worktree-lifecycle');
const {attributionEnvironment,attributionGit,readCommit,commitMatches}=require('./attribution-git');
const key=value=>path.resolve(value).toLowerCase();
const activeNames=['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','sequencer','index.lock'];

function commitProblems(commit,identity) {
  const problems=[];
  if(commit.authorName!==identity.memberName||commit.authorEmail!==identity.memberId+'@tiye.local')problems.push('author-mismatch');
  if(commit.committerName!=='TIYE Fixture Engine'||commit.committerEmail!=='engine@tiye.local')problems.push('committer-mismatch');
  if(commit.sessions.length===0||commit.rawSessionLines===0)problems.push('missing-session');
  else if(commit.sessions.length!==1||commit.rawSessionLines!==1)problems.push('duplicate-session');
  else if(commit.sessions[0]!==identity.sessionId)problems.push('session-mismatch');
  if(commit.parents.length!==1)problems.push('unsupported-parent-count');
  return problems;
}

function createSessionTrailerGate({lifecycle,integrationIdentity}) {
  attributionEnvironment(integrationIdentity,{});
  const engine=Object.freeze({...integrationIdentity}),decisions=new WeakMap();
  function audit({member,integration,baseCommit,identity}) {
    attributionEnvironment(identity,{});lifecycle.validate(member);lifecycle.validate(integration);
    if(key(member)===key(integration)||typeof baseCommit!=='string'||!/^[a-f0-9]{40}$/.test(baseCommit))throw new Error('trailer audit selection invalid');
    const memberHead=git(member,['rev-parse','HEAD']).output,integrationHead=git(integration,['rev-parse','HEAD']).output;
    const problems=[];
    if(identity.sessionId!==engine.sessionId)problems.push('wrong-gate-session');
    for(const head of [memberHead,integrationHead])if(git(member,['merge-base','--is-ancestor',baseCommit,head],[0,1]).status!==0)problems.push('base-not-ancestor');
    if(memberHead!==baseCommit&&git(member,['merge-base','--is-ancestor',memberHead,integrationHead],[0,1]).status===0)problems.push('already-integrated');
    const ids=problems.length?[]:git(member,['rev-list','--reverse','--max-count=51',baseCommit+'..'+memberHead]).output.split(/\r?\n/).filter(Boolean);
    if(!problems.length&&ids.length===0)problems.push('empty-range');
    if(ids.length>50)problems.push('range-limit');
    const commits=problems.length?[]:ids.map(id=>{const commit=readCommit(member,id,identity);return {...commit,problems:commitProblems(commit,identity)};});
    const eligible=problems.length===0&&commits.every(commit=>commit.problems.length===0);
    const decision=Object.freeze({eligible,baseCommit,memberHead,integrationHead,problems:Object.freeze(problems),
      commits:Object.freeze(commits.map(commit=>Object.freeze({...commit,problems:Object.freeze(commit.problems)})))});
    decisions.set(decision,{eligible,member,integration,baseCommit,memberHead,integrationHead});
    return decision;
  }
  function merge(decision) {
    const pinned=decision&&typeof decision==='object'?decisions.get(decision):null;
    if(!pinned?.eligible)return {merged:false,reason:'unapproved-audit'};
    lifecycle.validate(pinned.member);lifecycle.validate(pinned.integration);
    if(git(pinned.member,['rev-parse','HEAD']).output!==pinned.memberHead)return {merged:false,reason:'stale-member-head'};
    if(git(pinned.integration,['rev-parse','HEAD']).output!==pinned.integrationHead)return {merged:false,reason:'stale-integration-head'};
    for(const directory of [pinned.member,pinned.integration]) {
      for(const name of activeNames)if(fs.existsSync(git(directory,['rev-parse','--path-format=absolute','--git-path',name]).output))return {merged:false,reason:'active-operation'};
      if(git(directory,['status','--porcelain','--untracked-files=all','--ignored']).output)return {merged:false,reason:'dirty-worktree'};
    }
    // A started Git operation consumes this in-memory decision, including uncertain failures.
    decisions.delete(decision);
    attributionGit(pinned.integration,['merge','--no-ff','-m','Integrate audited fixture range\n\nTiye-Session: '+engine.sessionId,pinned.memberHead],engine);
    const id=git(pinned.integration,['rev-parse','HEAD']).output,commit=readCommit(pinned.integration,id,engine);
    if(!commitMatches(commit,engine)||JSON.stringify(commit.parents)!==JSON.stringify([pinned.integrationHead,pinned.memberHead]))throw new Error('audited merge outcome unverified');
    return {merged:true,commit};
  }
  return {audit,merge};
}
module.exports={createSessionTrailerGate,commitProblems};
