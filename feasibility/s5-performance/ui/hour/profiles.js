'use strict';
const profiles={smoke:{name:'smoke',mixedMs:90000,idleMs:30000,viewMs:15000,cycleMs:30000,floodMs:10000,inputMs:5000},
  hour:{name:'hour',mixedMs:3600000,idleMs:60000,viewMs:300000,cycleMs:300000,floodMs:60000,inputMs:30000}};
function profileFor(name){if(!Object.hasOwn(profiles,name))throw Error('unknown-profile');return {...profiles[name]};}
module.exports={profileFor};
