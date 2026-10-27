import { ScriptedAdapter } from './adapter';
import { MODES, type Mode } from './scripted';
import { binding, check } from './validation';
export { AdapterRefusal } from './validation';
export type { Binding, Capabilities, CleanupResult, Detection, Input, LaunchContext, MemberAdapter, MemberEvent, State, TaskInput, UserMessage } from './types';

/** Fixed test composition only. No public arbitrary transport constructor. */
export function createScriptedScenario() {
  check(process.version === 'v26.7.0' && process.platform === 'win32' && process.arch === 'x64'
    && process.versions.modules === '147', 'unqualified-adapter-runtime');
  const adapters: ScriptedAdapter[]=[];
  let disposed=false;
  return {
    create(context: unknown, mode: Mode) {
      check(!disposed && adapters.length < 2 && MODES.includes(mode), 'scenario-bound-or-mode');
      const adapter=new ScriptedAdapter(binding(context),mode);adapters.push(adapter);
      return {adapter:adapter as import('./types').MemberAdapter,
        fixture:{inspect:()=>adapter.inspect(),waitFor:adapter.waitFor.bind(adapter),settled:adapter.settled.bind(adapter),
          release:adapter.release.bind(adapter),late:adapter.late.bind(adapter)}};
    },
    async dispose(): Promise<void> { disposed=true;await Promise.all(adapters.map(adapter=>adapter.dispose())); }
  };
}
