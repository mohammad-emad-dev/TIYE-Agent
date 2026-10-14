'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {assertWindowsTreePaths}=require('../scripts/windows-worktree-preflight');const {windowsPassed}=require('../scripts/run-windows');
test('Windows tree preflight refuses case aliases, directory aliases, reserved names and ambiguous paths',()=>{
 const rejected=[['Foo.txt','foo.txt'],['Folder/a.txt','folder/b.txt'],['folder','folder/a.txt'],['same.txt','same.txt'],['CON.txt'],['folder/LPT9.log'],['folder./x.txt'],['../escape.txt'],['.git/config'],['a//b.txt'],['nonascii-\u00e9.txt'],['space name.txt']];
 for(const names of rejected)assert.throws(()=>assertWindowsTreePaths(names),JSON.stringify(names));assert.equal(assertWindowsTreePaths(['normal.txt','nested/file-name_1.txt']),true);
 const long=Array.from({length:8},()=> 'a'.repeat(40)).join('/')+'/file.txt';assert.equal(assertWindowsTreePaths([long]),true);
});
test('Windows qualification requires actual path, CRLF and correlated exclusive-lock outcomes',()=>{
 const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/windows-latest.json')));assert.equal(windowsPassed(record),true);
 for(const field of ['longPathGitAndCheckpoint','caseAliasSameFile','caseAliasCreateRefused','syntheticCaseTreeRefused','stagedLfWorkingCrlf','rawCrlfRecovered','realIndexPreserved','exclusiveLockCorrelated','lockedRemovalRefused','lockedInventoryPreserved','lockChildExited','unlockedRemovalPassed','originalRootUnchanged','registryRootOnly','tempRemoved'])assert.equal(windowsPassed({...record,[field]:false}),false,field);
 assert.equal(windowsPassed({...record,maxAbsolutePathLength:260}),false);assert.equal(windowsPassed({...record,worktreesRemoved:0}),false);assert.equal(windowsPassed({...record,platform:'linux'}),false);
});
