import type { CoordinationMessage, DelegationReceipt, Binding, QuestionMessage, MissionMessage, MissionReceipt, AskReceipt, QuestionResult, ReportReceipt, MemberEvent, Profile } from '../../api-adapter/dist';
export type Pause='none'|'before-read'|'after-read'|'before-continuation'|'after-dispatch'|'before-report'|'after-report'|'before-ask'|'after-ask'|'before-answer'|'after-answer'|'before-mission'|'after-mission'|'before-delegation'|'after-delegation';
export type OutcomeState='response_complete'|'failed'|'needs_attention'|'stopped';
export interface Outcome {
  runId:string;state:OutcomeState;reason:string;text:string;requests:number;toolReads:number;statusChecks:number;
  history:readonly (QuestionMessage|MissionMessage|CoordinationMessage)[];localClosed:boolean;reportAttempts?:number;reportState?:'none'|'accepted'|'rejected'|'uncertain';reportReceipt?:ReportReceipt;reportCommandId?:string;questionAttempts?:number;answerReads?:number;questionState?:'none'|'accepted'|'rejected'|'answered'|'uncertain';questionId?:string;questionCommandId?:string;questionReceipt?:AskReceipt;answerResult?:QuestionResult;missionAttempts?:number;missionState?:'none'|'accepted'|'rejected'|'uncertain';missionCommandId?:string;missionReceipt?:MissionReceipt;delegationAttempts?:number;delegationState?:'none'|'accepted'|'rejected'|'uncertain';delegationReceipt?:DelegationReceipt;delegationCommandId?:string;
}
export interface ContextReader {readonly binding:Binding;active():void;read():Profile}
export interface Event extends Binding {type:string;runId:string|null;requestId?:string;phase?:string;state?:OutcomeState;reason?:string;text?:string;questionId?:string}
export type Subscriber=(event:Event)=>void|Promise<void>;
export interface RequestSlot {id:string;generation:number;bytes:number;terminal:MemberEvent|null}
