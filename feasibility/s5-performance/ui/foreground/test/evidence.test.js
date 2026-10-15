'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {validateEvidence}=require('../check-evidence');
test('native evidence recomputes qualifications and rejects reported verdict or monitor tampering',()=>{
  const recorded=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence-foreground.json')));validateEvidence(recorded);
  const mutations=[
    cohort=>cohort.boundedForegroundInputQualified=!cohort.boundedForegroundInputQualified,
    cohort=>cohort.foregroundAssessment.exposureConfirmed=!cohort.foregroundAssessment.exposureConfirmed,
    cohort=>cohort.foregroundAssessment.criteria.inputMaxMs=1000,
    cohort=>cohort.focusMonitorControl.main.visible='false'
  ];
  for(const mutate of mutations){const modified=structuredClone(recorded);mutate(modified);assert.throws(()=>validateEvidence(modified));}
});
