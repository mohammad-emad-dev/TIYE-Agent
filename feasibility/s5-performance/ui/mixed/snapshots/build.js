'use strict';
const fs=require('node:fs'),path=require('node:path'),{s1Require}=require('../toolchain');
async function build(){
  const dist=path.join(__dirname,'dist');fs.mkdirSync(dist,{recursive:true});
  await s1Require('esbuild').build({entryPoints:[path.join(__dirname,'preload.cjs')],outfile:path.join(dist,'preload.cjs'),bundle:true,platform:'node',format:'cjs',external:['electron']});
  for(const name of ['renderer.js','index.html'])fs.copyFileSync(path.join(__dirname,name),path.join(dist,name));
}
build().catch(error=>{console.error(error);process.exitCode=1;});
