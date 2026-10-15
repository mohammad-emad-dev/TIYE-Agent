'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {check,validateView}=require('../check-evidence'),{summarize}=require('../../resources/resource-metrics');
function grid(){return JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../../../output/s5-bundled-resources/grid-result.json'),'utf8'));}
test('bundled backend resource captures preserve byte integrity and active/idle sample coverage',()=>check());
test('bundled backend renderer reconstruction and isolated process faults retain their contracts',()=>{
  require('../../bundled-recovery/check-evidence').check();require('../../bundled-faults/check-evidence').check();
});
test('resource coverage rejects a missing worker during active output',()=>{
  const view=grid(),sample=view.resourceSamples.find(row=>row.phase==='flood');sample.processes=sample.processes.filter(row=>row.role!=='worker-0');view.resources=summarize(view.resourceSamples);assert.throws(()=>validateView(view));
});
test('resource coverage rejects an idle sample before the declared boundary',()=>{
  const view=grid(),sample=view.resourceSamples.find(row=>row.phase==='idle');sample.elapsedMs=64000;view.resources=summarize(view.resourceSamples);assert.throws(()=>validateView(view));
});
