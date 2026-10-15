'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{fixtureDigest}=require('../mixed/fixture');
const expectedRecords=Array.from({length:600},(_,index)=>index),persistentRoles=['main','feed',...Array.from({length:5},(_,member)=>['worker-'+member,'producer-'+member]).flat()];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function validateRoster(evidence){
  assert.deepEqual(evidence.survivingRoles.map(row=>row.role).sort(),persistentRoles.slice().sort());
  for(const row of evidence.survivingRoles){assert.deepEqual(Object.keys(row).sort(),['role','sameIdentity']);assert.equal(row.sameIdentity,true);}
  assert.deepEqual(evidence.childExitChecks.map(row=>row.role).sort(),persistentRoles.filter(role=>role!=='main').sort());
  for(const row of evidence.childExitChecks){assert.deepEqual(Object.keys(row).sort(),['role','status']);assert(['exited','original-exited-pid-reused'].includes(row.status));}
  assert.equal(evidence.rendererChanged,true);assert.equal(evidence.oldRendererGone,true);
}
function validateMilestones(evidence){
  for(const field of ['crashCounts','goneCounts','outageCounts','crashCuts','replayCuts']){assert.equal(evidence[field].length,5);evidence[field].forEach(count=>assert(Number.isInteger(count)&&count>=0));}
  for(let member=0;member<5;member++){
    assert(evidence.crashCounts[member]>=20&&evidence.crashCounts[member]>=evidence.initialRenderer.members[member].records.length);
    assert(evidence.goneCounts[member]>=evidence.crashCounts[member]);assert(evidence.outageCounts[member]>=evidence.goneCounts[member]+5&&evidence.outageCounts[member]<600);
    assert(evidence.replayCuts[member]>=evidence.crashCuts[member]);assert(evidence.replayCuts[member]<=evidence.stored[member].chunks);
  }
  assert(Number.isFinite(evidence.outageMs)&&evidence.outageMs>0);assert(Number.isFinite(evidence.restoredMs)&&evidence.restoredMs>=evidence.outageMs);
}
function validatePages(pages){
  const plan=[[0,'needle',0,10000],[1,'needle',0,20000],[1,'',49980,50000],[1,'needle',0,50000]];assert.equal(pages.length,4);
  pages.forEach((page,index)=>{
    assert.deepEqual([page.epoch,page.query,page.offset,page.count],plan[index]);
    const ids=page.query?Array.from({length:Math.min(20,Math.floor(page.count/997))},(_,offset)=>(offset+1)*997):Array.from({length:20},(_,offset)=>49981+offset);
    assert.deepEqual(page.ids,ids);assert.equal(page.domRows,ids.length);
  });
}
function validateMember(evidence,journal,member){
  const stored=evidence.stored[member],observed=evidence.renderer.members[member],initial=evidence.initialRenderer.members[member];
  assert.equal(stored.member,member);assert.equal(observed.member,member);assert.equal(journal.member,member);assert.equal(initial.member,member);
  assert(initial.records.length>=20);assert.deepEqual(initial.records,expectedRecords.slice(0,initial.records.length));
  assert.equal(stored.records,600);assert.equal(stored.workerExit,0);assert.equal(stored.terminalExit,0);assert.equal(observed.ended,true);assert.deepEqual(observed.records,expectedRecords);
  assert(Array.isArray(journal.chunks)&&journal.chunks.every(chunk=>typeof chunk==='string'));
  const bytes=Buffer.concat(journal.chunks.map(chunk=>Buffer.from(chunk)));let chain=Buffer.alloc(32);
  for(const chunk of journal.chunks)chain=crypto.createHash('sha256').update(chain).update(Buffer.from(chunk)).digest();
  assert.equal(hash(bytes),stored.sha256);assert.equal(chain.toString('hex'),stored.chain);
  for(const field of ['member','bytes','chunks','chain'])assert.equal(observed[field],stored[field]);assert.equal(bytes.length,stored.bytes);assert.equal(journal.chunks.length,stored.chunks);
  assert.equal(evidence.ledger.sent[member],stored.chunks);assert.equal(evidence.ledger.acked[member],stored.chunks);
  const sequences=[...bytes.toString().matchAll(new RegExp(`REC member=${member} generation=0 seq=(\\d+)`,'g'))].map(match=>Number(match[1]));assert.deepEqual(sequences,expectedRecords);
  assert(bytes.toString().includes(`END member=${member} generation=0`));return bytes;
}
function validateEvidence(evidence,journals){
  assert.equal(evidence.schema,'tiye-s5-renderer-recovery-v1');assert.equal(evidence.platform,'win32');assert.equal(evidence.gone.reason,'crashed');assert(Number.isInteger(evidence.gone.exitCode));
  for(const field of ['coreProcessPresent','fullS5Qualified','productionEligible','physicalPaintQualified'])assert.equal(evidence[field],false);
  assert.equal(evidence.providerRequests,0);assert.equal(evidence.ownedCleanup,true);assert.equal(evidence.staleChallengeRejected,true);assert(Number.isInteger(evidence.staleCount)&&evidence.staleCount>=1);
  assert.equal(evidence.renderer.epoch,1);assert.equal(evidence.initialRenderer.epoch,0);assert.equal(evidence.ledger.epoch,1);
  for(const list of [journals,evidence.stored,evidence.renderer.members,evidence.initialRenderer.members,evidence.ledger.sent,evidence.ledger.acked])assert.equal(list.length,5);
  validateRoster(evidence);validateMilestones(evidence);validatePages(evidence.pages);
  assert.deepEqual(evidence.feedIntegrity,{count:50000,sha256:fixtureDigest(),sqlite:'ok',fts:'ok',reopened:true});
  const logs=journals.map((journal,member)=>validateMember(evidence,journal,member));assert.equal(logs.reduce((sum,bytes)=>sum+bytes.length,0),evidence.journalBytes);
  assert.equal(evidence.journalLimitBytes,2097152);assert(evidence.journalBytes<=evidence.journalLimitBytes);return logs;
}
module.exports={validateEvidence};
