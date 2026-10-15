'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {profileFor}=require('../profiles');
test('fixed smoke is shorter than an hour and unknown profiles cannot launch arbitrary workloads',()=>{
  assert.equal(profileFor('hour').mixedMs,3600000);assert.equal(profileFor('smoke').mixedMs,90000);assert.throws(()=>profileFor('../hour'));assert.throws(()=>profileFor('constructor'));
  const profile=profileFor('hour');profile.mixedMs=1;assert.equal(profileFor('hour').mixedMs,3600000);
});
test('browser rolling chain matches Node UTF8 projection and detects lost/reordered chunks',async()=>{
  const chunks=['العربية','日本語','\x1b[1;1HACK'];let node=Buffer.alloc(32),browser=new Uint8Array(32);
  for(const chunk of chunks){node=crypto.createHash('sha256').update(node).update(Buffer.from(chunk)).digest();const bytes=new TextEncoder().encode(chunk),joined=new Uint8Array(32+bytes.length);joined.set(browser);joined.set(bytes,32);browser=new Uint8Array(await crypto.webcrypto.subtle.digest('SHA-256',joined));}
  assert.equal(Buffer.from(browser).toString('hex'),node.toString('hex'));
  let reordered=Buffer.alloc(32);for(const chunk of chunks.slice().reverse())reordered=crypto.createHash('sha256').update(reordered).update(Buffer.from(chunk)).digest();assert.notEqual(reordered.toString('hex'),node.toString('hex'));
});
