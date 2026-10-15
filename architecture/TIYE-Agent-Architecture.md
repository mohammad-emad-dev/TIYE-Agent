# TIYE Agent: Technical Architecture

| | |
|---|---|
| **Product** | TIYE Agent, a desktop application for multi-model coding teams |
| **Document** | Technical architecture, derived from the Product Specification |
| **Platform** | Windows first. macOS and Linux later. |
| **Stack** | Electron, TypeScript, SQLite, xterm.js |
| **Status** | Architecture complete and confirmed. Feasibility tests come before implementation. |
| **Date** | October 2026 |

How to read this document: Part A gives the big picture. Part B covers each subsystem in detail, followed by cross-cutting concerns, feasibility tests, the build order, and risks. Part C records the decisions, the open items, and the changes to the specification. Section references like "Spec 7.2" point to the Product Specification.

---

# Part A. Overview

## A1. Architectural principles

| # | Principle | What it means in practice |
|---|---|---|
| 1 | **The event log is the source of truth** | Every message, task, command, file edit, approval, and failure is stored as an event. History, search, checkpoints, and crash recovery all come from the same log. |
| 2 | **The UI is only a view** | The interface renders the log and sends commands. A UI crash or reload never interrupts a team. |
| 3 | **One adapter interface for every member** | CLI, API, and login members look identical to the team engine, the feed, and the Leader. |
| 4 | **The engine routes, not the models** | Delegation and handoffs go through explicit tools and a state machine, never through parsing free text. |
| 5 | **Isolation over detection** | Each editing member works in its own Git worktree, so conflicts are prevented, not just detected. |
| 6 | **Local-first** | All project data stays on the device. The only server contact is the license and limit check and the update check. |
| 7 | **Separate what can fail or be hostile** | The core service, the plugin host, and each CLI run as separate processes. |
| 8 | **Platform code is isolated** | Terminals, key storage, and process launching sit behind interfaces so later ports are small. |

## A2. System overview

```
┌────────────────────────────────────────────────────────────────────────┐
│ UI (renderer, sandboxed)                                               │
│ Team feed · Member bar · Terminals (xterm.js) · Code viewer            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ typed, validated IPC
┌───────────────────────────────────┴────────────────────────────────────┐
│ MAIN PROCESS                                                           │
│ Windows · tray · notifications · secure key storage                    │
│ License client · updater                                               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ message channel
┌───────────────────────────────────┴────────────────────────────────────┐
│ CORE SERVICE (separate process)                                        │
│ Team engine · Harness adapters · File guard and Git                    │
│ Event store (SQLite) · Search · Checkpoints                            │
└────────────────────────────────────────────────────────────────────────┘
```

The core service also connects to the outside world:

```
┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
│   CLI members   │   API members   │   Plugin host   │       Git       │
│ pseudo-terminals│  provider HTTPS │ isolated process│ worktrees, refs │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

| Process | Responsibility | Why it is separate |
|---|---|---|
| **UI (renderer)** | Screens only. No file, process, or network access. | Security, and so a UI reload never stops a team. |
| **Main process** | Windows and tray, notifications, secure key storage, license client, updater, and ownership of CLI pseudo-terminals and process trees. | Owns operating-system resources that must survive a core restart. |
| **Core service** | Team engine, harness control logic, file guard, Git, event store, search. | The product's heart must survive UI crashes and keep running when the window closes. |
| **Plugin host** | Runs plugin code. | A faulty or hostile plugin cannot reach the core or the user's keys. |
| **Member processes** | One pseudo-terminal process per CLI member. | Each CLI runs in its own native environment, as the product requires. |

## A3. A delegation, end to end

```
     Leader            Engine             Coder              UI
        │                 │                 │                 │
        │  delegate_task  │                 │                 │
        │────────────────►│                 │                 │
        │                 │ task + briefing │                 │
        │                 │────────────────►│                 │
        │                 │    ask_leader   │                 │
        │                 │◄────────────────│                 │
        │     question    │                 │                 │
        │◄────────────────│                 │                 │
        │      answer     │                 │                 │
        │────────────────►│                 │                 │
        │                 │      answer     │                 │
        │                 │────────────────►│                 │
        │                 │  report_result  │                 │
        │                 │◄────────────────│                 │
        │      result     │                 │                 │
        │◄────────────────│                 │                 │
        │                 │                 │                 │
    └── every step is also written to the event log and streamed to the UI
