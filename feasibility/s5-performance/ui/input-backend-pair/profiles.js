'use strict';
const profile=Object.freeze({mixedMs:180000,idleMs:10000,viewMs:30000,cycleMs:60000,floodMs:20000,inputMs:5000,searchLeadMs:750,searchBarrierTimeoutMs:3000,injectedDelayOrdinal:7,injectedDelayMs:120});
function profileFor(name){if(!['pty','direct'].includes(name))throw Error('unknown-profile');return {...profile,name,probeTransport:'pipe',backendTopology:name==='pty'?'five-bundled-conpty':'member0-direct-pipe-others-bundled-conpty'};}
module.exports={profileFor};
