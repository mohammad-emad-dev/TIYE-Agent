import { ScriptedAdapter } from './adapter';
import { LOOP_MODES, REPORT_MODES, QUESTION_MODES, MISSION_MODES, MODES, type Mode } from './scripted';
import { binding, check } from './validation';
export { AdapterRefusal } from './validation';
export type { Binding, Capabilities, CleanupResult, Detection, Input, LaunchContext, MemberAdapter, MemberEvent, State, TaskInput, UserMessage } from './types';
export { loopInput, history, profile, loopBinding } from './loop-contract';
export type { LoopInput, LoopMessage, Profile } from './loop-contract';
export { reportArgs, reportReceipt, reportHistory, reportInput } from './report-contract';
export type { ReportArgs, ReportReceipt, ReportMessage, ReportInput } from './report-contract';
export { questionArgs, askReceipt, questionResult, questionHistory, questionInput, resumeInput } from './question-contract';
export type { QuestionArgs, AskReceipt, QuestionResult, QuestionMessage, QuestionTool, QuestionInput, Answer } from './question-contract';
export { missionArgs, missionReceipt, missionHistory, missionInput } from './mission-contract';
export type { MissionArgs, MissionReceipt, MissionMessage, MissionInput, Completion } from './mission-contract';
export type { Mode } from './scripted';

/** Fixed test composition only. No public arbitrary transport constructor. */
export function createScriptedScenario() {
  return scenario('text');
}
export function createScriptedLoopScenario(){return scenario('context');}
export function createScriptedReportingScenario(){return scenario('report');}
export function createScriptedQuestionScenario(){return scenario('question');}
export function createScriptedMissionScenario(){return scenario('mission');}
function scenario(profile:import('./types').AdapterProfile) {
  check(process.version === 'v26.7.0' && process.platform === 'win32' && process.arch === 'x64'
    && process.versions.modules === '147', 'unqualified-adapter-runtime');
  const adapters: ScriptedAdapter[]=[];
  let disposed=false;
  return {
    create(context: unknown, mode: Mode) {
      check(!disposed && adapters.length < (profile==='mission'?1:2) && ({text:MODES,context:LOOP_MODES,report:REPORT_MODES,question:QUESTION_MODES,mission:MISSION_MODES}[profile] as readonly string[]).includes(mode), 'scenario-bound-or-mode');
      const adapter=new ScriptedAdapter(binding(context),mode,profile);adapters.push(adapter);
      return {adapter:adapter as import('./types').MemberAdapter,
        fixture:{inspect:()=>adapter.inspect(),waitFor:adapter.waitFor.bind(adapter),settled:adapter.settled.bind(adapter),
          release:adapter.release.bind(adapter),late:adapter.late.bind(adapter)}};
    },
    async dispose(): Promise<void> { disposed=true;await Promise.all(adapters.map(adapter=>adapter.dispose())); }
  };
}