```

---

# Part B. Subsystems

## 1. Technology Stack

**Decision:** Electron with TypeScript (agreed).

| Layer | Choice | Reason |
|---|---|---|
| App shell | **Electron** | Proven embedded terminals, strong right-to-left and CJK text support, large plugin-friendly ecosystem, and easy macOS and Linux ports. |
| Language | **TypeScript** everywhere | One language for UI, core, harness, and plugins, with shared typed schemas. |
| UI framework | **React** with a typed state store | Mature, with virtualized lists for the feed. |
| Terminal display | **xterm.js** | Standard embedded terminal, with flow control for fast output. |
| Pseudo-terminals | **node-pty** (ConPTY on Windows) | Runs each CLI in a real terminal, as the user would see it in Windows. |
| Database | **SQLite** (better-sqlite3) in WAL mode | Local, fast, one file per project, with built-in full-text search (FTS5). |
| Schemas | **Zod** (or equivalent) | One definition validates events, IPC messages, plugin manifests, and tool calls. |
| Code viewer | **CodeMirror 6** (read-only, with diff view) | Lightweight, with good right-to-left and Unicode handling. |
| Git | System **git** through a thin wrapper | Real Git behavior for worktrees and attribution. |
| Team tools | **MCP** (Model Context Protocol) server hosted by the core | One tool protocol that CLI and API members both understand. |
| Internationalization | **i18next** with ICU messages | Seven languages, switchable at runtime. |
| Packaging and updates | **electron-builder** and **electron-updater**, with Windows code signing | Signed installers and signed update packages. |
| Tests | Unit tests, a **mock CLI** for adapter contracts, **Playwright** for end-to-end | See Section 10. |

## 2. Processes and Communication

### 2.1 Process model

| Channel | Between | Mechanism |
|---|---|---|
| UI ⇄ Main | Renderer and main | Electron IPC through a narrow, typed, validated API. Context isolation on, Node integration off. |
| Main ⇄ Core | Main and core service | Message channel to a utility process started by the main process. |
| Core ⇄ CLI member | Core, main, and each CLI | Main owns the pseudo-terminal and process tree; core sends input and receives output through main, and hosts the team-tools MCP connection for control. |
| Core ⇄ API member | Core and provider | HTTPS to the provider, driven by the core's own agent loop. |
| Core ⇄ Plugin host | Core and plugin host | JSON-RPC over a pipe, with capability checks on every call. |
| Core ⇄ Git | Core and git | Child processes of the system git. |
| Main ⇄ TIYE server | Main and the TIYE server | HTTPS, for the license and limit check and the update check only. |

### 2.2 Window close, quit, and crash outcomes

Two terms apply everywhere below:

- **Intentionally running (owned):** a CLI process tree listed in the main process registry (Section 2.3) whose owner is alive and whose last intent is run/keep-running. It is expected to be alive.
- **Orphan:** a previously owned CLI (or core) process tree that is still alive after its owner intended it stopped, or that has no live owner left to track and reap it. Only this counts as a leak. An intentionally running tree is never an orphan.

| Situation | Outcome |
|---|---|
| Close window, choose **keep running** | The window (UI) closes only. Main, core, and member CLI trees keep running in the tray. Members are intentionally running, not orphans. The tray shows status and raises a notification when the team finishes, fails, or needs approval. |
| Close window, choose **stop** | The engine stops the team first (Section 4.6: interrupt, then terminate each CLI tree after a short timeout, including child processes). The window then closes. No member process may survive this path: main verifies each owned tree is gone and reports any survivor as an orphan. Main and core themselves may stay alive idle in the tray. |
| **Quit from tray** | After confirmation, the app stops all teams the same way, then terminates the core, then exits main. No owned CLI or core process may survive. Main performs a registry sweep before exit and reports any survivor as an orphan. |
| **Renderer (UI) crash** | UI only. Main, core, and members are unaffected. The UI restarts and rebuilds from the event log. Running members stay owned throughout. |
| **Core crash** | Main retains the member PTYs and CLI trees while restarting the core. The restarted core reconciles members per Section 2.3 (re-subscribe to a surviving owned tree or terminate-then-relaunch, never blindly duplicate). Sessions are rebuilt from the log. |
| **Whole-app crash (main dies)** | The main process loses its PTY handles. The Windows process-tree owner is configured to terminate its children when main exits; S1 must verify this. On next launch, any survivors are matched against durable process identities before cleanup. An unverified process is never killed by PID alone; recovery pauses that member and alerts the user. Session recovery from the log uses no new quota (Spec 9.3). |

- On window close, the app asks the user once: **keep running in the background** or **stop the team**. The choice can be remembered per the existing decision (C1.4).
- Quitting from the tray always means the stop-all path above; there is no "quit but leave members running" option.

### 2.3 Process ownership, crash behavior, and core reconciliation

**Owned-process tracking (main process).** Main owns the pseudo-terminal handle and process tree for every CLI member. The core requests launches and terminations through main, which records session/member id, PID, process creation identity, and last intent before the CLI counts as running. A minimal durable registry supports cleanup after a main crash; PID alone is never sufficient to identify a survivor because PIDs can be reused. On Windows, the process tree should also be placed in an OS job that terminates it when the main process exits; S1 verifies that behavior before it becomes a release guarantee. Main monitors liveness, performs interrupt-then-terminate-tree shutdown (Sections 4.6, 5.2), and verifies death. Cleanup targets only verified owned trees, never unrelated user processes. WSL cleanup is verified separately in S6.

| Event | Result |
|---|---|
| UI crashes or reloads | Nothing stops. The UI rebuilds from the event log. |
| Core service crashes | Main restarts it. Sessions are rebuilt from the log. Member processes are reconciled per the rule below, not blindly relaunched. |
| Plugin host crashes | Only plugin features pause. The core and teams continue. |
| Whole app crashes | On next launch the new main verifies and cleans up any surviving owned trees before relaunching those members. If a survivor cannot be identified safely, that member pauses for user action. The session state is recovered from the log (Spec 9.3) without new quota. |

**Restarted-core reconciliation (no duplicates).** On core restart, main still owns the PTY and any live CLI tree. The core asks main for its member slots, re-subscribes to output, verifies the team-tools channel, and reconciles each in-flight task against the event log before sending new work. If a tree is unreachable, main terminates and verifies it is gone before allowing a relaunch. A second process for a member slot is never started while its previous owned tree remains alive. Recovery after main exits cannot reattach to the old PTY; a verified survivor is cleaned up, then the member is relaunched and re-briefed. The task replay policy must avoid repeating external effects (Section 3).

### 2.4 Security baseline

| Control | Setting |
|---|---|
| Renderer sandbox | On |
| Context isolation | On |
| Node integration in renderer | Off |
| Content security policy | Strict, no remote code |
| IPC | Every message validated against a schema. No generic "run anything" channel. |
| API keys | Held only by main and core. Never exposed to the renderer or to plugins. |

---

## 3. Data and the Event Store

**In short:** one append-only event log per project holds everything. Every other view of the data is derived from it.

### 3.1 Storage layout

| Item | Location | Notes |
|---|---|---|
| App settings, presets, plugin registry | `app.db` in the app data folder | One small database for the whole app |
| Project history | `projects/<project-id>/project.db` | One database per project, stored in the app data folder, so the user's repository stays clean |
| Terminal output | Compressed chunks linked from `project.db` | Append-only |
| Worktrees | `worktrees/<project-id>/<member>/` in the app data folder | See Section 6 |
| Plugins | `plugins/<plugin-id>/` | Installed from links or local files |
| API keys and license token | Operating-system secure storage (Windows DPAPI through Electron `safeStorage`) | Never in plain files |
| Logs | `logs/` | Local only, with an export option for support |

### 3.2 Event envelope

Every event has the same outer shape:

| Field | Meaning |
|---|---|
| `id` | Unique, time-sortable identifier (ULID) |
| `session_id` | The team session it belongs to |
| `seq` | Strictly increasing number within the session |
| `ts` | Timestamp |
| `actor` | `user`, a member id, `engine`, or `system` |
| `type` | The event type (Section 3.3) |
| `target` | The member or object it is addressed to, if any |
| `causation_id` | The event that caused this one, so chains can be traced |
| `command_id` | Stable identifier for a user or member request; repeated delivery of the same ID has one accepted outcome |
| `effect_id` | Stable identifier for an external action caused by the command, when applicable |
| `payload` | Type-specific data, validated by schema |
| `schema_version` | For safe evolution |

Only the core service writes events, through a single writer with batched transactions. Events are never edited or deleted.

### 3.3 Event families

| Family | Examples |
|---|---|
| `session.*` | created, first_task_sent, resumed, stopped, recovered |
| `message.*` | user_to_leader, user_to_all, user_to_member, direct_terminal_input, member_to_leader |
| `task.*` | created, queued, started, waiting_approval, done, failed, cancelled |
| `tool.*` | called, result (team tools and member tools) |
| `approval.*` | requested, granted, denied |
| `file.*` | changed, blocked, reverted, ownership_assigned |
| `git.*` | commit, branch_created, merge_requested, merged, push_requested |
| `checkpoint.*` | created, restored |
| `member.*` | connected, status_changed, failed, recovered, leader_promoted |
| `usage.*` | reported (where a provider or CLI exposes it) |
| `context.*` | summarized (older context replaced for a model) |
| `system.*` | rollback_notice, update_available, offline_session |
| `command.*` | accepted, rejected, completed; keyed by `command_id` |
| `effect.*` | planned, completed, failed, needs_attention; keyed by `effect_id` |

### 3.4 Derived views (projections)

Tables rebuilt from the log, never edited directly:

| View | Content |
|---|---|
| Members | Current status, leader flag, succession order |
| Tasks | State, owner, parent task, results |
| Inboxes | Queued messages per member |
| Pending approvals | Open requests |
| File ownership | Which member owns which files or areas |
| Checkpoints | Restore points and what they contain |
| Usage | Latest reported usage per member |

### 3.5 Terminal data

- A terminal produces a stream, not discrete events. It is stored as **time-stamped, compressed chunks**, not one event per keystroke.
- A text copy with control codes stripped is added to the search index, so terminal output is searchable too.

### 3.6 Search

- **SQLite FTS5** indexes message text, task titles and results, commands, file paths, and terminal text.
- Filters by member, time, event type, and task.
- Example: "when did the reviewer reject the login page?" becomes a search for review-result events by the reviewer that mention the login page.

### 3.7 Size, export, and evolution

| Topic | Approach |
|---|---|
| Size | Terminal chunks are the largest item. They are compressed, and the user can set a retention limit that keeps the event log and prunes old terminal chunks. |
| Export and import | A project's history packs into one archive file for moving between devices. |
| Schema changes | Versioned events with upcasters that translate old events when read, so old history always opens. |

### 3.8 Durable command and external-effect contract

The event log is the source of truth for **decisions and observed outcomes**. It cannot make an external provider, CLI, filesystem operation, or Git remote part of a SQLite transaction. Recovery therefore distinguishes a known outcome from an action whose outcome is unknown.

1. Every UI command and team-tool call carries a stable `command_id`; the core records acceptance or rejection once. Duplicate delivery returns the recorded result. A task has its own `task_id`, which remains stable across retries and member handoffs.
2. The core validates the command and appends its state changes and any `effect.planned` records in **one SQLite transaction**. Each effect has an `effect_id`, target, intended operation, preconditions, and enough information to inspect its outcome. The effect runner acts only on a committed plan after any required approval is recorded.
3. After the external action, the core appends `effect.completed` or `effect.failed` and the resulting task transition in one transaction. A crash between the action and that transaction leaves the effect **uncertain**; replay must not infer success or repeat it blindly.
4. On restart, projections rebuild from events. The supervisor reconciles each planned effect with the external state and the main-owned processes (Section 2.3) before scheduling new work for the affected task. If the outcome cannot be proved, it records `effect.needs_attention`, pauses the task, and asks the user or Leader to inspect and choose a new action. A new attempt receives a new `effect_id` linked to the original.
5. Every approval binds to the exact effect, target, and proposed diff or command. An approval is single-use: a changed operation or a retry with a new effect requires a new approval.

| Effect | Recovery evidence | Automatic retry rule |
|---|---|---|
| Built-in file edit | Expected old and new content hashes, plus a checkpoint; inspect the target before deciding | Retry only if the old hash still matches and no completed new hash exists; otherwise pause for review |
| Local Git commit or merge | Recorded input and output refs and commit IDs; inspect refs and worktree state | Retry only when the recorded preconditions still hold and the operation has not already landed |
| Remote push or provider request | Provider idempotency key and response, if supported; otherwise remote state may be ambiguous | Never repeat automatically when the outcome is unknown |
| CLI task or command | Main-owned process state, task tool calls, terminal record, and worktree diff | Reattach or inspect partial work; never resend an uncertain instruction automatically |
| License session start | Stable session ID sent to the license server (Section 8.4) | Retry with the same session ID; the server counts it once |

This contract provides **at-most-once automatic execution for uncertain effects**, not exactly-once execution across external systems. A task can wait for attention rather than risk duplicate edits, charges, pushes, or commands. The affected member's inbox stays paused until reconciliation finishes; unrelated members may continue.

---

## 4. The Team Engine

**In short:** the engine runs the session as a state machine. Members talk to it through explicit tools, so handoffs are reliable.

### 4.1 Components

| Component | Job |
|---|---|
| **Session manager** | Creates, resumes, stops, and recovers sessions. Triggers the quota check at the first task. |
| **Orchestrator** | Applies the rules: who may do what, which task is next, who is the Leader. |
| **Scheduler and inboxes** | One queue per member. Runs members in parallel. |
| **Team tools server** | The MCP server that gives members their tools (Section 4.2). |
| **Approval broker** | Collects approval requests from all members and shows them in one place. |
| **Failure supervisor** | Watches members, applies the failure rules (Section 4.7). |
| **Context manager** | Per-member context modes and automatic summarization (Section 4.8). |
| **File guard** | Ownership and isolation rules (Section 6). |

### 4.2 Team tools

The core hosts one MCP server on the loopback interface only. Each member gets its **own access token**, so the engine knows who is calling and can limit what each role may use. Where a CLI supports only local-process tools, a small bridge program forwards the calls to the core.

| Tool | Available to | Purpose |
|---|---|---|
| `delegate_task` | Leader | Give a task to one or more members, with instructions and, optionally, files or areas. |
| `get_team_status` | Leader | See each member's state and open tasks. |
| `assign_files` | Leader | Set which member owns which files or areas. |
| `request_merge` | Leader | Ask the engine to merge member work (Section 6.4). |
| `ask_user` | Leader | Put a question card in the feed and wait for the answer. |
| `complete_mission` | Leader | Report the mission done to the user. |
| `report_result` | Members | Finish a task with a summary and a status. |
| `ask_leader` | Members | Ask the Leader a question in the middle of a task. |
| `get_my_context` | Members | Re-read their role, permissions, and current task. |

Because every handoff is a tool call, it is recorded as an event and can be validated. A member cannot finish a task by accident or by saying "done" in prose.

### 4.3 Task state machine

| State | Meaning | Moves to |
|---|---|---|
| **queued** | Waiting in the member's inbox | running, cancelled |
| **running** | The member is working | waiting_approval, blocked, reconciling, stopping, done, failed |
| **waiting_approval** | The member needs the user's approval | running, stopping |
| **blocked** | The member asked a question and waits for the answer | running, stopping |
| **reconciling** | A restart or uncertain external effect requires outcome inspection | running, needs_attention, stopping, done, failed |
| **needs_attention** | The effect outcome cannot be proved; the user or Leader must choose a new action | running, stopping, done, failed |
| **stopping** | Stop was accepted; process termination and effect reconciliation are pending | cancelled, needs_attention |
| **done** | The member reported a result | final |
| **failed** | The member crashed, timed out, or hit a limit | final, then the Leader takes over |
| **cancelled** | Stopped by the user or reassigned | final |

### 4.4 Inboxes and scheduling

- Each member has an inbox. A message to a **busy member waits** in its inbox until the current task ends, then is delivered. The feed shows it as queued.
- **Parallel delegation** means several members have running tasks at once. A setting limits the number of simultaneous tasks.
- The order inside an inbox is first in, first out.

### 4.5 Questions

| Flow | Behavior |
|---|---|
| **Member to Leader** | A member calls `ask_leader`. Its task becomes **blocked**. The Leader answers, and the task resumes. |
| **Leader to user** | The Leader calls `ask_user`. A question card appears in the feed with options and a free-text field, and the answer goes back to the Leader. The Leader answers what it can and passes only real decisions to the user. |

### 4.6 Stop

| Step | Action |
|---|---|
| 1 | The engine accepts Stop immediately, records it, and moves active tasks to **stopping**. The UI shows that shutdown is in progress. |
| 2 | CLI members receive an interrupt (Ctrl+C) in their terminal. |
| 3 | After a short timeout, any CLI that is still running is terminated, together with its child processes. |
| 4 | API members abort their requests and agent loops. |
| 5 | Main verifies member process trees are gone. The engine reconciles any in-flight effects, then marks tasks **cancelled** or **needs_attention** if an outcome is uncertain. The team stays idle until the user sends a new message. |

### 4.7 Failure supervisor

| Failure | How it is detected | Engine response |
|---|---|---|
| **Crash** | Process exit with an error, or a dropped connection | Member status becomes failed and the user is alerted. The task enters reconciliation before takeover; an uncertain external effect pauses it for attention (Section 3.8). |
| **Hang** | No output and no tool activity for a configurable time | Same as a crash, after one automatic nudge |
| **Rate limit or credits exhausted** | Provider error codes, or CLI-specific output patterns | Same, with the reason shown to the user |
| **Authentication expired** | Provider error codes, or CLI-specific output patterns | Same, with a prompt to reconnect |
| **Lost network** | Request failures | Retry briefly, then same as a crash |

**Leader takeover.** The Leader receives a `member.failed` notice naming the member and the interrupted task. Once the engine has reconciled any in-flight effect, the Leader completes the work or reassigns it. An uncertain effect is surfaced for review first. The failed member's partial work stays recorded and its worktree stays intact.

**Leader failure.** The engine promotes the next member in the user's succession order, or the next capable member if none is set. The interim Leader receives a handover package: the briefing, the task list, the recent conversation, and the interrupted task. The user is alerted, and every member is told the new Leader. When the original Leader returns, the engine asks the user whether to hand leadership back. It never switches on its own.

### 4.8 Context management

| Member type | Behavior |
|---|---|
| **API member** | The core controls the context. Each member has a context mode: the full shared transcript (default) or only what concerns it. When its context reaches **70% of its window**, the older part is summarized and replaced by the summary. The original events stay in the log. |
| **CLI member** | The CLI manages its own context. The app passes in what each member needs at launch and shows context usage where the CLI reports it. How the 70% rule applies to each CLI is settled in the feasibility tests. |

### 4.9 Briefing

At session start, and again after a recovery or a Leader change, each member receives a briefing generated from the team setup:

- the team roster, with each member's name and role,
- the member's own role instructions, skills, and permissions,
- which tools to use for reporting and questions,
- file ownership and the worktree it should work in,
- the language the user wants replies in.

CLI members receive the briefing through the CLI's own instruction mechanism where it has one, otherwise as the first message in the terminal.

### 4.10 Direct terminal input

When the user types into a member's terminal, the text is delivered normally. The engine also records a `message.direct_terminal_input` event, shows "User → member" in the feed, and tells the Leader.

### 4.11 Review-round indicator

The optional "Review round N" counter is computed from the event log, by counting how many times a task returned for changes. It never affects the flow.

---

## 5. The Harness and Adapters

**In short:** every member plugs in through the same adapter interface. The adapter hides whether the member is a CLI, an API, or a login.

### 5.1 Adapter interface

```ts
interface MemberAdapter {
  detect(): Promise<DetectionResult>;     // installed? version? native Windows or WSL?
  start(ctx: LaunchContext): Promise<void>; // briefing, permissions, tools, working folder
  send(input: TaskInput | UserMessage): Promise<void>;
  onEvent(cb: (e: MemberEvent) => void): Unsubscribe; // output, status, usage, approval, error
  interrupt(): Promise<void>;             // soft stop
  stop(): Promise<void>;                  // hard stop
  capabilities(): AdapterCapabilities;    // which permissions and features this member supports
}
```

The team engine and the UI use only this interface.

### 5.2 CLI adapter

A CLI member uses **two channels**:

| Channel | Purpose | How |
|---|---|---|
| **Display** | The user sees and types in the CLI exactly as in the Windows terminal | The CLI runs in a real pseudo-terminal. Output streams to xterm.js with flow control. |
| **Control** | The engine delegates tasks and receives results reliably | The CLI is connected to the team tools server. Tasks are typed into the terminal with an instruction to finish through `report_result`. |

| Topic | Design |
|---|---|
| **Launch** | The adapter requests main to start the CLI and own its pseudo-terminal in the member's working folder. Environment variables set the default Git author to the member's name; the engine audits observed commits against the expected identity and session. CLI overrides remain possible. |
| **Environment** | Native Windows (PowerShell) or WSL, detected at link time. WSL members are launched through `wsl.exe`, with path translation. |
| **Completion** | By the member's explicit `report_result` call. If a CLI goes idle without reporting, the engine nudges it once, then marks the task as needing attention and tells the Leader. |
| **Permissions** | The adapter translates the user's per-member settings into the CLI's own launch options, using its capability data (Section 5.5). The app offers only what that CLI supports. A file watcher is the safety net. |
| **Approvals** | The CLI's own prompts appear in its terminal, and the user answers there. The adapter marks the member as "needs approval" when it detects a prompt, through the CLI's hook mechanism where it exists, or output patterns otherwise. The member bar and the feed show the badge. |
| **Resume** | If the CLI supports resuming its own session, the adapter uses it. Otherwise the member is relaunched and re-briefed from the log. |
| **Shutdown** | The adapter requests main to interrupt, then terminate after a timeout, including child processes, and verify that the owned tree is gone. |
| **Custom CLIs** | Added by a launch command and an optional capability file. They work with the display channel and the team tools. |

**Service-backed CLI lifecycle.** The adapter must track the owned backend
session separately from its terminal client. A client exit is a display
failure; it does not establish that backend work stopped. Stop and recovery
must reconcile that session through the CLI's control channel, verify its
execution state, and close the owned client tree. Shared vendor services
must not be terminated as member-owned processes. The
[OpenCode idle-client probe](../feasibility/s2-control/evidence/client-recovery-latest.json)
preserved the session/history and recalled context after a fresh terminal
attached; active-generation and external-effect recovery remain separate gates.

The subsequent [approval-wait disconnect probe](../feasibility/s2-control/evidence/active-disconnect-latest.json)
kept the same pending backend operation after the native client and its tree
were gone. A scoped session interrupt then ended that operation without command
execution. The failure supervisor must therefore distinguish client/display
failure from owned-session execution state. This evidence covers approval wait.

The [native ACP streaming probe](../feasibility/s2-control/evidence/acp-stream-cancel-latest.json)
observed two live text chunks from the same assistant in an owned private
backend, sent protocol cancellation and received `stopReason: cancelled`.
Text counters continued tracking late chunks and stayed stable during the
bounded follow-up interval; session and process cleanup were verified.
Persisted shared-session message snapshots did not expose text growth before
completion in two earlier attempts. Adapters therefore need an actual live
event channel to identify streaming; reasoning, terminal spinners and stored
complete text cannot establish that state. This ACP observation does not yet
verify terminal Ctrl+C or shared-session streaming cancellation. Executing
commands, provider billing cessation and external-effect reconciliation remain
separate gates.

**Control-channel failure state.** Request deadlines, transport loss, malformed
protocol and a remote RPC error are separate observations. A request deadline
or lost client connection leaves backend execution unknown. The supervisor
must reconcile the owned session/effect before retrying, following Section 3.8.
Local client shutdown does not establish backend cancellation. Pending control
requests must reject promptly on transport closure and release their timers;
late replies must not satisfy newer requests. The
[ACP fault probe](../feasibility/s2-control/evidence/acp-faults-latest.json)
exercises those contracts with owned scripted faults and observes one native
unsupported-method error followed by a healthy request. Injected fault behavior
is not a native provider-error or hang-detection capability.

**Executing-command cancellation.** The
[OpenCode 2.0.28 command probe](../feasibility/s2-control/evidence/command-cancel-latest.json)
verified growing heartbeats and process identities for an approved harmless
command and its child before interruption. The original tool then aborted;
captured command creations disappeared and heartbeat files stayed stable,
including after client/session cleanup. A control acknowledgment or tool error
alone therefore cannot establish command termination: the adapter must reconcile
execution separately. This bounded local result does not establish rollback of
external effects. Location-management requests should run outside the location
being evicted; an identity/version change during qualification invalidates the
whole-run lifecycle result even when individual cancellation phases succeeded.

### 5.3 API adapter

For API members, the core runs the agent loop itself.

| Part | Design |
|---|---|
| **Provider layer** | Ready-made formats for OpenAI-style, Anthropic-style, and Gemini-style APIs. A custom connection takes a base URL, an authentication method, and a model name. Local models such as Ollama and LM Studio use the same layer. |
| **Agent loop** | Send context, receive a response, run any tool calls, repeat until done. Streaming output goes to the member's pane. |
| **Built-in tools** | Read file, write file, edit file, list and search files, run command. Plus the member tools from Section 4.2. |
| **Permission gate** | Before every built-in file tool call, the core checks permissions and ownership. Command execution is separately approval-gated because a shell command can write outside the file guard; a hard filesystem limit would require an OS-enforced boundary. |
| **Tool-calling support** | A model without tool calling can join as an advisor or reviewer with no file or command tools. |
| **Context** | Token counting and the 70% summarization rule (Section 4.8). |
| **Usage** | Tokens and limits from provider responses, shown as information only. |

### 5.4 Login adapter

Login members follow the CLI or API adapter pattern, depending on how the provider allows access. The provider-specific details are settled during the feasibility tests (Section 11), because they depend on each provider's current rules.

### 5.5 Capability data

Each supported CLI is described by a **data file**, not by code scattered through the app:

| Field | Content |
|---|---|
| Detection | Command and version pattern, and where it usually lives |
| Environment | Native Windows, WSL, or both |
| Launch | How to pass the working folder, instructions, and permissions |
| Team tools | How to attach an MCP server |
| Resume | Whether and how sessions can be resumed |
| Approvals | Hooks or output patterns that signal a prompt |
| Errors | Patterns for rate limits, authentication, and network failures |

Because CLIs change often, these files can ship as **signed data updates** between full app releases.

**Feasibility evidence (13 October 2026).** The preliminary
[OpenCode permission assessment](../feasibility/s2-control/capabilities/opencode-permissions.json)
records native policy observations, provider compatibility and OS enforcement
separately for OpenCode 2.0.28 and the tested Muse free model on Windows.
It is marked `productionEligible: false` and is not a runtime adapter registry.
Individual edit/command controls do not establish every combined file/terminal
profile. File `none`, guaranteed read-only isolation and shell `off` remain
unvalidated or blocked for this model. Approval decisions were tested through
the own-session API and, in a fresh supplement, through the native terminal.
Programmatic Right/Enter events passed Reject and Allow once on the observed
2.0.28 palette and 120x38 terminal. Reject prevented the command; Allow once
completed it exactly once and left a distinct repeat pending, with one marker
append verified twice and after cleanup. The parent observer permits only
scoped GET requests and sends no permission replies; OpenCode's TUI handles its
own transport. A further five-phase supplement verified native Always allow,
reuse in a fresh same-project session, a separate Git project's pending request,
configured deny precedence and revocation restoring ask. Distinct project IDs
and empty saved-rule baselines were verified before saving; one owned rule was
created and removed. Only two harmless marker appends occurred in the original
project, and all owned sessions/clients/rules/locations/temp fixtures were cleaned
up. This qualifies session reuse and separate-root scope, not backend restart or
crash durability or general prefix safety. A further detached-worktree probe
observed the same native project ID as the root: its saved shell allow let a
fresh shell-ask worktree session execute without another approval. Explicit
worktree deny still blocked the command; revocation restored ask in both
locations. File scope, markers, all owned sessions/clients/rules, worktree registry
and temp cleanup passed. This establishes shared approval scope for the tested
route, with `strictMemberAskGuarantee: false`.

**Adapter requirement from this finding.** Before an OpenCode member starts in
strict ask-each-command mode, inspect its native project's saved shell allows.
Treat those grants as a permissions conflict and block the affected launch
until the conflict is resolved or the user selects an explicit project-wide
approval policy. Recheck when saved permissions change. Worktree separation
does not supply the required per-member approval boundary. A feasibility
prototype in `feasibility/s2-control/scripts/strict-ask-preflight.js` now blocks
launch callbacks on saved shell grants, unverifiable state or snapshot drift.
It verifies native project/service identity and two fresh saved-rule snapshots
before a clear launch. Only canonical shell/read/edit/glob/grep saved actions
are reviewed; unsupported actions fail closed. It does not clear grants or
select a project-wide policy automatically. The launch callback must configure
shell ask and surface native outcomes. Callback failures propagate without
retry because execution may already have started.

The final permission read is not atomic with launch. The feasibility prototype
in `feasibility/s2-control/scripts/strict-ask-monitor.js` now rechecks native
permission state serially, pinning the launch's service PID/version, native
project ID/directory and active cwd. The adapter must await its initial check
before accepting input. It uses a default two-second delay after each check,
plus API latency. Unsafe state latches one trusted suspension callback; that
callback must close future input and verify ownership before interrupting its
own session. A failed stop remains unverified, and revocation never resumes the
member automatically. Closing the monitor disposes polling and awaits current
work; session cleanup remains the adapter's responsibility.

The native monitor probe qualified grant detection and one owned idle-session
callback/interrupt. The feasibility adapter input gate in
`feasibility/s2-control/scripts/strict-ask-input.js` now serializes trusted
submissions, checks permissions and rechecks its latch before send. Suspension
closes input synchronously before the owned stop callback. Queued/new input is
blocked, admitted input may finish, and unknown delivery never auto-retries.
Close closes input and awaits queued work/monitor disposal; it is not a verified
session stop. An additional native probe verifies root/child command suspension
after a locally injected permission-read failure and rejection of a later
adapter prompt. A further 14 October cohort replaces the injected trigger with
a real native saved shell grant created through an owned idle session's
controlled API permission request/Always reply, after original root/child
execution is proven. The monitor closes input and verifies interruption of the
original active session; owned revocation leaves it suspended and blocked.
The saved row, idle/original sessions, client process tree, location and temp
fixture are cleaned with ownership checks. This is a parent-proposed native
API grant, not a tool-proposed pattern or terminal Always decision during
execution. It does not qualify command prevention or direct native-terminal
human input.

Polling has a detection window. Atomic enforcement and production UI/core
integration remain unbuilt,
so these prototypes do not establish strict member ask or production
eligibility. The current native
capability assessment still records the full-runtime requirement and its
evidence. See the bounded verification in
[the S2 results](../feasibility/s2-control/RESULTS.md#saved-grant-suspension-during-active-work-14-october-2026).
Other layouts/themes,
foreground human interaction and accessibility remain separate gates. Native terminal records
are sealed as a separate content-hash supplement; previous assessments remain
preserved. This evidence does not establish OS containment.
Five permission cases and native ACP initialization/error recovery/streaming
cancellation passed again on 2.0.28. The assessment references hash-verified,
versioned source records; prior 2.0.22 bytes and their original paths are
preserved in a separate archive manifest. Qualification rejects mixed or
unreviewed versions, failed cohorts and final service-version drift. Shell
`off` returned provider HTTP 403 before tools in a fresh 2.0.28 supplemental
probe; the combined read/edit/glob/grep deny profile did the same. Shell `off`
is recorded as blocked for this model, with native enforcement unproven.
Targeted read, glob and grep calls each produced an actual native permission
denial, leaving file `none` at partial native controls. All five diagnostic
measurements verified no canary leakage in messages, unchanged files, owned
cleanup and stable shared service/configs; only the three targeted cases qualify
as permission passes. Supplemental records are sealed separately by byte hash;
the initial 2.0.28 archive and prior assessment remain preserved. The older shell
provider rejection is tagged as 2.0.22 history. Capability evidence is matched to
the observed version, not inherited
automatically across updates. Archive integrity is enforced by the feasibility
helper; signed runtime data updates remain a product implementation task.

### 5.6 Per-CLI feasibility checklist

Before writing each adapter, a short test confirms:

1. The CLI runs correctly in a pseudo-terminal on Windows, with colors and interactive prompts.
2. A task can be delivered by typing it in, and the CLI reliably uses the team tools to report back.
3. An MCP server can be attached at launch.
4. Permission options can be set at launch, and which ones exist.
5. Approval prompts can be detected.
6. The CLI can resume a session, and how.
7. Rate-limit, authentication, and network errors can be recognized.
8. It behaves the same through WSL, where applicable.

---

## 6. File Safety, Git, and Checkpoints

**In short:** every editing member works in its own Git worktree. Isolation prevents conflicts, ownership rules keep the work organized, and checkpoints make everything reversible.

### 6.1 Isolation by default

For API members the app checks ownership before writes made through its file tools. A command can also write files, so command execution needs separate approval or an OS-enforced boundary. A CLI member edits files by itself, so the app can only notice watched changes afterward. Separate worktrees prevent ordinary edits in each member's assigned working folder from overwriting one another; they do not confine a process that can access other paths.

| Who | Working folder |
|---|---|
| **Editing members** (coder and others with edit permission) | Their own **worktree** on their own branch |
| **Leader** | The **integration worktree**, where merged work lands |
| **Read-only members** (for example a reviewer) | A worktree they are pointed at. Read-only is enforced where the member type allows it (Section 6.7) |
| **The user's own folder** | The engine does not write to it until the user approves a final merge (Section 6.4); a CLI running as the user can still access it |

Branches follow a clear pattern: `tiye/<session>/integration` and `tiye/<session>/<member>`. Worktrees live in the app data folder, so the user's project folder stays clean. This makes worktrees the **default** for editing members (a change from the optional setting in Spec 7.2).

**What isolation does and does not guarantee.** Each member has a separate default working folder and branch. This prevents ordinary edits in those folders from colliding. It does not stop a process from writing somewhere else: a CLI runs as the user, so it can write to the user's project folder or another member's worktree. The watcher reports changes only in paths it monitors. The full guarantee per member type is in the enforcement matrix (Section 6.11).

### 6.2 Worktree lifecycle

**S3 consolidation.** The [qualification summary](../feasibility/s3-worktrees/ASSESSMENT.md)
now verifies twelve sealed cohorts and their source commits. All S3.1-S3.7
sections remain partial; provider-native matrices, real project setup,
approval UI, durable orchestration and broader Windows qualification remain
open. The original basics/checkpoint cohorts are historical source observations;
later recorded source versions are listed explicitly. This is not a full
implementation gate. Independent S4 documentation research has an
[entry plan](../feasibility/s4-provider-access/ENTRY-PLAN.md), with provider
classifications still unreviewed. The [first S4 research results](../feasibility/s4-provider-access/RESULTS.md)
record official documentation, installed CLI version/help observations and two
blocked credential-reuse routes. Policy applicability and native authentication
qualification remain open; no candidate is integration eligible.
The [account/product conditions supplement](../feasibility/s4-provider-access/conditions/README.md)
records route-specific public terms and a prerequisite-based native test plan.
Published conditions do not establish an accepted account agreement or native
capability; its test plan starts with a local boundary fixture.
The [offline S4 boundary fixture](../feasibility/s4-provider-access/boundary/README.md)
now exercises prerequisite refusal, sanitized fake responses and owned cleanup
with a fixed local Node child. It qualifies that bounded offline behavior only;
account applicability and native provider integration remain open.
The [S4 declaration readiness check](../feasibility/s4-provider-access/readiness/README.md)
now accepts bounded non-secret metadata through stdin and emits pending/refusal
categories without retaining submitted account/model values. It performs no
provider dispatch; the first native route still needs an operator declaration
and policy applicability review.
The operator then identified an Antigravity consumer-login route. Its public
model slug is resolved, but [the route decision](../feasibility/s4-provider-access/antigravity-consumer/README.md)
blocks consumer third-party CLI wrapping and delegation under the provider's
explicit FAQ/terms. Historical Agy review success does not qualify this route.
Independent [S5 ingress baseline work](../feasibility/s5-performance/README.md)
now verifies five concurrent synthetic Node producers, backpressure and persisted
byte integrity. PTY/display/UI, sustained flood and long-run performance are not
measured; S5 remains partial.
The [five-terminal S5 shell](../feasibility/s5-performance/ui/README.md) now has
bounded native grid/focus integrity observations. An intermittent shared-process
ConPTY crash led to one PTY per isolated worker; two current-source smokes passed.
Hidden-window parsing/receipt is not visible UI performance qualification, and
the failed observations and abnormal recovery limitations remain explicit.
The additive [S5 flood harness](../feasibility/s5-performance/ui/flood/README.md)
now records 60-second grid/focus cohorts with five isolated PTYs. The corrected
cohort preserves all captured output hashes and completes 28 synthetic input
probes per view below 100 ms, with RAF gaps below 500 ms. Initial window/frame
measurement defects remain preserved. These are synthetic callback timing
proxies; physical input/display latency, long-run CPU/memory, feed/search and
abnormal recovery remain unqualified. S5 remains partial.
The [S5 resource pilot](../feasibility/s5-performance/ui/resources/README.md)
adds role-scoped CPU, working-set and private-memory samples during a one-minute
flood followed by a one-minute idle observation in each view. It preserves an
initial lifecycle phase-tagging defect and distinguishes the corrected
transition interval from active/idle coverage. The core process is absent;
these short observations do not qualify memory settling or the about-hour
mixed workload with feed/search load. S5 remains partial.
The additive [S5 feed/search component](../feasibility/s5-performance/ui/mixed/README.md)
now persists/reopens 50,000 synthetic SQLite WAL/FTS5 events and checks native
first/last/search viewport pages with bounded DOM rows. SQLite runs in a
separate Node worker with correlated bounded frames. This is a bulk-load
component observation: combined PTYs, continuous mixed ingestion and the
actual hour-long workload remain open. It does not implement the product
event engine or qualify full S5.
The [combined S5 hour workload](../feasibility/s5-performance/ui/hour/README.md)
has now run five isolated PTYs for an actual hour while incrementally storing
50,000 SQLite events, alternating grid/focus and checking 716 search pages.
All output/storage/renderer-chain and feed reopen checks passed. Both views'
RAF gaps stayed below 500 ms and all search completions below two seconds.
Full-hour input coverage is unqualified: 88 of 119 planned probes were skipped
without focus. The 31 delivered probes completed below 38 ms. Resource samples
cover all required roles, but memory settling, resize/scroll interaction,
abnormal recovery and the product core remain unqualified; S5 remains partial.
The [bounded S5 settling cohort](../feasibility/s5-performance/ui/settling/README.md)
now applies a predeclared final two-minute idle window after three minutes of
combined load and five minutes idle. Main, renderer and feed worker passed the
provisional private-memory slope/range gate with complete sample coverage.
This is not leak-free or foreground-only proof. The accompanying input attempt
is unqualified (33 of 35 probes skipped and visibility lost); raw RAF gaps
reached about one second. The hour evidence is unchanged. Foreground input,
abnormal recovery and full S5 remain open.
The additive [S5 foreground cohort](../feasibility/s5-performance/ui/foreground/README.md)
now records window/document focus and main visibility throughout a two-minute
combined run with continuous terminal output in both views. All 58 planned
synthetic inputs completed without skips; maximum dispatch-through-render ACK
was 26.91 ms in grid and 26.05 ms in focus. Output chains, 50,000-event feed,
search pages and the corrected post-measurement focus control passed. The
initial failed control and its source/build snapshots are preserved. This
qualifies the bounded foreground-input proxy only; earlier full-hour coverage,
abnormal recovery and full S5 remain open.
The [isolated S5 recovery cohort](../feasibility/s5-performance/ui/recovery/README.md)
now kills an owned SQLite writer with 1,000 uncommitted events after 10,000
committed events, verifies the exact committed prefix in a separate process,
and resumes to 50,000 with FTS/digest/reopen checks. Killing one isolated PTY
worker left four complete survivor streams; a fresh replacement also completed.
The victim's captured prefix is retained without a recovered-tail claim.
All 14 owned roles exited before normal cleanup. Two failed harness attempts
are preserved. This qualifies these bounded process-fault cases; renderer and
whole-host recovery, product-core recovery and full S5 remain open.
The [S5 renderer-recovery cohort](../feasibility/s5-performance/ui/renderer-recovery/README.md)
now force-crashes only the renderer while all 12 persistent main/feed/PTY
worker/producer identities survive. Each PTY emits new output after confirmed
renderer death; a fresh renderer replays the bounded main-owned journal and
reconstructs all 600 records per terminal plus feed pages. Decoded file hashes,
receipt chains, epoch ACKs, actual terminal-buffer content and 50,000-event
SQLite/FTS/reopen checks passed. A deliberate stale-epoch ACK cannot advance
the new ledger. This qualifies one renderer reconstruction with main alive;
physical paint, whole-host recovery, product-core recovery and full S5 remain open.
The [S5 interaction experiment](../feasibility/s5-performance/ui/interaction/README.md)
found a blocker: active-output 100→60-column resizing failed exact wrapped-text
buffer comparison in all five terminals, with two expected record IDs absent
per reconstructed snapshot and additional text mismatches. Those IDs' prefixes
remain in decoded PTY captures. Child TTY dimensions converged, so resize
coordination/reflow must be isolated before qualification; the root cause is
not established. Both failed attempts and source/build snapshots are preserved.
Five artifact/regression checks pass while resize/scroll qualification remains
false. Later geometry/scroll phases, full S5 and production remain open.
A separate [Windows PTY option comparison](../feasibility/s5-performance/ui/interaction-windows/README.md)
also failed with the original fixture bytes after supplying supported ConPTY
backend/build metadata. The option alone does not qualify resize. A separate
locale-decoded source-copy attempt is preserved and excluded from comparison.
The next investigation must isolate resize coordination and terminal redraw;
no root-cause or fix claim is made from these observations.

**Feasibility baseline, 14 October 2026.** The S3 prototype in
`feasibility/s3-worktrees` created integration plus two member worktrees outside
a disposable source root, ran an offline local-dependency setup, copied
synthetic untracked settings and merged concurrent different-file edits.
Conflicting same-line edits were listed automatically; merge abort restored
the integration state. Original source files/branch/HEAD/index and all owned
cleanup checks passed. The lifecycle prototype rejects dirty/ignored artifacts,
changed ownership and active Git operations before removal. Its registry is in
memory; durable recovery and locking remain unbuilt. Shared dependencies, real
project setup, the Windows matrix and the other S3 gates remain unqualified.
See [the baseline results](../feasibility/s3-worktrees/RESULTS.md).

**Bounded Windows checks, 14 October 2026.** A disposable worktree exercised
a 303-character ASCII path with repository-local `core.longpaths=true`, native
Git add/commit and raw checkpoint loading. The tested temporary volume resolved
case aliases to the same file; a separate tree-path preflight rejected a
synthetic `Foo.txt`/`foo.txt` collision without checking that tree out. Member
selection remains lowercase-only. CRLF working bytes normalized to LF in Git's
staged blob, while the raw checkpoint restored exact CRLF and preserved the
real index. An explicit Windows removal wrapper refused an exclusive
`FileShare.None` handle before native removal, preserved worktree state and
removed it after the owned child released the file. The original lifecycle
method is unchanged; callers must use the removal wrapper. A subsequent Windows
creation wrapper now resolves the selected ref to a commit, inspects its tree
and runs path/case preflight before calling lifecycle creation. It rejects
unsafe trees before directory, branch or registration writes; the original
creation method remains available and unchanged. Other volumes/sharing modes, antivirus
contribution and atomic removal remain unqualified. See the
[Windows observations](../feasibility/s3-worktrees/RESULTS.md#s37-windows-edge-cases--14-october-2026).

**Dependency comparison, 14 October 2026.** Four disposable Windows worktrees
compared independent `node_modules` with a shared npm cache against a direct
modules junction. A member's local dependency addition left the other member's
manifest, lock and dependency files unchanged with independent installs. npm
11.19.0 replaced the junction with a private install; its donor stayed unchanged.
Separate modules with a shared cache are the candidate setup policy. The tiny
offline fixture establishes no general speedup, shared-module isolation or
production readiness. Real project setup and the remaining S3 gates stay open.

| Stage | What happens |
|---|---|
| **Create** | When an editing member gets its first task, the engine creates its worktree from the current integration branch. |
| **Prepare** | A per-project **setup command** (for example installing dependencies) runs in the new worktree. The user can also list untracked files to copy, such as local environment files, with confirmation. |
| **Work** | The member edits freely inside its worktree. |
| **Clean up** | After a successful merge, or when the session is deleted, the worktree is removed. A disk-usage view shows what worktrees occupy. |

The cost is disk space and setup time, because each worktree needs its own dependencies. The setup command and the disk view keep this visible and under the user's control.

### 6.3 Ownership

The Leader assigns files and areas with `assign_files`. Ownership keeps members from working on the same code, which keeps later merges clean.

| Member type | Enforcement |
|---|---|
| **API member** | Hard block for built-in file tools. The file guard refuses a write outside the member's ownership and tells the member and the Leader. Shell commands can write files too, so they require separate approval or an OS-enforced boundary. |
| **CLI member** | A file watcher in the member's worktree detects changes outside its ownership **after the fact**. The change is flagged to the user and the Leader, and the user can revert it from the checkpoint. |

The two rows are different guarantees, not two implementations of one: the API row is prevention, the CLI row is detection. See the enforcement matrix (Section 6.11).

**Ownership feasibility, 14 October 2026.** A bounded polling prototype detected
unauthorized file modifications, deletion and creation in one disposable
worktree. Fixture-approved per-file recovery preserved assigned edits and
initial untracked checkpoint bytes, and refused stale target/index/HEAD and
link substitutions. The checkpoint is in memory; polling does not prevent
writes or stop the CLI. Recovery requires controlled writers and provides no
atomic or OS boundary. Durable checkpoints, the user approval UI and production
watcher routing remain unbuilt. See [the measured results](../feasibility/s3-worktrees/RESULTS.md).

### 6.4 Merging

| Step | Action |
|---|---|
| 1 | The Leader calls `request_merge` for a member's branch. |
| 2 | The engine merges it into the integration branch. |
| 3 | If there are conflicts, they return to the Leader as a task with the conflicting files. The Leader resolves them itself or delegates. |
| 4 | When the mission is complete, the engine proposes merging the integration branch into the user's branch. The user sees the full diff and **approves**. |

The final merge touches the user's folder only when the user's working tree is clean. Otherwise the app offers to leave the result on its branch.

**Bounded S3.6 baseline.** A fixture-approved final merge now transfers an
audited integration result into a disposable clean source branch using
`merge --ff-only` and the reviewed commit ID. A privately bound plan pins both
HEADs, source branch/common Git identity, real index fingerprints and file
state. Approval is consumed on every attempt. Dirty tracked/staged/untracked/
ignored state, active Git operations, special index flags, stale HEADs and
divergence are refused; the integration branch stays available. A safety Git
checkpoint is persisted before the final state recheck and native merge.
Native status reads disable optional index writes, and the fixture uses a
pinned empty hooks directory. Resulting HEAD/files and member/integration
commit metadata were verified. The approval UI, Leader review, integration test
gate, atomic locking and interrupted/crash recovery remain unbuilt. This
prototype supports fast-forward histories only. See the
[S3 final merge results](../feasibility/s3-worktrees/RESULTS.md#s36-final-merge--14-october-2026).

### 6.5 Attribution

| Item | Rule |
|---|---|
| **Author** | The member's name, with an identifying address such as `<member-id>@tiye.local`. Environment variables supply defaults; observed metadata must be audited because a CLI can override them. |
| **Trailer** | Each introduced member commit is expected to carry one matching session identifier. Engine-controlled integration audits the whole range and refuses missing, duplicate or mismatched trailers; it does not silently rewrite member history. |
| **Commit timing** | CLI members may commit themselves. If a task ends with uncommitted work, the engine commits it with the member as author. |

History then reads as "Claude planned, OpenCode wrote, GPT reviewed".

**Native Git baseline, 14 October 2026.** A Node child and an engine fixture
produced member-authored commits with distinct committer metadata and explicit
session trailers. Non-fast-forward integration merges preserved their commit
IDs, metadata and message hashes. The audit rejected missing/duplicate session
trailers and an overridden author. Environment variables do not insert session
trailers automatically and do not enforce identity. Native provider CLI launch
propagation, automatic trailer insertion and durable session/task bindings
remain unqualified; this is a feasibility baseline, not the core engine.
See [the attribution results](../feasibility/s3-worktrees/RESULTS.md).

**Native CLI propagation, 14 October 2026.** A standalone OpenCode 2.0.28
launch on the requested Muse xhigh route passed the expected author/committer
environment into a fixed shell task and native Git. The parent audited the
correlated tool result, worker integrity and exact edit before creating a
member-authored fallback commit with a session trailer. This qualifies the
bounded private-server launch path only. Shared-service propagation,
provider-created commits, automatic CLI trailers and durable attribution stay
open; the production adapter and core engine are not implemented.

**Session-trailer policy, 14 October 2026.** A bounded feasibility gate audits
the full introduced member range, binds its decision privately and checks both
HEADs, ownership, dirty state and active Git operations before an exact-SHA
integration merge. Invalid earlier commits behind a valid tip are refused;
rejected member history remains intact. Empty, oversized, non-linear,
wrong-session and already-integrated selections fail closed. Started merge
operations consume their in-memory decisions. This is not a durable or atomic
production gate and does not prevent direct CLI Git operations. Provider-created
commit qualification, automatic trailers, recovery and final merge approval
remain open; see [the policy results](../feasibility/s3-worktrees/RESULTS.md).

### 6.6 Git safety

Push, force-push, and merge into protected branches need the user's approval (Spec 7.2). What that approval is worth depends on which process runs git.

| Member type | Enforcement |
|---|---|
| **API member** | Hard gate. The push tool does not exist in the member's toolset without approval. Every push request goes to the approval broker. |
| **CLI member** | Best-effort. The member's worktree has its own Git hooks, set per worktree, that refuse a push unless the engine has granted it. The CLI's own permission settings add a second layer. |

**What the engine can and cannot enforce.** For its own Git operations — API member pushes, merges between session branches, and the final merge into the user's branch — approval is a hard gate, because the engine is the process running git and no push happens without it. A CLI member is a different case: it runs as the user, with the user's own Git credentials, and the engine has no credential or operating-system boundary to stand behind. The per-worktree hooks refuse a push launched from that worktree and log the attempt, but they are bypassable — a skip-hooks flag, a push run from outside the worktree, or the CLI's own Git configuration — and a bypassed push changes the remote only, so it leaves no local ref change the engine could detect. So the engine logs every push it can see, and CLI push control is presented as a layer that refuses the easy path and keeps the user's eyes on the terminal — never as a guarantee. A hard CLI guarantee would need an enforceable credential or OS boundary, which TIYE Agent does not have.

**Push-policy feasibility, 14 October 2026.** Two disposable Windows worktrees
and a local bare remote verified default hook refusal and exact fixture-approved
pushes. A separate in-memory engine prototype rejected forged/replayed approval,
changed source/remote tips and unapproved non-fast-forward updates. Native Git
bypassed the member hook through `--no-verify`, a hooks-path override and another
worktree, changing remote refs without local ref changes in this setup. The hook
is advisory. These are parent-generated local operations with simulated approval;
the production broker, user UI, authenticated remotes and provider CLI pushes
remain unqualified. See [the push results](../feasibility/s3-worktrees/RESULTS.md).

### 6.7 Reviews

A review task names the revision to read. An API reviewer reads that revision through read-only file tools. A CLI reviewer starts in a separate, disposable worktree at that revision, so ordinary edits in its assigned folder do not alter the author's worktree.

| Member type | Read-only enforcement |
|---|---|
| **API member** | Hard within TIYE's toolset. The review toolset contains no write or command tools. |
| **CLI member** | Read-only is requested through the CLI's own launch option. Where the CLI has no such option, read-only is **unsupported**. The reviewer gets a separate, disposable worktree at the revision under review; the watcher flags edits inside that worktree, which is reset or discarded when the review ends. A CLI can still write outside it. |

The separate worktree protects the author's work from ordinary edits in the reviewer's assigned folder. It is not an OS security boundary for a CLI.

### 6.8 Checkpoints and restore

Checkpoints use a separate **Git reference namespace**. Capturing a checkpoint
must preserve the user's branch tips, working files and real index. The namespace
adds Git objects and refs; it is not secret and does not exclude checkpoints
from mirror pushes.

| Item | Design |
|---|---|
| **When** | After each completed task, before every merge, before every restore, and on demand. |
| **How** | The state of each active worktree is written as a snapshot using a temporary index, and stored under `refs/tiye/<session>/<n>`. The event sequence number is recorded with it. |
| **Restore** | The engine first saves a safety checkpoint, pauses the affected members, restores the files, and writes a `checkpoint.restored` event. The conversation history stays. |
| **Leader notice** | The Leader receives a rollback notice with the restore point, so it does not work from an outdated picture of the code. |

**Bounded S3.5 baseline.** The Windows feasibility prototype now stores a
reachable `manifest.json` and raw `files/` tree in a SHA-1 Git commit, using
isolated temporary indexes and create-only refs. It copies the real index to
compute the staged-tree fingerprint. A fresh Node process verifies the expected
commit, session, sequence, member/common-Git fingerprints, branch, parent and
file hashes before fixture-approved recovery. A safety checkpoint is saved
before restoring one file; unrelated edits, HEAD, branch and real index bytes
remain unchanged. Ref reuse, wrong identity/commit, stale targets, changed
HEAD/index, active Git operations, unsafe paths and links are refused.

This baseline handles bounded ordinary-file contents, including non-ignored
untracked files. Deleted paths are omitted and file modes are normalized; it
does not restore the staged index or provide a complete worktree rollback.
The approval is simulated by a trusted fixture, and writers are controlled.
Member suspension, actual approval UI, event-store/ref transactions, global
session reconstruction and crash/power-loss recovery remain unbuilt. Filesystem
rechecks are not atomic. See the
[S3 checkpoint results](../feasibility/s3-worktrees/RESULTS.md#s35-durable-checkpoint-storage-and-fresh-process-recovery--14-october-2026).

### 6.9 Projects without Git

The app uses a **shadow repository**: a separate Git directory in the app data folder whose work tree is the project folder. It gives the same snapshots without changing the project. It also offers to initialize real Git, which is recommended, because isolation by worktrees needs it. Without Git, the session runs in shared-folder mode.

**Bounded feasibility baseline.** An owned external Git directory now supports
raw checkpoints and fixture-approved single-file recovery for a disposable
non-Git folder. Initialization leaves its project files unchanged and creates
no `.git` file or directory there. Explicit Git directory/work-tree routing
keeps metadata, the empty baseline and real index outside the project. The
probe verifies `.gitignore` exclusions, ignored dependency bytes, unrelated
edits, safety checkpoints and HEAD/index preservation. Reopening uses a private
parent handle; app-data lifecycle integration and restart reconstruction are
still unbuilt. Tiny single-run timing observations are recorded in the
[S3 shadow checkpoint results](../feasibility/s3-worktrees/RESULTS.md#s35-shadow-checkpoints-and-timing--14-october-2026).

### 6.10 Shared-folder mode (optional)

A setting lets all members work in the same folder.

| Aspect | Behavior |
|---|---|
| **Ownership** | API members are blocked before writing. CLI members are watched and flagged. |
| **Conflicts** | Out-of-ownership edits can be reverted from the latest checkpoint. |
| **Guarantees** | Weaker than worktrees, so it is a deliberate choice for the user. |

### 6.11 Enforcement matrix

This is the authority for what each permission guarantee is worth, by member type. The permissions UI labels (Spec 4.3) quote it, and the feasibility tests verify it (Test Plan S2.4, S3.3, S3.4).

| Guarantee | API member | CLI member |
|---|---|---|
| Edit a file outside its ownership, inside its worktree | **Blocked before action through built-in file tools.** Commands need separate approval or an OS boundary. | **Detected afterward if watched.** The watcher flags it; the user can review a proposed revert. |
| Write outside its own worktree (the user's folder, another member's worktree) | **Blocked through built-in file tools.** A permitted shell command may still write there without an OS boundary. | **Not preventable, and not always visible.** The CLI runs as the user; watchers cover only the paths they watch. |
| Read-only file access | **Blocked before action.** No write tool is issued. | **Best-effort, or unsupported.** Set at launch where the CLI supports it; otherwise detected, never prevented (Section 6.7). |
| Running terminal commands | **Approval-gated before the tool call.** Approval does not confine effects inside the command. | **CLI-dependent.** The app requests prompting through supported CLI settings and shows its prompt; this is not an app-enforced gate. |
| Push, force-push, or merge into protected branches | **Approval-gated.** No push tool exists without approval. | **Best-effort.** Per-worktree hooks and CLI settings refuse the easy path and log it; bypassable, and a bypass may leave no trace (Section 6.6). |
| The app's final merge into the user's branch | **Approval-gated.** The engine runs it after the user approves the diff. | **Approval-gated for the engine operation.** A CLI with the user's Git access may run Git independently. |

Two rules follow from the table. The product never describes a CLI row as a hard guarantee, and the permissions UI shows each setting as **blocked**, **approval**, **detected**, or **unsupported**, so the label is the guarantee. An API member without tool calling has no file or command tools at all, and joins as an advisor or reviewer (Spec 5.3).

---

## 7. Plugins and Extension Security

**In short:** most extensions are declarative and carry no code. Plugins with code run isolated, with only the permissions the user approved.

### 7.1 Two kinds of extension

| Kind | Contents | Risk |
|---|---|---|
| **Declarative** | Roles, skills, MCP server entries, presets, themes, translations | Low. They carry no executable code. |
| **Code plugins** | New providers, tools, panels | Higher. They run in the plugin host. |

Plugins can bundle both kinds.

### 7.2 Manifest

Every plugin has a manifest that the app validates:

| Field | Content |
|---|---|
| Identity | id, name, version, author, source |
| Contributions | Roles, skills, MCP entries, providers, panels, themes, translations |
| Permissions | Files, terminal, network hosts, provider access |
| Compatibility | Minimum app version |
| Integrity | File hashes |

### 7.3 Runtime isolation

| Layer | Control |
|---|---|
| **Process** | Plugin code runs only in the **plugin host**, a separate process. It has no access to the Electron or Node internals of the app. |
| **API** | The host exposes a small capability API over RPC. Every call is checked against the manifest permissions the user approved. |
| **Operating system** | The host is started with reduced privileges, using the platform's process restrictions where available. |
| **Resources** | CPU time and memory limits, with a timeout for hung plugins. |
| **Network** | Requests go through the core, limited to the hosts declared in the manifest. |
| **Secrets** | Plugins never receive API keys. For provider plugins, the plugin describes how to map requests and responses, and the **core makes the call** with the user's key. |
| **UI panels** | Rendered in sandboxed frames with a strict content security policy, communicating only by messages. |

### 7.4 Install flow

| Step | Action |
|---|---|
| 1 | The user supplies a **link**, a **local file or folder**, or creates the item manually. |
| 2 | The app downloads or reads it and checks its integrity. |
| 3 | The app shows the **origin, contents, and requested permissions**. |
| 4 | The user confirms. Nothing runs before this step. |
| 5 | The plugin is installed and enabled. |

An update that asks for new permissions needs a new confirmation. Updates are never silent. Roles, skills, and presets can also be exported and imported as a single file.

### 7.5 MCP servers

- MCP servers added by the user run as child processes with the user's privileges, so the app shows the exact command before the first run.
- They are assigned per member, or to all members. For CLI members, the setup is passed through the CLI's own mechanism.
- Team tools (Section 4.2) are a separate, built-in server and are always available to the right members.

### 7.6 Skills and roles

Skills and roles are stored as portable text files with a small header for name, description, and assignment. This makes them easy to edit, share, version, and assign to all members.

### 7.7 Threats and defenses

| Threat | Defense |
|---|---|
| Malicious plugin | Isolation, permission approval, integrity checks, declarative-first design |
| Prompt injection through project files or web content | Per-member permissions, approval for commands, file ownership, and no member can exceed its granted tools |
| Key theft | Keys are held only by main and core, and stored in operating-system secure storage |
| A member acting beyond its role | Role-based tool access in the team tools server, plus permissions in the adapter |

---

## 8. Licensing and Updates

**In short:** a signed license verified on the device, a minimal server check at the first task of a session, and signed updates that the user approves.

### 8.1 Components

| Component | Role |
|---|---|
| **Payment provider** | Handles purchases, renewals, and invoices. TIYE Agent has no account system. |
| **License server** | A small service with a database. It issues licenses and counts sessions. |
| **License client** | Lives in the main process. Stores the token, performs the check, and applies the plan. |

### 8.2 Entitlement token

The server signs a token with a private key, and the app embeds the matching public key.

| Claim | Meaning |
|---|---|
| `license_id` | The license key identifier (or the anonymous install ID for Free) |
| `plan` | Free, Weekly, Monthly, or Annual |
| `limits` | The session limits and their windows |
| `expires` | When the subscription ends |

The token is stored in the operating system's secure storage.

### 8.3 Activation

| Plan | Flow |
|---|---|
| **Free** | The app generates a random **install ID** at first run. No account and no personal data. |
| **Paid** | The user buys through the payment provider, receives a **license key**, and enters it in the app. The app exchanges it for a signed token. |

### 8.4 Session start check

When the first task of a new session is sent:

```
App                                     License server
 │  session-start                              │
 │  {license or install ID,                    │
 │   session ID, app version}                  │
 │────────────────────────────────────────────►│
 │                                             │  count in the current window
 │  signed answer                              │
 │  {allowed, used, limit, window end}         │
 │◄────────────────────────────────────────────│
