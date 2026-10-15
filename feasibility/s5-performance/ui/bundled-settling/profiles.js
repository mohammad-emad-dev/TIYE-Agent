'use strict';
const profile=Object.freeze({name:'settling',mixedMs:180000,idleMs:300000,viewMs:30000,cycleMs:60000,floodMs:20000,inputMs:5000});
function profileFor(name){if(name!=='settling')throw Error('unknown-profile');return {...profile};}
module.exports={profileFor};
