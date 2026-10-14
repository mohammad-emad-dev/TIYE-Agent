'use strict';
const fs=require('node:fs'),path=require('node:path');
function hookPermitted({grant,remote,updates}) {
  if(!grant||typeof updates!=='string'||updates.length>4096)return false;
  const rows=updates.trim().split(/\r?\n/),fields=rows[0].split(/\s+/);
  return rows.length===1&&fields.length===4&&grant.remote===remote&&/^refs\/heads\/tiye\/[a-z][a-z0-9-]{0,50}$/.test(grant.ref)
    &&/^[a-f0-9]{40}$/.test(grant.sourceHead)&&grant.sourceHead!=='0'.repeat(40)
    &&(grant.remoteTip===null||/^[a-f0-9]{40}$/.test(grant.remoteTip))
    &&fields[1]===grant.sourceHead&&fields[2]===grant.ref&&fields[3]===(grant.remoteTip||'0'.repeat(40));
}
if(require.main===module){
  const [expectedRemote,log,,remoteUrl]=process.argv.slice(2);let allowed=false;
  try{const remote=fs.realpathSync(remoteUrl);if(path.normalize(remote).toLowerCase()!==path.normalize(expectedRemote).toLowerCase())throw new Error('wrong local remote');
    allowed=hookPermitted({grant:JSON.parse(process.env.TIYE_FIXTURE_PUSH_GRANT||'null'),remote:fs.realpathSync(expectedRemote),updates:fs.readFileSync(0,'utf8')});
  }catch{allowed=false;}
  fs.appendFileSync(log,JSON.stringify({allowed})+'\n');if(!allowed){console.error('fixture push denied');process.exitCode=1;}
}
module.exports={hookPermitted};
