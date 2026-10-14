const fs=require('node:fs'),{spawnSync}=require('node:child_process'),crypto=require('node:crypto');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),entries=[];
for(const cli of ['codex','claude','gemini','opencode','mimo','agy']){
const outputs={};for(const option of ['--version','--help']){const result=spawnSync(cli,[option],{windowsHide:true,shell:true,encoding:'utf8',timeout:15000,maxBuffer:300000});
  const stdout=result.stdout||'',stderr=result.stderr||'';outputs[option]={status:result.error?'process-error':result.status===0?'completed':'failed',exitCode:result.status,stdoutSha256:sha(stdout),stderrSha256:sha(stderr),...(option==='--version'&&result.status===0?{version:stdout.trim()}:{}),
   ...(option==='--help'&&result.status===0?{helpMarkerScope:'stdout plus stderr; markers are not native feature qualification',recognized:{login:/\blogin\b/i.test(stdout+stderr),auth:/\bauth\b/i.test(stdout+stderr),exec:/\bexec\b/i.test(stdout+stderr),run:/\brun\b/i.test(stdout+stderr),prompt:/--prompt\b/.test(stdout+stderr),print:/--print\b/.test(stdout+stderr),outputFormat:/--output-format\b/.test(stdout+stderr),standalone:/--standalone\b/.test(stdout+stderr)}}:{})};
 }
 entries.push({cli,commands:outputs});
}
fs.mkdirSync('feasibility/s4-provider-access/evidence',{recursive:true});const record={recordedAt:new Date().toISOString(),scope:'Installed command version/help only; no auth status, login, model request or credential/config inspection',platform:process.platform,node:process.version,entries};
fs.writeFileSync('feasibility/s4-provider-access/evidence/cli-inventory.json',JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(entries));
