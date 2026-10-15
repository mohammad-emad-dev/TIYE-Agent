'use strict';
const profile=Object.freeze({name:'foreground',mixedMs:120000,idleMs:10000,viewMs:30000,cycleMs:60000,floodMs:60000,inputMs:2000});
function profileFor(name){if(name!==profile.name)throw Error('unknown-profile');return {...profile};}
module.exports={profileFor};
