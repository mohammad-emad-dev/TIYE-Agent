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
| **Main process** | Windows and tray, notifications, secure key storage, license client, updater. | Owns everything that needs operating-system privileges. |
| **Core service** | Team engine, harness, file guard, Git, event store, search. | The product's heart must survive UI crashes and keep running when the window closes. |
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
| Core ⇄ CLI member | Core and each CLI | A pseudo-terminal for display and input, plus the team-tools MCP connection for control. |
| Core ⇄ API member | Core and provider | HTTPS to the provider, driven by the core's own agent loop. |
| Core ⇄ Plugin host | Core and plugin host | JSON-RPC over a pipe, with capability checks on every call. |
| Core ⇄ Git | Core and git | Child processes of the system git. |
| Main ⇄ TIYE server | Main and the TIYE server | HTTPS, for the license and limit check and the update check only. |

### 2.2 Closing the window while a team works

- Closing the window closes the **UI only**. Main and core keep running, and the team continues.
- On close, the app asks the user once: **keep running in the background** (tray icon, with a notification when the team finishes, fails, or needs approval) or **stop the team**. The choice can be remembered.
- Quitting the app from the tray stops all teams after confirmation.

### 2.3 Crash behavior

| Event | Result |
|---|---|
| UI crashes or reloads | Nothing stops. The UI rebuilds from the event log. |
| Core service crashes | Main restarts it. Sessions are rebuilt from the log, CLI members are relaunched and re-briefed. |
| Plugin host crashes | Only plugin features pause. The core and teams continue. |
| Whole app crashes | On next launch the session is recovered from the log (Spec 9.3). Crash recovery does not use new quota. |

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
| **running** | The member is working | waiting_approval, blocked, done, failed, cancelled |
| **waiting_approval** | The member needs the user's approval | running, cancelled |
| **blocked** | The member asked a question and waits for the answer | running, cancelled |
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
| 1 | The engine marks all running tasks as cancelled and writes a stop event. |
| 2 | CLI members receive an interrupt (Ctrl+C) in their terminal. |
| 3 | After a short timeout, any CLI that is still running is terminated, together with its child processes. |
| 4 | API members abort their requests and agent loops. |
| 5 | The team stays idle until the user sends a new message. |

### 4.7 Failure supervisor

| Failure | How it is detected | Engine response |
|---|---|---|
| **Crash** | Process exit with an error, or a dropped connection | Task fails, member status becomes failed, user alerted, Leader takes over |
| **Hang** | No output and no tool activity for a configurable time | Same as a crash, after one automatic nudge |
| **Rate limit or credits exhausted** | Provider error codes, or CLI-specific output patterns | Same, with the reason shown to the user |
| **Authentication expired** | Provider error codes, or CLI-specific output patterns | Same, with a prompt to reconnect |
| **Lost network** | Request failures | Retry briefly, then same as a crash |

**Leader takeover.** The Leader receives a `member.failed` notice naming the member and the interrupted task. It either completes the work itself or reassigns it. The failed member's partial work stays recorded and its worktree stays intact.

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
| **Launch** | The adapter starts the CLI in the member's working folder. Environment variables set the Git author to the member's name, so commits made by the CLI are attributed correctly. |
| **Environment** | Native Windows (PowerShell) or WSL, detected at link time. WSL members are launched through `wsl.exe`, with path translation. |
| **Completion** | By the member's explicit `report_result` call. If a CLI goes idle without reporting, the engine nudges it once, then marks the task as needing attention and tells the Leader. |
| **Permissions** | The adapter translates the user's per-member settings into the CLI's own launch options, using its capability data (Section 5.5). The app offers only what that CLI supports. A file watcher is the safety net. |
| **Approvals** | The CLI's own prompts appear in its terminal, and the user answers there. The adapter marks the member as "needs approval" when it detects a prompt, through the CLI's hook mechanism where it exists, or output patterns otherwise. The member bar and the feed show the badge. |
| **Resume** | If the CLI supports resuming its own session, the adapter uses it. Otherwise the member is relaunched and re-briefed from the log. |
| **Shutdown** | Interrupt, then terminate after a timeout, including child processes. |
| **Custom CLIs** | Added by a launch command and an optional capability file. They work with the display channel and the team tools. |

### 5.3 API adapter

For API members, the core runs the agent loop itself.

| Part | Design |
|---|---|
| **Provider layer** | Ready-made formats for OpenAI-style, Anthropic-style, and Gemini-style APIs. A custom connection takes a base URL, an authentication method, and a model name. Local models such as Ollama and LM Studio use the same layer. |
| **Agent loop** | Send context, receive a response, run any tool calls, repeat until done. Streaming output goes to the member's pane. |
| **Built-in tools** | Read file, write file, edit file, list and search files, run command. Plus the member tools from Section 4.2. |
| **Permission gate** | Before every tool call, the core checks the member's permissions and file ownership, and asks the user when the rule requires approval. |
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

For API members the app can check ownership **before** every write. A CLI member edits files by itself, so the app can only notice afterward. Isolation solves this for both: two members physically cannot overwrite each other.

| Who | Working folder |
|---|---|
| **Editing members** (coder and others with edit permission) | Their own **worktree** on their own branch |
| **Leader** | The **integration worktree**, where merged work lands |
| **Read-only members** (for example a reviewer) | A worktree they are pointed at, read-only |
| **The user's own folder** | Untouched until the user approves a final merge (Section 6.4) |