```

| Rule | Detail |
|---|---|
| **Idempotent** | The session ID is generated on the device. Repeating a request, resuming a session, or recovering from a crash never counts twice. |
| **Data sent** | Only the license or install ID, the session ID, and the app version. |
| **Data never sent** | Project data, conversations, files, prompts, or usage details. |
| **If refused** | The app explains the limit and when the window renews. |

### 8.5 Counting windows

| Plan | Limit | Window |
|---|---|---|
| Free | 1 session | Per day |
| Weekly | 5 sessions | Per week |
| Monthly | 6 sessions | Per week |
| Annual | 12 sessions | Per month |

Paid windows are anchored to the purchase date, and Free uses a calendar day.

### 8.6 Offline allowance

| Situation | Behavior |
|---|---|
| **No connection at the first task** | The app allows a small number of offline sessions (the default is 3), records each as a `system.offline_session` event, and syncs the counts when the connection returns. |
| **Sync** | The server applies the counts idempotently. It reduces the remaining quota but never blocks anything retroactively. |
| **Cached token** | Stays valid until its expiry. After that, the app uses Free limits until it can renew. |

Local models keep working offline, because the check concerns only the session count.

### 8.7 When a subscription lapses

The app keeps working under the Free limits, and all of the user's data stays untouched. Nothing is locked or deleted.

### 8.8 Tamper resistance

| Measure | Purpose |
|---|---|
| Signed tokens | Cannot be forged without the private key |
| Secure storage | Harder to copy or edit |
| Last-seen server time | Detects a clock set backward |
| Install ID binding | Ties a token to an installation |

The goal is fairness, not perfection. There is no obfuscation race. A determined user could still bypass the check.

### 8.9 Updates

| Topic | Design |
|---|---|
| **Mechanism** | electron-updater with signed Windows installers and a release manifest served over HTTPS. |
| **Checks** | At startup and about once a day. |
| **Who is notified** | Every plan, including Free. |
| **Approval** | The user sees the release notes and chooses to download and install. Nothing installs silently. |
| **Install** | When the user restarts the app. |
| **Capability data** | Updates to CLI capability files (Section 5.5) travel with the same signed manifest and are shown in the same notice. |

### 8.10 Server surface

| Endpoint | Purpose |
|---|---|
| `POST /v1/activate` | Exchange a license key for a signed token |
| `POST /v1/session-start` | The limit check and count |
| `GET /v1/entitlement` | Refresh the token near expiry |
| `GET /v1/updates/latest` | The release manifest (can be a static file) |
| `POST /v1/webhooks/payments` | Receive purchase and renewal events from the payment provider |

This is the complete list of contact with TIYE servers (Spec 14.3).

---

## 9. User Interface Architecture

**In short:** the UI is a live view of the event log, built for fast streaming from up to five members.

| Topic | Design |
|---|---|
| **State** | The UI keeps a local store fed by an event stream from the core. Each event has a sequence number. After a reload or reconnect, the UI asks for events after its last sequence number and catches up. |
| **Feed** | A virtualized list, so long sessions stay fast. Events render as messages or as expandable cards (file edits, commands, test results, approvals, questions). |
| **Batching** | Incoming events are grouped and applied at screen refresh rate, so heavy output never freezes the interface. |
| **Terminals** | One xterm.js instance per visible member. Hidden members keep their output in the core, and the terminal is rebuilt when shown. Flow control slows a noisy process instead of dropping output. |
| **Views** | Focus view (one terminal) and grid view (all members), as in the specification. |
| **Tabs** | One tab per team session. Background tabs send their events to the main process, which raises Windows notifications for finished, failed, and approval-needed events. A click opens the right tab. |
| **Code viewer** | Read-only file and diff views, attributed by member and comparable across checkpoints. |
| **Message box** | The target selector is part of every message command, so routing is explicit. |
| **Right-to-left** | Layout uses logical properties (start and end, not left and right) and mirrors for Arabic. Terminals, code, and file paths stay left-to-right. |
| **Accessibility** | Full keyboard navigation, screen-reader labels for statuses and cards, readable contrast in every theme, and reduced-motion support. |

---

## 10. Cross-Cutting Concerns

### 10.1 Internationalization

| Topic | Design |
|---|---|
| **Framework** | i18next with ICU message formats, for plurals and gender in all seven languages. |
| **Language packs** | Bundled for the seven languages. Additional packs can come from plugins. |
| **Switching** | At runtime, without a restart. |
| **Fonts** | Fallback font stacks for Arabic, Chinese, Japanese, and Korean. |
| **Terminals** | Wide-character handling for CJK in xterm.js. Terminals stay left-to-right even in Arabic mode. |
| **Model language** | Separate from the interface language. It is added to the briefing (Section 4.9). |

### 10.2 Performance goals

These are targets to validate in the feasibility tests.

| Area | Goal |
|---|---|
| **Five active members** | The interface stays responsive while all five stream output. |
| **Long sessions** | The feed and search stay fast with very long histories, through virtualization and indexed search. |
| **Idle cost** | A team that is waiting uses almost no processor time. |
| **Startup** | The UI appears quickly. The core and the history load in the background. |

### 10.3 Testing

| Level | What it covers |
|---|---|
| **Unit tests** | Engine rules, state machine, permission checks, event projections, license logic |
| **Adapter contract tests** | A scripted **mock CLI** that can report results, hang, ask questions, hit rate limits, crash, and write outside its ownership. Every adapter must pass the same contract. |
| **Replay and crash tests** | Replay produces the same projections. Inject crashes before effect execution, after execution but before result logging, and during reconciliation; duplicate commands return one result, uncertain provider/CLI actions never run twice automatically, and Git/file preconditions prevent duplicate application. |
| **Real-CLI tests** | The feasibility checklist (Section 5.6), run against each supported CLI and re-run when a CLI updates. |
| **End-to-end tests** | Playwright drives the Electron app through full team scenarios. |
| **Security tests** | IPC validation, plugin host isolation, and key handling. |
| **Platform matrix** | Windows 10 and 11, PowerShell and WSL members. |

### 10.4 Packaging

| Topic | Design |
|---|---|
| **Installer** | electron-builder, per-user install by default so no administrator rights are needed. |
| **Code signing** | Windows code signing for the installer and the app, which reduces SmartScreen and antivirus warnings for a program that starts many processes. |
| **Native modules** | node-pty and better-sqlite3 are rebuilt for Electron in the build pipeline. |

### 10.5 Diagnostics

Logs stay on the device. A user can export a diagnostics file to send to support. Nothing is ever uploaded automatically.

---

## 11. Feasibility Tests and Build Order

### 11.1 Feasibility tests first

These short tests answer the questions that everything else depends on. Their results go into the capability data (Section 5.5).

| # | Test | Question answered |
|---|---|---|
| S1 | Run a real CLI in a pseudo-terminal inside Electron on Windows | Does the display channel work with full colors, prompts, and input? |
| S2 | Attach the team tools to a CLI and complete a `report_result` round trip | Does the control channel work reliably? |
| S3 | Create a worktree, run a setup command, edit, commit, and merge | Is isolation practical, and how long does setup take? |
| S4 | Subscription login access for each provider | Which providers can be used as login members, and how? |
| S5 | Five concurrent terminals streaming output | Does the UI stay responsive? |
| S6 | Run a CLI through WSL | Do paths and the pseudo-terminal behave correctly? |

### 11.2 Internal build order

This is the order of **construction**, not release stages. The product ships complete (Spec 1.1).

| Phase | Work | Why in this order |
|---|---|---|
| 0 | Feasibility tests S1 to S6 | Remove the biggest unknowns first |
| 1 | Core service and event store | Everything depends on the log |
| 2 | Team engine with the mock CLI | Test the product's logic without any real model |
| 3 | Adapters: API first, then each CLI | API members are the most controllable and prove the engine |
| 4 | UI: feed, member bar, terminals, approvals | A view over a working engine |
| 5 | Files: worktrees, ownership, Git, checkpoints | Needs members that produce edits |
| 6 | Extensions: roles, skills, MCP, plugin host | Builds on stable adapters |
| 7 | Licensing, updates, languages, presets, first launch | Product shell around a working core |
| 8 | Hardening, packaging, and wide testing | Final quality pass |

---

## 12. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **CLI behavior differs and changes often** | Adapters break after a CLI update | Data-driven capability files, signed data updates, contract tests, and real-CLI tests per release |
| **A CLI does not reliably use the team tools** | Tasks never complete | Explicit instructions tuned per CLI, a nudge, then a "needs attention" state. Verified in feasibility test S2. |
| **Subscription login terms differ per provider** | Some providers cannot be login members | Handled in the harness, with CLI and API as alternatives. Verified in test S4. |
| **Worktrees use disk and setup time** | Slow starts, large folders | Setup command, optional shared dependencies, cleanup, and a disk view |
| **Windows pseudo-terminal and WSL quirks** | Display or input problems | Early tests S1 and S6, and a Windows matrix in testing |
| **Plugin security** | Compromise of the user's machine | Declarative-first design, isolated host, permission approval, no key access |
| **Prompt injection through project content** | A member is tricked into harmful actions | Per-member permissions, approvals, ownership, and tool limits |
| **A CLI member writes outside its worktree or bypasses hooks** | Work outside ownership, or an unapproved push, that the app cannot prevent | Separate default worktrees reduce accidental collisions; the watcher flags paths it sees; push control for CLIs is documented as best-effort, never as a guarantee (Sections 6.6 and 6.11) |
| **Token cost with five models and a shared transcript** | High bills for users | Per-member context modes and the 70% summarization |
| **License bypass** | Lost revenue | Accepted. The goal is fairness, with signed tokens and a minimal check. |
| **Antivirus and SmartScreen warnings** | Users distrust the installer | Code signing and signed releases |
| **Event log growth** | Large project files | Compression, retention limits, and pruning of old terminal chunks |

---

# Part C. Decisions and Open Items

## C1. Decisions log

| # | Decision | Status |
|---|---|---|
| 1 | Electron with TypeScript | Agreed |
| 2 | Four parts: UI, main process, core service (separate process), plugin host | Agreed |
| 3 | The event log is the source of truth, stored in SQLite | Agreed |
| 4 | On closing the window with a working team, ask: keep running in the background, or stop | Agreed |
| 5 | Delegation through team tools hosted as an MCP server | Agreed |
| 6 | Inbox per member, and a task state machine | Agreed |
| 7 | Members can ask the Leader, and the Leader can ask the user | Agreed |
| 8 | One adapter interface with CLI, API, and login adapters | Agreed |
| 9 | CLI members use a display channel and a control channel | Agreed |
| 10 | Typing into a member's terminal is allowed, logged, and reported to the Leader | Agreed |
| 11 | Worktrees are the default for editing members | Agreed |
| 12 | Ownership assigned by the Leader; blocked before the write for API members, detected afterward for CLI members | Agreed |
| 13 | Checkpoints as hidden Git references, with a shadow repository when there is no Git | Architecture decision |
| 14 | Final merge into the user's branch needs approval and a clean working tree | Architecture decision |
| 15 | Per-worktree Git hooks refuse pushes unless granted — best-effort for CLIs, which run with the user's own credentials | Architecture decision |
| 16 | Plugins: declarative-first, code plugins isolated in the plugin host, the core makes provider calls | Architecture decision |
| 17 | Signed entitlement tokens, with a minimal idempotent session-start check | Architecture decision |
| 18 | Capability data files per CLI, shipped as signed data updates | Architecture decision |
| 19 | Feasibility tests S1 to S6 before implementation | Architecture decision |
| 20 | Paid counting windows are anchored to the purchase date, and the Free limit resets per calendar day | Confirmed |
| 21 | The offline allowance is 3 sessions until the next sync | Confirmed |
| 22 | Worktrees live in the app data folder, outside the user's repository | Confirmed |
| 23 | Dependencies in worktrees are handled by a per-project setup command, with optional shared dependencies as a setting | Confirmed |
| 24 | The license server keeps only license or install ID, session IDs, timestamps, and plan. No project data. | Confirmed |
| 25 | The enforcement matrix (Section 6.11) is the authority for what each permission guarantee is worth per member type, and the permissions UI labels quote it | Agreed |
| 26 | Main owns CLI pseudo-terminals and process trees so a core restart can reconcile them without starting duplicates (Section 2.3) | Architecture decision; S1 and S6 verify teardown |
| 27 | Commands and external effects use durable IDs and recorded plans; uncertain outcomes are reconciled or paused, never retried blindly (Section 3.8) | Architecture decision |

## C2. Items settled by the feasibility tests

No product or design items remain open. The following technical details depend on how the real tools behave, so the feasibility tests answer them (Section 11.1):

| Item | Settled by |
|---|---|
| Which providers can be used as login members, and how | Test S4 |
| How each CLI accepts the team tools, instructions, and permissions at launch | Tests S1 and S2, and the per-CLI checklist (Section 5.6) |
| How the 70% summarization rule applies to each CLI | The per-CLI checklist (Section 5.6) |
| Worktree setup time and disk cost on real projects | Test S3 |
| Terminal performance with five active members | Test S5 |
| CLI behavior through WSL | Test S6 |
| Main-owned PTY survival across core restart and process-tree cleanup after main exit | Tests S1 and S6 |

## C3. Changes to the Product Specification

| Section | Change |
|---|---|
| Spec 4.3 (new) | New enforcement matrix: what each permission guarantee is worth for an API member versus a CLI member (blocked, approval, detected, unsupported). The example moves to 4.4. |
| Spec 7.1 | The conflict-protection wording no longer claims the app blocks the write for every member. Built-in API file tools block before the write; watched CLI edits are detected afterward, with a proposed revert for review. |
| Spec 7.2 | The approval wording no longer claims no member can push. The engine's own Git operations are a hard gate; for a CLI member push control is best-effort. Worktrees per editing member also become the **default**, with shared-folder mode as the optional setting. |
| Spec 8.1 | The approvals label reflects that a CLI's own approval prompt is answered in its terminal, shown in the app. |
| Spec 2 | Stop is accepted immediately, with completion shown after process termination and uncertain-effect reconciliation. |
| Spec 17 | Several open questions are now answered by this document (harness structure, CLI control, WSL, attribution, plugin sandboxing, license design). |
| Spec appendix | The file-safety and Git rows now state the real guarantee per member type. |
