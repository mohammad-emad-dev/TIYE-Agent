export interface Binding { readonly version: 1; readonly sessionId: string; readonly memberId: string }
export interface LaunchContext extends Binding { readonly briefing: string }
export type TaskInput = { version: 1; kind: 'task'; requestId: string; taskId: string; text: string };
export type UserMessage = { version: 1; kind: 'message'; requestId: string; text: string };
export type Input = TaskInput | UserMessage | import('./loop-contract').LoopInput | import('./report-contract').ReportInput;
export type State = 'unstarted' | 'ready' | 'running' | 'cancelling' | 'needs_attention' | 'stopped';
export type Reason = 'creation_failure' | 'ambiguous_creation' | 'transport_error' | 'disconnect'
  | 'protocol_fault' | 'unsupported_tool' | 'deadline' | 'owner_interrupt' | 'owner_stop' | 'abort_failure';
export type EventType = 'request.admitted' | 'text.delta' | 'response.completed'
  | 'request.interrupted' | 'request.failed' | 'request.uncertain' | 'adapter.stopped' | 'response.tool_requested';
export interface MemberEvent extends Binding {
  readonly type: EventType; readonly requestId: string | null; readonly taskId: string | null;
  readonly generation: number | null; readonly text?: string; readonly reason?: Reason; readonly localClosed?: boolean;
  readonly runId?: string; readonly turn?: number; readonly callId?: string; readonly tool?: 'get_my_context'|'report_result'; readonly arguments?: import('./report-contract').ReportArgs; readonly receivedBytes?: number;
}
export interface CleanupResult { readonly state: State; readonly localClosed: boolean; readonly remoteVerified: false }
export interface Capabilities {
  readonly textStreaming: true; readonly realProviders: false; readonly tools: false;
  readonly files: false; readonly commands: false; readonly remoteCancellationVerified: false;
  readonly readOnlyToolCandidates?: true; readonly reportToolCandidates?: true;
}
export interface Detection { readonly kind: 'scripted-api'; readonly available: true; readonly realProvider: false }
export type EventSubscriber = (event: MemberEvent) => void | Promise<void>;
export interface MemberAdapter {
  detect(): Promise<Detection>; start(context: unknown): Promise<void>; send(input: unknown): Promise<void>;
  onEvent(callback: EventSubscriber): () => void;
  interrupt(): Promise<CleanupResult>; stop(): Promise<CleanupResult>; capabilities(): Capabilities;
}
export interface RequestContext extends Binding { readonly requestId: string; readonly generation: number }
export type Phase = 'opened' | 'end_candidate' | 'aborted' | 'closed';
