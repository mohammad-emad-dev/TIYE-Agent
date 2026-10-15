'use strict';
const profile=Object.freeze({name:'trace',mixedMs:180000,idleMs:10000,viewMs:30000,cycleMs:60000,floodMs:20000,inputMs:5000});
function profileFor(name){if(name!=='trace')throw Error('unknown-profile');return {...profile};}
module.exports={profileFor};
