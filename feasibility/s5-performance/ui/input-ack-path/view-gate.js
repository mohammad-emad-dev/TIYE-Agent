'use strict';
const assert=require('node:assert/strict');
function createViewGate({clock,dispatch,change,inputPending,wait,setView}){
  let transitioning=false,pendingInput=null;
  return {
    input(packet){
      assert(!pendingInput,'queued-input-overlap');
      if(transitioning){pendingInput={...packet,viewWaitStartMs:clock()};return;}
      dispatch(packet);
    },
    async switchTo(next){
      assert(!transitioning,'overlapping-view-change');while(inputPending())await wait();
      transitioning=true;const confirmed=await change(next);assert.equal(confirmed,next,'view-change-unconfirmed');setView(confirmed);transitioning=false;
      if(pendingInput){const packet={...pendingInput,viewWaitEndMs:clock()};pendingInput=null;dispatch(packet);}
    },
    snapshot(){return structuredClone({mode:'input-view-exclusion',transitioning,pendingInput});}
  };
}
module.exports={createViewGate};