Branches follow a clear pattern: `tiye/<session>/integration` and `tiye/<session>/<member>`. Worktrees live in the app data folder, so the user's project folder stays clean. This makes worktrees the **default** for editing members (a change from the optional setting in Spec 7.2).

### 6.2 Worktree lifecycle

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
| **API member** | Hard block. The file guard refuses a write outside the member's ownership and tells the member and the Leader. |
| **CLI member** | A file watcher in the member's worktree detects changes outside its ownership. The change is flagged to the user and the Leader, and the user can revert it. |

### 6.4 Merging

| Step | Action |
|---|---|
| 1 | The Leader calls `request_merge` for a member's branch. |
| 2 | The engine merges it into the integration branch. |
| 3 | If there are conflicts, they return to the Leader as a task with the conflicting files. The Leader resolves them itself or delegates. |
| 4 | When the mission is complete, the engine proposes merging the integration branch into the user's branch. The user sees the full diff and **approves**. |

The final merge touches the user's folder only when the user's working tree is clean. Otherwise the app offers to leave the result on its branch.

### 6.5 Attribution

| Item | Rule |
|---|---|
| **Author** | The member's name, with an identifying address such as `<member-id>@tiye.local`. This is set through environment variables, so commits made by a CLI are attributed correctly. |
| **Trailer** | Each commit carries the session identifier. |
| **Commit timing** | CLI members may commit themselves. If a task ends with uncommitted work, the engine commits it with the member as author. |

History then reads as "Claude planned, OpenCode wrote, GPT reviewed".

### 6.6 Git safety

Push, force-push, and merge into protected branches always need the user's approval (Spec 7.2).

| Member type | Enforcement |
|---|---|
| **API member** | The push tool does not exist without approval. Every push request goes to the approval broker. |
| **CLI member** | The member's worktree has its own Git hooks, set per worktree, that refuse a push unless the engine has granted it. The CLI's own permission settings add a second layer. |

This is best-effort for CLIs, since they run with the user's credentials. It is combined with CLI permission settings and visible logging.

### 6.7 Reviews

A review task names the worktree to read. The reviewer's working folder is set to it, with read-only permission, so it reviews exactly the code under review, without disturbing the author.

### 6.8 Checkpoints and restore

Checkpoints are saved as **hidden Git references**, so they never touch the user's branches, index, or history.

| Item | Design |
|---|---|
| **When** | After each completed task, before every merge, before every restore, and on demand. |
| **How** | The state of each active worktree is written as a snapshot using a temporary index, and stored under `refs/tiye/<session>/<n>`. The event sequence number is recorded with it. |
| **Restore** | The engine first saves a safety checkpoint, pauses the affected members, restores the files, and writes a `checkpoint.restored` event. The conversation history stays. |
| **Leader notice** | The Leader receives a rollback notice with the restore point, so it does not work from an outdated picture of the code. |

### 6.9 Projects without Git

The app uses a **shadow repository**: a separate Git directory in the app data folder whose work tree is the project folder. It gives the same snapshots without changing the project. It also offers to initialize real Git, which is recommended, because isolation by worktrees needs it. Without Git, the session runs in shared-folder mode.

### 6.10 Shared-folder mode (optional)

A setting lets all members work in the same folder.

| Aspect | Behavior |
|---|---|
| **Ownership** | API members are blocked before writing. CLI members are watched and flagged. |
| **Conflicts** | Out-of-ownership edits can be reverted from the latest checkpoint. |
| **Guarantees** | Weaker than worktrees, so it is a deliberate choice for the user. |

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
| **Replay tests** | Recorded event logs are replayed to check that projections and recovery produce the same state. |
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
| 12 | Ownership assigned by the Leader and enforced by the app | Agreed |
| 13 | Checkpoints as hidden Git references, with a shadow repository when there is no Git | Architecture decision |
| 14 | Final merge into the user's branch needs approval and a clean working tree | Architecture decision |
| 15 | Per-worktree Git hooks refuse pushes unless granted | Architecture decision |
| 16 | Plugins: declarative-first, code plugins isolated in the plugin host, the core makes provider calls | Architecture decision |
| 17 | Signed entitlement tokens, with a minimal idempotent session-start check | Architecture decision |
| 18 | Capability data files per CLI, shipped as signed data updates | Architecture decision |
| 19 | Feasibility tests S1 to S6 before implementation | Architecture decision |
| 20 | Paid counting windows are anchored to the purchase date, and the Free limit resets per calendar day | Confirmed |
| 21 | The offline allowance is 3 sessions until the next sync | Confirmed |
| 22 | Worktrees live in the app data folder, outside the user's repository | Confirmed |
| 23 | Dependencies in worktrees are handled by a per-project setup command, with optional shared dependencies as a setting | Confirmed |
| 24 | The license server keeps only license or install ID, session IDs, timestamps, and plan. No project data. | Confirmed |

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

## C3. Changes to the Product Specification

| Section | Change |
|---|---|
| Spec 7.2 | Worktrees per editing member become the **default**. Shared-folder mode is the optional setting. |
| Spec 17 | Several open questions are now answered by this document (harness structure, CLI control, WSL, attribution, plugin sandboxing, license design). |
