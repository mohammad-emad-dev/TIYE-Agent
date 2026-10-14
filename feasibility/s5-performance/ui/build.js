'use strict';
const fs=require('node:fs'),path=require('node:path');
const {s1Require,s1Modules}=require('./toolchain');
async function build() {
  const dist=path.join(__dirname,'dist');fs.mkdirSync(dist,{recursive:true});
  await s1Require('esbuild').build({entryPoints:[path.join(__dirname,'src/renderer.js')],outfile:path.join(dist,'renderer.js'),bundle:true,platform:'browser',format:'iife',nodePaths:[s1Modules]});
  await s1Require('esbuild').build({entryPoints:[path.join(__dirname,'src/preload.cjs')],outfile:path.join(dist,'preload.cjs'),bundle:true,platform:'node',format:'cjs',external:['electron']});
  fs.copyFileSync(path.join(__dirname,'src/index.html'),path.join(dist,'index.html'));
  fs.copyFileSync(path.join(s1Modules,'@xterm/xterm/css/xterm.css'),path.join(dist,'xterm.css'));
  console.log('S5 renderer and preload built with existing S1 toolchain');
}
build().catch(error=>{console.error(error);process.exitCode=1;});
