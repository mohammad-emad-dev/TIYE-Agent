import type { TaskStore } from '../../core/dist';
import { askReceipt, questionArgs, questionResult, loopBinding, profile, createScriptedQuestionScenario,
  type AskReceipt, type QuestionArgs, type QuestionResult, type QuestionTool, type Binding, type Mode } from '../../api-adapter/dist';
import { bindReporter } from './core-report';
import { ConversationLoop } from './loop';
import type { ContextReader, Pause } from './types';
export interface Questioner extends ContextReader {
  readonly taskId:string;readonly tool:QuestionTool;
  submitQuestion(callId:string,canonicalCommand:string):AskReceipt;
  readAnswer(receipt:AskReceipt,args:QuestionArgs):{status:'open'}|QuestionResult;
}
function bind(store:TaskStore,binding:Binding,taskId:string):Questioner {
  const measured=<T>(operation:()=>T):T=>{const started=Date.now(),result=operation();
    if(Date.now()-started>=10000)throw new Error('core-question-deadline');return result;};
  const state=()=>{
    const snapshot=store.snapshot(),session=snapshot.sessions?.[0]?.[1];
    const assignment=snapshot.assignments?.find(([id])=>id===taskId)?.[1];
    if(!session||session.sessionId!==binding.sessionId||session.status!=='active'||!assignment
      ||assignment.sessionId!==binding.sessionId||assignment.memberId!==binding.memberId
      ||!session.members.some(row=>row.memberId===binding.memberId))throw new Error('question-binding-inactive');
    return {snapshot,session,assignment};
  };
  const initial=state();if(initial.assignment.closed)throw new Error('question-binding-closed');
  const tool:QuestionTool=initial.session.leaderId===binding.memberId?'ask_user':'ask_leader';
  const recipient=tool==='ask_user'?'owner' as const:'leader' as const;
  const handle=store.member(binding.memberId),context=handle.context,ask=handle.ask,questions=handle.questions;
  const known=(receipt:AskReceipt)=>{
    const current=state(),command=current.snapshot.commands.find(([id])=>id===receipt.commandId)?.[1];
    if(receipt.taskId!==taskId||receipt.recipient!==recipient||!command||command.result!==receipt.decision)throw new Error('question-receipt-mismatch');
    return current;
  };
  return Object.freeze({binding,taskId,tool,active:()=>measured(()=>{state();}),read:()=>measured(()=>{state();return profile(context(),binding);}),
    submitQuestion:(callId:string,canonicalCommand:string)=>measured(()=>{
      if(Buffer.byteLength(canonicalCommand,'utf8')>16384)throw new Error('question-command-bytes');
      const command=JSON.parse(canonicalCommand);
      if(!command||typeof command!=='object'||Object.keys(command).length!==8||command.type!=='team.question.ask'||command.version!==1
        ||command.sessionId!==binding.sessionId||command.taskId!==taskId||JSON.stringify(command)!==canonicalCommand)throw new Error('question-command-binding');
      const args=questionArgs({text:command.text,options:command.options});state();
      askReceipt({callId,commandId:command.commandId,questionId:command.questionId,taskId,decision:'rejected',recipient});
      const decision=ask(Buffer.from(canonicalCommand,'utf8'));
      const receipt=askReceipt({callId,commandId:command.commandId,questionId:command.questionId,taskId,decision,recipient}),current=known(receipt);
      const question=current.snapshot.questions?.find(([id])=>id===receipt.questionId)?.[1];
      if(decision==='accepted'?(!question||question.authorId!==binding.memberId||question.taskId!==taskId||question.sessionId!==binding.sessionId
        ||question.status!=='open'||question.recipient!==recipient||question.text!==args.text||JSON.stringify(question.options)!==JSON.stringify(args.options)
        ||current.snapshot.tasks.find(([id])=>id===taskId)?.[1]!=='blocked'||current.assignment.closed):!!question)throw new Error('question-projection-mismatch');
      return receipt;
    }),
    readAnswer:(value:AskReceipt,valueArgs:QuestionArgs)=>measured(()=>{
      const receipt=askReceipt(value),args=questionArgs(valueArgs),current=known(receipt);
      if(receipt.decision!=='accepted')throw new Error('question-not-accepted');
      const question=questions().find(row=>row.questionId===receipt.questionId);
      if(!question||question.sessionId!==binding.sessionId||question.taskId!==taskId||question.authorId!==binding.memberId
        ||question.initialRecipient!==recipient||question.text!==args.text||JSON.stringify(question.options)!==JSON.stringify(args.options))throw new Error('question-answer-binding');
      if(question.status==='open')return Object.freeze({status:'open' as const});
      if(question.status!=='answered'||question.answeredBy!==(question.recipient==='owner'?'owner':current.session.leaderId))throw new Error('question-answer-unavailable');
      const {answer}=question;
      return questionResult({receipt,status:'answered',answer,answeredBy:question.answeredBy,recipient:question.recipient},args);
    })});
}
/** Trusted fixture coordinator; no answer writer is exposed to the model loop. */
export function createCoreQuestionScenario(store:TaskStore){
  const adapters=createScriptedQuestionScenario(),members=new Set<string>(),loops:ConversationLoop[]=[];
  let sessionId:string|undefined,disposed=false;
  return {
    create(value:unknown,mode:Mode='question-member',pause:Pause='none'){
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('question-binding');
      const row=value as Record<string,unknown>;
      if(Object.keys(row).length!==4||!['version','sessionId','memberId','taskId'].every(k=>Object.hasOwn(row,k)))throw new Error('question-binding-fields');
      const binding=loopBinding({version:row.version,sessionId:row.sessionId,memberId:row.memberId});
      if(typeof row.taskId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(row.taskId))throw new Error('question-task-id');
      if(disposed||loops.length>=2||members.has(binding.memberId)||sessionId&&sessionId!==binding.sessionId
        ||!['none','before-read','after-read','before-report','after-report','before-continuation','after-dispatch',
          'before-ask','after-ask','before-answer','after-answer'].includes(pause))throw new Error('question-scenario-bound');
      const reader=bind(store,binding,row.taskId),reporter=bindReporter(store,binding,row.taskId),api=adapters.create(binding,mode);
      const loop=new ConversationLoop(reader,api.adapter,pause,reporter,reader);
      members.add(binding.memberId);sessionId=binding.sessionId;loops.push(loop);
      return {loop,fixture:{inspect:()=>loop.inspect(),adapter:()=>api.fixture.inspect(),release:()=>loop.release(),
        releaseAdapter:api.fixture.release,late:api.fixture.late,waitAdapter:api.fixture.waitFor}};
    },
    async dispose(){disposed=true;await Promise.all(loops.map(loop=>loop.dispose()));await adapters.dispose();}
  };
}
