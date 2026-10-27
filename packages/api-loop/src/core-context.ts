import type { TaskStore } from '../../core/dist';
import { createScriptedLoopScenario, loopBinding, profile, type Binding, type Mode } from '../../api-adapter/dist';
import { ConversationLoop } from './loop';
import type { ContextReader, Pause } from './types';

function bind(store:TaskStore,binding:Binding):ContextReader {
  const measured=<T>(read:()=>T):T=>{const started=Date.now();const value=read();if(Date.now()-started>=10000)throw new Error('core-read-deadline');return value;};
  const active=()=>measured(()=>{
    const sessions=store.snapshot().sessions;const session=sessions?.[0]?.[1];
    if(!session||session.sessionId!==binding.sessionId||session.status!=='active'
      ||!session.members.some(member=>member.memberId===binding.memberId))throw new Error('core-session-inactive');
  });
  active();const context=store.member(binding.memberId).context;
  return Object.freeze({binding,active,read:()=>measured(()=>{active();return profile(context(),binding);})});
}

/** Trusted coordinator entry. No store or role handle is returned to the loop. */
export function createCoreLoopScenario(store:TaskStore) {
  const adapters=createScriptedLoopScenario(),members=new Set<string>(),loops:ConversationLoop[]=[];
  let sessionId:string|undefined,disposed=false;
  return {
    create(value:unknown,mode:Mode='loop-context',pause:Pause='none') {
      const binding=loopBinding(value);
      if(disposed||loops.length>=2||members.has(binding.memberId)||(sessionId&&sessionId!==binding.sessionId)
        ||!['none','before-read','after-read','before-continuation','after-dispatch'].includes(pause))throw new Error('loop-scenario-bound');
      const reader=bind(store,binding),api=adapters.create(binding,mode),loop=new ConversationLoop(reader,api.adapter,pause);
      sessionId=binding.sessionId;members.add(binding.memberId);loops.push(loop);
      return {loop,fixture:{inspect:()=>loop.inspect(),adapter:()=>api.fixture.inspect(),release:()=>loop.release(),
        releaseAdapter:(id:string)=>api.fixture.release(id),late:(id:string)=>api.fixture.late(id),waitAdapter:api.fixture.waitFor}};
    },
    async dispose(){disposed=true;await Promise.all(loops.map(loop=>loop.dispose()));await adapters.dispose();}
  };
}
