'use strict';
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {FeedClient}=require('./worker-client'),{EVENT_COUNT,eventAt,fixtureDigest}=require('./fixture');
const root=process.env.TIYE_S5_FEED_ROOT,nodeBinary=process.env.TIYE_S5_NODE_BINARY;
if(!root||!path.isAbsolute(root)||!fs.existsSync(path.join(root,'.owner'))||!nodeBinary||!path.isAbsolute(nodeBinary))throw Error('owned-feed-root-required');
app.setPath('userData',path.join(root,'electron-state'));app.disableHardwareAcceleration();
let window,client,failed=false;const pageReports=[];
function validatePage(request){
  if(!request||!Number.isInteger(request.offset)||request.offset<0||request.offset>EVENT_COUNT||request.limit!==20||typeof request.query!=='string'||request.query.length>64||
    (request.query.trim()&&!/^\p{L}[\p{L}\p{N}_]*(?:\s+\p{L}[\p{L}\p{N}_]*){0,7}$/u.test(request.query.trim())))throw Error('invalid-page');
}
function own(event){if(event.sender!==window.webContents)throw Error('foreign-renderer');}
function verifyReport(report,expectedIds,total){
  assert.deepEqual(report.ids,expectedIds);assert.equal(report.total,total);assert.equal(report.domRows,expectedIds.length);
  assert.equal(report.documentVisible,true);assert.equal(report.visible,expectedIds.length>0);
  assert(Number.isFinite(report.queryMs)&&report.queryMs>=0);assert(Number.isFinite(report.requestToRafMs)&&report.requestToRafMs>=0);
  for(let index=0;index<expectedIds.length;index++)assert(report.renderedText[index].endsWith(eventAt(expectedIds[index]).text));
}
async function run(){
  client=new FeedClient(nodeBinary,root);const load=await client.request('load');
  assert.equal(load.integrity.count,EVENT_COUNT);assert.equal(load.integrity.sha256,fixtureDigest());assert.equal(load.reopened,true);
  window=new BrowserWindow({width:1280,height:900,show:true,webPreferences:{preload:path.join(__dirname,'dist/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
  ipcMain.handle('feed-page',async(event,request)=>{own(event);validatePage(request);return client.request('page',request);});
  ipcMain.handle('feed-rendered',(event,report)=>{own(event);if(pageReports.length>=10)throw Error('report-limit');pageReports.push(report);return true;});
  await window.loadFile(path.join(__dirname,'dist/index.html'));window.show();window.focus();
  const visibleAtStart=window.isVisible(),observations=await window.webContents.executeJavaScript('window.__feedProbe()');
  verifyReport(observations.baseline,Array.from({length:20},(_,index)=>index+1),EVENT_COUNT);
  verifyReport(observations.tail,Array.from({length:20},(_,index)=>EVENT_COUNT-19+index),EVENT_COUNT);
  verifyReport(observations.search,Array.from({length:20},(_,index)=>(index+1)*997),Math.floor(EVENT_COUNT/997));
  verifyReport(observations.empty,[],0);verifyReport(observations.restored,observations.baseline.ids,EVENT_COUNT);
  assert.equal(pageReports.length,5);await client.close();
  const evidence={schema:'tiye-s5-feed-native-v1',load,observations,visibleAtStart,visibleAtEnd:window.isVisible(),versions:{electron:process.versions.electron},
    providerRequests:0,combinedPtyWorkload:false,hourMixedWorkloadQualified:false,memorySettlingQualified:false,fullS5Qualified:false,productionEligible:false};
  fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(evidence),{flag:'wx'});app.quit();
}
function fail(error){if(failed)return;failed=true;console.error(error.message);if(client&&!client.closed)client.worker.kill();app.exit(1);}
app.whenReady().then(run).catch(fail);
