'use strict';
const profile=Object.freeze({name:'trace',mixedMs:180000,idleMs:10000,viewMs:30000,cycleMs:60000,floodMs:20000,inputMs:5000,searchLeadMs:750,searchBarrierTimeoutMs:3000});
function profileFor(name){if(!['pipe','ipc'].includes(name))throw Error('unknown-profile');return {...profile,name,probeTransport:name};}
module.exports={profileFor};
