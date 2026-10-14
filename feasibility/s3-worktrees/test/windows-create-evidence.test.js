'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {windowsCreatePassed}=require('../scripts/run-windows-create');
test('Windows creation proof refuses partial checkout, branch creation, source drift and incomplete cleanup',()=>{
 const record=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/windows-create-latest.json')));assert.equal(windowsCreatePassed(record),true);
 for(const field of ['refused','noTarget','noBranch','registryPreserved','sourcePreserved'])assert.equal(windowsCreatePassed({...record,refusals:record.refusals.map((item,index)=>index?item:{...item,[field]:false})}),false,field);
 for(const field of ['validCreated','selectedCommitMatched','safeFilesMatched','originalRootUnchanged','registryRootOnly','tempRemoved'])assert.equal(windowsCreatePassed({...record,[field]:false}),false,field);
 assert.equal(windowsCreatePassed({...record,refusals:record.refusals.slice(1)}),false);assert.equal(windowsCreatePassed({...record,worktreesRemoved:0}),false);
});
