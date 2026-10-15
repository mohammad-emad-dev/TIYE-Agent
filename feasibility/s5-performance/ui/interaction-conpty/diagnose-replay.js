'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{recordAt}=require('./fixture'),{diffRecord}=require('./diff-record');
function diagnose(){
  const filename=path.resolve(__dirname,'../../../../output/s5-interaction-replay/result.json'),bytes=fs.readFileSync(filename),replay=JSON.parse(bytes);
  const rows=replay.observations.map(observation=>({mode:observation.mode,member:observation.member,
    differences:observation.checkpoints.at(-1).records.flatMap((actual,sequence)=>{
      const expected=recordAt(observation.member,sequence),difference=diffRecord(expected,actual);return difference.equal?[]:[{sequence,...difference}];
    })}));
  return {schema:'tiye-s5-record-differences-v1',inputSha256:crypto.createHash('sha256').update(bytes).digest('hex'),lengthUnit:'UTF16 code units; not display cells',stringsChanged:false,rows};
}
if(require.main===module)console.log(JSON.stringify(diagnose(),null,2));
module.exports={diagnose};
