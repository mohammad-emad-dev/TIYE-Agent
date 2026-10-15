'use strict';
const fs=require('node:fs'),path=require('node:path');
const {s1Require,s1Modules}=require('../toolchain');
async function build(){const dist=path.join(__dirname,'dist');fs.mkdirSync(dist,{recursive:true});const esbuild=s1Require('esbuild');
  await esbuild.build({entryPoints:[path.join(__dirname,'renderer.js')],outfile:path.join(dist,'renderer.js'),bundle:true,platform:'browser',nodePaths:[s1Modules]});
  await esbuild.build({entryPoints:[path.join(__dirname,'preload.cjs')],outfile:path.join(dist,'preload.cjs'),bundle:true,platform:'node',format:'cjs',external:['electron']});
  fs.copyFileSync(path.join(__dirname,'index.html'),path.join(dist,'index.html'));fs.copyFileSync(path.join(s1Modules,'@xterm/xterm/css/xterm.css'),path.join(dist,'xterm.css'));}
build().catch(error=>{console.error(error);process.exitCode=1;});
