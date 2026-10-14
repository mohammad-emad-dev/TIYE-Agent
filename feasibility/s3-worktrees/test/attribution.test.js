'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {attributionEnvironment,commitMatches} = require('../scripts/attribution-git');
const {attributionPassed} = require('../scripts/run-attribution');
const identity = {memberId:'member-a',memberName:'Fixture Member A',sessionId:'fixture-session'};

test('attribution launch drops inherited Git routing and identity without changing the parent',()=>{
  const inherited={PATH:'fixture-path',GIT_DIR:'foreign',git_index_file:'foreign-index',GIT_AUTHOR_NAME:'wrong',GIT_CONFIG_COUNT:'1'};
  const before={...inherited},env=attributionEnvironment(identity,inherited);
  assert.deepEqual(inherited,before); assert.equal(env.PATH,inherited.PATH);
  for(const key of ['GIT_DIR','git_index_file','GIT_CONFIG_COUNT'])assert.equal(env[key],undefined);
  assert.equal(env.GIT_AUTHOR_NAME,identity.memberName); assert.equal(env.GIT_AUTHOR_EMAIL,'member-a@tiye.local');
  assert.equal(env.GIT_COMMITTER_EMAIL,'engine@tiye.local');
  for(const bad of [{memberId:undefined},{sessionId:undefined},{memberName:'name\nTiye-Session: injected'}, {memberId:'../other'},{sessionId:'session\nextra'}])
    assert.throws(()=>attributionEnvironment({...identity,...bad},{}));
});

test('actual commit metadata rejects missing, duplicated, foreign session and overridden author',()=>{
  const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/attribution-latest.json')));
  assert.equal(commitMatches(record.childCommit,record.identities.a),true);
  assert.equal(commitMatches(record.engineCommit,record.identities.b),true);
  for(const commit of [record.rawCommit,record.duplicateCommit,record.overrideCommit])assert.equal(commitMatches(commit,record.identities.a),false);
  assert.equal(commitMatches({...record.childCommit,rawSessionLines:2},record.identities.a),false);
  assert.equal(commitMatches(record.childCommit,{...record.identities.a,sessionId:'other-session'}),false);
  assert.equal(commitMatches({...record.childCommit,committerEmail:'foreign@tiye.local'},record.identities.a),false);
});

test('attribution evidence requires member metadata, merge preservation and owned cleanup',()=>{
  const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/attribution-latest.json')));
  assert.equal(attributionPassed(record),true);
  for(const field of ['childCommitMatched','engineCommitMatched','authorOverrideRejected','duplicateTrailerRejected',
    'memberCommitsPreserved','mergeParentsMatched','mergedFilesMatched','originalRootUnchanged','registryRootOnly','baseTempRemoved'])
    assert.equal(attributionPassed({...record,[field]:false}),false,field);
  assert.equal(attributionPassed({...record,worktreesRemoved:2}),false);
  assert.equal(attributionPassed({...record,childCommit:record.overrideCommit}),false);
  assert.equal(attributionPassed({...record,mergeCommits:[record.childCommit,record.engineCommit]}),false);
});
