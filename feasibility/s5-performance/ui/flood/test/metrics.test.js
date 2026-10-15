'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {distribution,evaluateTargets}=require('../metrics');
function observation(){return {plannedInputs:2,focusSkipped:0,renderer:{inputLatencies:[10,20],missingInputs:0,visibilityLost:false,frameGaps:Array(100).fill(16)}};}
test('missing or invalid metric samples cannot manufacture a zero-latency pass',()=>{assert.equal(distribution([]),null);assert.equal(distribution([NaN]),null);const report=observation();report.renderer.inputLatencies=[];assert.equal(evaluateTargets(report).inputUnder100Ms,null);});
test('maximum rather than percentile governs initial latency/freeze thresholds',()=>{const report=observation();report.renderer.inputLatencies.push(150);report.plannedInputs++;report.renderer.frameGaps.push(501);const targets=evaluateTargets(report);assert.equal(targets.inputUnder100Ms,false);assert.equal(targets.rafGapsUnder500Ms,false);});
test('lost focus and invisible document make input coverage incomplete',()=>{for(const patch of [{focusSkipped:1},{renderer:{...observation().renderer,visibilityLost:true}}])assert.equal(evaluateTargets({...observation(),...patch}).inputCoverageComplete,false);});
