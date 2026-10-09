# TIYE Agent: Product Overview and Specification

| | |
|---|---|
| **Product** | TIYE Agent, a desktop application for multi-model coding teams |
| **Initial platform** | Windows (macOS and Linux planned) |
| **Business model** | Paid, usage-based plans with a Free tier |
| **Status** | Product definition complete. Technical architecture defined; feasibility tests pending. |
| **Date** | October 2026 |

---

# Part A. At a Glance

## A1. The idea in one paragraph

TIYE Agent is a desktop application for developers who want several AI models to work on code together. Instead of using one model per session, the user builds a **team of 1 to 5 models** from **any provider**, gives each a role (leader, coder, reviewer, and so on), and watches the whole team collaborate **live**. The user talks to the leader, who delegates work to the other members, but the user can stop the process or message any member at any time. Everything runs on the user's device: there is no TIYE account, no project data is sent anywhere, and the user pays each model provider directly through their own subscriptions, API keys, or installed command-line tools.

## A2. How a session works

```
                      ┌─────────────┐
                      │     USER    │
                      └──────┬──────┘
                             │
                             ▼
                      ┌─────────────┐
                      │    LEADER   │
                      └──────┬──────┘
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │    Coder    │    │   Reviewer  │    │   Notator   │
   └─────────────┘    └─────────────┘    └─────────────┘
```

- The user gives the task to the **Leader**.
- The Leader delegates to the other members, collects their results, and reports back.
- Every message and action is visible to the user in real time.
- The user can **Stop** everything, or message the Leader, all members, or any single member.

## A3. Key facts

| Topic | Summary |
|---|---|
| **Team size** | 1 to 5 members per session |
| **Roles** | Defined by the user. One member is the Leader. |
| **Providers** | Any: login, API key, installed CLI, or local model |
| **Visibility** | The user sees every conversation and every action |
| **Safety** | Per-member permissions, file-conflict protection, checkpoints, Git approvals |
| **Failures** | The app alerts the user and attempts takeover or succession. A task with an uncertain external action pauses for review. |
| **Privacy** | Local-first. No account, no telemetry, no project data leaves the device. |
| **Customization** | Roles, skills, MCP servers, and plugins, all extensible |
| **Languages** | English, Arabic, French, German, Japanese, Korean, Chinese |
| **Pricing** | Free, Weekly, Monthly, and Annual plans, based on team sessions |

## A4. How it differs from existing tools

| | Codex | Zcode | **TIYE Agent** |
|---|---|---|---|
| Model providers | OpenAI models | GLM models | **Any provider** |
| Models per session | One | One | **1 to 5, each with a role** |
| Collaboration between models | No | No | **Yes, visible live** |
| User can talk to each model | Not applicable | Not applicable | **Yes, at any time** |

*Comparison as described by the product owner.*

## A5. Who it is for

- **Professional developers**, who already use multiple models and agents across separate tools. TIYE Agent unifies them and offers deep customization.
- **Junior developers**, who get ready-made teams, safe permission presets, and a guided first launch.

The core product is the same for both. Juniors get defaults, and professionals get depth.

---

# Part B. Glossary

| Term | Meaning |
|---|---|
| **Team session** | One run of a team of models working together on a task. Plan limits count team sessions. |
| **Member** | One model or agent in the team, with a name, a role, and permissions. |
| **Leader** | The member the user designates to coordinate the team. |
| **Role** | The job a member does, such as coder or reviewer. Defined by the user. |
| **Provider** | A company or service that supplies a model (for example OpenAI, Anthropic, Google). |
| **CLI** | A command-line coding agent installed on the device, such as Claude Code, Codex, Gemini CLI, or OpenCode. |
| **API member** | A member that connects to a model through a provider key. |
| **Login member** | A member that connects through the user's existing subscription. |
| **Harness** | TIYE Agent's own connection layer that launches, controls, and monitors every member. |
| **Tool calling** | A model's ability to use tools such as editing files or running commands. |
| **Skill** | A reusable instruction pack that a member loads when relevant. |
| **MCP** | Model Context Protocol, a standard way to give models extra tools such as web search. |
| **Plugin** | An add-on that extends the app (providers, panels, tools, themes). |
| **Context window** | How much conversation a model can hold in memory at once. |
| **Checkpoint** | An automatic restore point saved during a session. |
| **Preset** | A saved team setup that can be reused in one click. |
| **Worktree** | A separate working folder from the same Git repository, so members do not interfere with each other. |
| **WSL** | Windows Subsystem for Linux, a way to run Linux tools on Windows. |

---

# Part C. Specification

## 1. The Team Session

**In short:** a session is a team of 1 to 5 members coordinated by one Leader, with the whole process visible to the user.

### 1.1 Team composition

| Rule | Detail |
|---|---|
| Size | 1 to 5 members |
| Roles | Written freely by the user. The app imposes none. |
| Leader | The user designates exactly one member as Leader. |
| Connection | Each member connects in any supported way (Section 5). |

### 1.2 Hub-and-spoke communication

- The user's default conversation is with the **Leader**.
- The Leader delegates tasks, collects results, and reports back to the user.
- Members do not hold free-form conversations with each other. Every handoff goes through the Leader.
- When the mission is complete, the Leader returns to the user and reports that it is done.

### 1.3 Team briefing

When a session starts, the app tells every member, and the Leader in particular:

- who else is on the team,
- what each member's role is,
- what each member is allowed to do.

### 1.4 Parallel delegation

- The Leader can assign tasks to **more than one member at the same time**.
- Parallel work follows the file rules in Section 7, so members do not overwrite each other.
- The feed and member bar show every active task and each member's status.

### 1.5 Example workflow

| Member | Role |
|---|---|
| Claude | Leader |
| OpenCode | Code writer |
| GPT | Reviewer |
| Gemini | Notator (documents what was done) |

| Step | Action |
|---|---|
| 1 | The user sends the task to Claude. |
| 2 | Claude delegates code writing to OpenCode. |
| 3 | OpenCode finishes and reports back to Claude. |
| 4 | Claude sends the code to GPT for review. |
| 5a | If the review passes, Claude asks Gemini to write the notes. |
| 5b | If the review fails, Claude sends the work back to OpenCode, and steps 3 and 4 repeat. |
| 6 | Claude reports completion to the user. |

The user sees who is talking to whom at every step.

### 1.6 Loop control

- There is **no forced round limit**. The Leader decides when the mission is complete, and the user can stop at any time.
- An optional indicator such as "Review round 4" helps the user notice long loops. It is informational only and never stops anything.

---

## 2. User Controls

**In short:** the user stays in control at every moment.

| Control | Behavior |
|---|---|
| **Stop** | Sends an immediate stop request, even mid-task. The app shows shutdown in progress until member processes have ended and any uncertain action is flagged for review. |
| **Message the Leader** | The default. The Leader coordinates the rest. |
| **Message all members** | A broadcast every member receives. |
| **Message any single member** | Direct contact, for example going straight to the reviewer. |

### 2.1 Staying in sync

- Every message is tagged with **who sent it** and **who it is addressed to**.
- When the user messages a non-Leader member directly, the Leader is kept aware of it.

### 2.2 Messaging a busy member

- A message to a member that is mid-task **waits until the member finishes its current task**, then is delivered.
- The feed marks the message as queued.
- **Stop** still interrupts work immediately; the app confirms completion after the member processes have ended.

---

## 3. Context and Summarization

**In short:** the user sees everything. What each model receives is configurable.

| Topic | Rule |
|---|---|
| **What the user sees** | Everything: all conversations and all actions of every member. |
| **What each model receives** | A per-member setting. The default is the full shared transcript. The alternative is "only what concerns this member" (its own messages, role, and the team briefing), which lowers token usage. |
| **Automatic summarization** | When a model's context reaches **70% of its window**, the older part of the conversation is summarized automatically. |
| **Original record** | The full original conversation stays saved and searchable. Summarization changes only what the model receives. |

*Note:* CLI members manage their own context, so the 70% rule applies where the app controls the context, such as API members. The exact behavior for CLIs is part of the architecture design.

---

## 4. Permissions

**In short:** the user chooses a session mode, then fine-tunes permissions for each member.

### 4.1 Structure

| Level | Purpose |
|---|---|
| **Session mode** | A starting preset, for example ask before every action, auto-approve edits, or full autonomy. |
| **Per-member settings** | Customization on top of the preset. |

### 4.2 Per-member controls

| Area | Options |
|---|---|
| File access | None, read-only, read and edit |
| Terminal | Off, ask before each command, auto-run |
| Approvals | Which actions require the user's confirmation |

### 4.3 How permissions are enforced

The permissions UI offers settings according to each member's capabilities. An **API member** runs its tools through the app, which can refuse built-in file operations before they happen; an approved shell command can have wider effects. A **CLI member** runs as the user, with the user's own credentials, so the app can ask the CLI to limit itself and watch selected paths, but cannot enforce a filesystem boundary. The UI labels each setting per member so the promise matches the real guarantee.

| Guarantee | API member | CLI member |
|---|---|---|
| Edit a file outside its ownership | **Blocked through built-in file tools.** Approved shell commands need a separate boundary to guarantee this. | **Detected afterward if watched.** The CLI edits files itself; the watcher flags changes in monitored paths, and the user can review a proposed revert. |
| Read-only file access | **Blocked before the write.** No edit tool is given to the member. | **Best-effort.** Set at launch through the CLI's own option. Where the CLI has no such option, the setting is **unsupported**, and edits are detected, not prevented. |
| Terminal commands | **Approval-gated** by the app before the command runs; approval does not confine the command's effects. | **CLI-dependent.** The app requests prompts through supported CLI settings and shows them; it cannot guarantee a prompt before every command. |
| Push, force-push, or merge into protected branches | **Approval-gated.** The push tool does not exist until the user approves. | **Best-effort.** Per-worktree hooks and the CLI's own settings refuse or log it, but a CLI can bypass them. |
| The app's final merge into the user's branch | **Approval-gated.** The app performs it after the user approves the diff. | **Approval-gated for the app's merge.** A CLI with the user's Git access may run Git independently. |

A setting the CLI cannot honor is shown as **unsupported** in the permissions UI, with the fallback named. An API member without tool calling cannot edit files or run commands at all, so it joins as an advisor or reviewer (Section 5.3).

### 4.4 Example

| Member | File access | Terminal |
|---|---|---|
| Reviewer | Read-only | Off |
| Coder | Read and edit | Ask before each command |
| Leader | Read-only | Auto-run |

Juniors get safe presets. Professionals can tune every setting.

"Read-only" in this table is a hard block for an API member and best-effort for a CLI member (Section 4.3).

---

## 5. Connecting Members

**In short:** a member can connect in any way. To the user, every type looks the same: a name, a role, and a permission set.

### 5.1 Connection types

| Type | How it connects | Who runs the tools |
|---|---|---|
| **CLI** | An installed agent such as Claude Code, Codex, Gemini CLI, or OpenCode | The CLI itself, in its own environment |
| **API** | A provider key, or any compatible endpoint | TIYE Agent |
| **Login** | The user's existing account or subscription | Handled by the TIYE Harness |

### 5.2 CLI members

- TIYE Agent **does not install or bundle** any CLI. The user installs it.
- When the user links a CLI, the app **checks that it exists and reads its version**, then launches it when that member has work to do.
- If the CLI is missing or its version is unsupported, the app says so clearly.
- Each model runs inside **its own company's CLI, in that CLI's native environment**: for example Claude through Claude Code, GPT through Codex, and Gemini through Gemini CLI.
- **Permissions:** the CLI enforces them. The app translates the user's per-member settings into the CLI's native options at launch, so it can offer only what that CLI supports.
- A light file-change watcher acts as a safety net, mainly for file ownership (Section 7).
- Any other CLI can be added by giving its launch command.

### 5.3 API members

- TIYE Agent runs the tools itself, so it fully controls file access and commands.
- **Any API binding method is supported:**

| Method | Detail |
|---|---|
| Ready-made formats | OpenAI-style, Anthropic-style, Gemini-style |
| Custom connection | Base URL, authentication method (API key, bearer token, custom headers), and model name. Covers any provider, gateway, or proxy. |
| Local models | Ollama, LM Studio, and similar, with no key needed |

- **Limit:** an API member needs **tool calling** to edit files or run commands. Without it, the model can still join as an advisor or reviewer.

### 5.4 Login members

Members that use an existing subscription are handled by the TIYE Harness (Section 6).

### 5.5 Windows environments

Some CLIs run natively in PowerShell and others work best through WSL. When the app checks for a CLI, it also **detects which environment it lives in**.

---

## 6. The TIYE Harness

**In short:** the harness is TIYE Agent's own connection layer. The app never talks to a model or CLI directly. Everything goes through the harness.

```
┌─────────────────────────────────────────────────────┐
│  TIYE AGENT APP                                     │
│  Team feed · member bar · terminals · controls      │
└──────────────────────────┬──────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────┐
│  TIYE HARNESS                                       │
│  Launch · briefing · status · approvals · usage     │
└────────┬──────────────┬──────────────┬──────────────┘
         │              │              │
         ▼              ▼              ▼
    CLI members    API members   Login members
```

### 6.1 Why a dedicated harness

Launching and controlling vendor CLIs, and giving members access through the user's subscriptions, are the hardest connection problems in the product. A purpose-built harness solves them in one place, instead of scattering workarounds across the app.

### 6.2 Responsibilities

| Responsibility | Description |
|---|---|
| **CLI control** | Launch each vendor CLI, send it tasks, read its results, and detect completion. |
| **Login access** | Let members use the user's existing subscriptions. |
| **Unified interface** | One consistent interface for all member types, so the Leader and the feed treat them the same. |
| **Launch setup** | Pass the role briefing, permissions, skills, and MCP setup into each member at launch. |
| **Status reporting** | Report each member's state (working, waiting, needs approval, failed) to the app. |
| **Usage reporting** | Report usage where the provider or CLI exposes it. |
| **Live output** | Stream each member's output to its terminal pane. |
| **Approval relay** | Surface each member's approval prompts inside the app and return the user's answer. |
| **Failure detection** | Detect crashes, rate limits, lost connections, and exhausted credits, so the Leader can take over (Section 10). |
| **Environment detection** | Detect native Windows or WSL, and check CLI versions. |

### 6.3 Design principles

| Principle | Meaning |
|---|---|
| **Program-specific** | Built for TIYE Agent's needs, not a generic tool. |
| **Local-first** | Runs on the user's device and sends nothing to any TIYE server. |
| **Provider-neutral** | Supporting a new provider or CLI means adding a connector, not changing the app. |
| **Platform-separated** | Windows-specific parts are isolated so later ports are easier. |

---

## 7. Files and Git

**In short:** two layers keep members from overwriting each other, and Git records who did what.

### 7.1 Conflict protection

| Layer | How it works |
|---|---|
| **1. Leader assigns** | After reviewing the request, the Leader decides which member owns which files or areas. |
| **2. App protects** | Built-in file tools block an API member's out-of-ownership write before it happens. For a CLI member, a watcher detects changes afterward in monitored paths; the user can review and revert a detected change. Shell commands and CLI processes need an OS-enforced boundary for stronger file guarantees (Section 4.3). The Leader resolves conflicts by reassigning ownership or sequencing the work. |

### 7.2 Git integration

| Feature | Status | Detail |
|---|---|---|
| **Commit attribution** | Always on | Every commit is tagged with the member who made it, so history shows who planned, wrote, and reviewed. |
| **Approval rules** | Always on | Push, force-push, and merge into protected branches need the user's confirmation. For the app's own Git operations this is a hard gate: the push tool does not exist until the user approves. A CLI member runs with the user's own Git credentials, which the app cannot take away, so for a CLI this is best-effort: per-worktree hooks and the CLI's own settings refuse or log the push, and a bypass stays possible (Section 4.3). The user can loosen this per member. |
| **Worktrees per member** | Default for members with edit access | Each editing member works on its own branch in its own worktree, and the Leader merges after review. A shared-folder mode is available as an optional setting. |
| **No Git repository** | Supported | Projects still work through checkpoints, and the app offers to initialize a repository. |

### 7.3 Viewing code

- Code and file changes are **displayed inside the app**, so the user can review work without an external editor.
- Changes show which member made them and can be compared across checkpoints.
- The display is **view-only**. Editing happens through the members or in an external editor.

---

## 8. User Interface

**In short:** a clean team feed by default, with each member's real terminal one click away. All conversations appear in a neat, attractive, and user-friendly way.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MEMBER BAR   ● Claude (Leader)  ● OpenCode  ● GPT  ● Gemini              │
├──────────────────────────────────────────┬───────────────────────────────┤
│ TEAM FEED                                │ MEMBER TERMINAL               │
│                                          │ (the member's own terminal,   │
│ Claude → OpenCode                        │  as in the Windows terminal)  │
│   Write the login page                   │                               │
│                                          │ > running tests...            │
│ OpenCode → Claude                        │                               │
│   Done. 3 files changed  [View]          │ [Focus view] [Grid view]      │
│                                          │                               │
│ Claude → GPT                             │                               │
│   Please review the changes              │                               │
│                                          │                               │
│ ! GPT needs approval   [Approve]         │                               │
├──────────────────────────────────────────┴───────────────────────────────┤
│ To: [Leader v]   Type a message...                          [Send]       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 8.1 Main elements

| Element | Description |
|---|---|
| **Team feed** | One feed where every message shows the member's name, color, and role. File edits, commands, and test results appear as compact cards that expand for details. |
| **Member bar** | A strip showing each member with a live status: working, waiting, idle, needs approval, or failed. |
| **Member terminals** | Each CLI member has a **real terminal inside the app**, showing what the user would see in the Windows terminal, including approval prompts. The user can type into any terminal. A toggle switches between **focus view** (one terminal) and **grid view** (all side by side). API members get a matching pane. |
| **Approvals** | Approvals are surfaced **inside the app**, as a badge on the member and a card in the feed. API approvals are answered on the card; a CLI's own approval prompt appears in its terminal, which is shown in the app, and the badge tracks it. |
| **Message box** | A target selector for the Leader (default), all members, or one specific member. |

---

## 9. History, Checkpoints, and Recovery

**In short:** everything is saved, searchable, and reversible.

### 9.1 Saved history

Everything is saved per project, so the user can close the app and resume exactly where they stopped.

| Saved item | Content |
|---|---|
| **Team setup** | Members, roles, connections, permissions |
| **Conversation** | The full team feed, including every delegation and report |
| **Terminals** | Each member's terminal output |
| **Actions** | File edits, commands, approvals, test results |

- All of it is **searchable**, for example "when did the reviewer reject the login page?"
- A CLI can continue its own internal session only if it supports resuming. TIYE Agent keeps its own complete record either way and can re-brief a member with what happened.

### 9.2 Checkpoints and restore

| Feature | Behavior |
|---|---|
| **Register** | A record of every change |
| **Checkpoints** | A restore point saved automatically at each meaningful step, such as after each member finishes a task |
| **Restore** | The user can roll the project files back to any point, for example "before the reviewer's last fix". Conversation history stays, and the rollback is logged. |
| **Leader notification** | The Leader is told about a rollback so it does not work from an outdated picture of the code |

Checkpoints are the quick in-session undo. Git is the permanent project history.

### 9.3 App crash recovery

If TIYE Agent itself closes unexpectedly, it **recovers the session** on the next launch from the saved record: team setup, conversation, terminals, actions, and checkpoints. Members are re-briefed so work can continue.

---

## 10. Failure Handling

**In short:** recoverable failures trigger takeover; tasks with uncertain external actions pause for review so work is not repeated blindly.

### 10.1 Member failure

A member can crash, hit a rate limit, lose its connection, or run out of credits. Two things happen at once:

| Response | Detail |
|---|---|
| **Alert to the user** | The member's status turns to failed, with the reason and a notice in the feed. |
| **Leader takes over** | The Leader learns which member failed and which task was interrupted, then completes the work itself or hands it to another capable member. |

- The failed member's partial work stays recorded.
- The user can retry or reconnect the member later, and the Leader is told when it returns.

### 10.2 Leader failure

| Step | Behavior |
|---|---|
| **Promotion** | The app automatically promotes a successor and alerts the user at the same time. |
| **Succession order** | Set by the user in team setup, for example 1. OpenCode, 2. GPT. If unset, the app picks the next member that can coordinate. |
| **Handover** | The interim Leader receives the full conversation, the team briefing, and the interrupted task. |
| **Notice** | A feed card such as "Claude failed, GPT is now interim leader", and every member is told who the new Leader is. |
| **Recovery** | When the original Leader returns, the user chooses whether to hand leadership back. The app never switches on its own. |

---

## 11. Roles, Skills, MCP, and Plugins

**In short:** four building blocks, all customizable, with sensible defaults so juniors never need to touch them.

### 11.1 The four building blocks

| Block | What it is | How it is assigned |
|---|---|---|
| **Roles** | A reusable library. A role bundles instructions, default permissions, skills, and tools. Built-in roles for juniors, custom roles for everyone. | Per member |
| **Skills** | Instruction packs a member loads when relevant, for example "write tests in our style". | Per member or per role |
| **MCP servers** | Extra tools such as web search or a database connector. For CLI members, the CLI's own MCP support does the work, and the app passes the setup through where the CLI allows it. | Per member, for example only the researcher gets web search |
| **Plugins** | Extensions to the app itself: new providers, panels, tools, themes. A plugin can bundle roles, skills, and MCP servers. | Installed once, available everywhere |

### 11.2 Applying to all members

The user can assign **any skill, role, or MCP server to all members at once**, in addition to assigning them individually. A skill assigned to every member works as shared project-wide guidance.

### 11.3 Customization scope

Themes, layout, shortcuts, per-member behavior, and the Leader's delegation rules and prompts are all editable.

### 11.4 Installing additions

Installation is open, with no required store:

| Method | Example |
|---|---|
| **Link** | A GitHub repository or a direct file link |
| **Local file or folder** | Picked from the device or dragged into the app |
| **Manual creation** | Built directly inside the app |
| **Import and export** | Roles, skills, and whole team presets shared as a single file |

A community directory could be added later as one more source, but it is never required.

**Trust safeguard:** because plugins can run code, the app shows where an addition came from and what it can access (files, terminal, network) before installation. The user confirms, and nothing runs automatically.

---

## 12. Presets and First Launch

**In short:** ready-made teams for a fast start, custom presets for repeat work.

### 12.1 Team presets

| Type | Description |
|---|---|
| **Ready-made** | Built-in teams such as Leader + Coder + Reviewer, aimed at juniors |
| **Custom** | Save any team setup (members, roles, permissions, succession order) and reuse it in one click, or start from a blank team |

Any preset can be edited after loading. Changes affect only that project unless the user saves them back to the preset.

### 12.2 Guided first launch

A three-step setup that professionals can skip:

| Step | Action |
|---|---|
| **1. Detect** | The app scans the device for installed CLIs (Claude Code, Codex, Gemini CLI, OpenCode) and lists what it found. |
| **2. Suggest** | It proposes a ready-made team from those tools. With one CLI found, it offers a single-member team. With none, it explains how to add an API key. |
| **3. Start** | The user picks a project folder and sends the first task. |

The scan happens only on the user's device and sends nothing anywhere.

---

## 13. Parallel Sessions

**In short:** several teams can run at the same time, each in its own tab.

| Topic | Behavior |
|---|---|
| **Separation** | Each team has its own members, transcript, checkpoints, and permissions. Teams never mix. |
| **Notifications** | A background team sends a Windows notification when it finishes, fails, or needs approval. Clicking it opens that tab. |
| **Same project** | File protection works across sessions. Worktrees make this safe by default. |
| **Shared limits** | Teams using the same subscription share its limit, and the app shows a warning. |
| **Machine load** | Each CLI member is a running process. The app shows each tab's activity so the user can pause or close heavy ones. |

---

## 14. Privacy and Data

**In short:** local-first is the product's trust promise.

### 14.1 Principles

- **No TIYE account** is required.
- **No telemetry:** no analytics and no tracking.
- **No cloud sync:** moving a project's history to another device is a manual export and import.
- API keys are stored **encrypted in the system's secure storage**.

### 14.2 Where data lives

| Data | Location |
|---|---|
| API keys | Encrypted in the system's secure storage, on the user's device |
| History, checkpoints, terminal logs | On the user's device |
| Conversations and code | Sent only to the providers the user chose |
| Project data | **Never sent to TIYE** |

### 14.3 The only contact with TIYE servers

| Contact | When | What is sent |
|---|---|---|
| **License and limit check** | When a session's first task is sent | The license key (a random anonymous ID for Free users) and the session count |
| **Update check** | Periodically | A request for the latest version information |

Never sent: project data, conversations, files, prompts, or usage details.

**Offline allowance:** without internet, the app allows a small number of sessions and syncs the count later, so users are never blocked. This also keeps local models usable offline.

---

## 15. Plans, Pricing, and Usage

**In short:** the app is paid and usage-based. Plans limit team sessions, not features. Model costs are separate and paid by the user to each provider.

### 15.1 Plans

| Plan | Price | Team sessions |
|---|---|---|
| **Free** | $0 | 1 per day |
| **Weekly** | $7.99 per week | 5 per week |
| **Monthly** | $15 per month | 6 per week, renewing weekly |
| **Annual** | $50 per year | 12 per month, renewing monthly |

Plan descriptions may call these "projects". One project means one team session.

### 15.2 Counting rules

| Event | Uses quota? |
|---|---|
| The first task is sent in a new session | **Yes** |
| A tab is opened but no task is sent | No |
| A saved session is resumed | No |
| A session is recovered after an app crash | No |

### 15.3 Enforcement

- The check is a minimal request to the TIYE server (Section 14.3). The server only counts.
- The goal is fairness, not perfection. A determined user could bypass any check.

### 15.4 Model costs and usage

- TIYE Agent **does not sell or resell model access**. Users pay each company directly through their own subscriptions, API keys, or CLI logins.
- There is **no billing system** for models: no credits, wallet, or payments inside the app.
- **Usage display is informational.** Where a provider or CLI exposes usage, the app shows it per member (for example "Claude: 40% of limit used"). Where it cannot, it shows nothing.
- A subscription limit being hit counts as a member failure (Section 10).

---

## 16. Languages, Platforms, and Updates

### 16.1 Languages

English, Arabic, French, German, Japanese, Korean, and Chinese.

| Language group | Detail |
|---|---|
| **Arabic** | The whole layout mirrors to right-to-left. Code, file paths, and terminals stay left-to-right. |
| **Chinese, Japanese, Korean** | Proper fonts and input methods, and terminals that handle wide characters correctly. |
| **Chinese variants** | Simplified first, with Traditional as an added pack. |
| **Interface vs. model language** | Separate. The Leader can be told to reply in the user's language, and role instructions can be written in any language. |
| **Switching** | Anytime, without restarting. |
| **More languages** | Since plugins are open, the community can add translations. |

### 16.2 Platforms

- **Initially Windows.** macOS and Linux will follow.
- Platform-specific parts (terminal handling, secure key storage, CLI launching) are kept separate from the start to make later ports easier.

### 16.3 Updates

- The app checks for new versions and **asks before installing**. Nothing installs silently.
- Every plan, including Free, is notified when an update is available.

---

## 17. Open Questions for the Architecture Stage

The product definition is complete. These technical questions are answered during architecture design.

| # | Question |
|---|---|
| 1 | Is the harness a separate process or a module inside the app, and what is its interface to the app? |
| 2 | How does the harness control each CLI: terminal session, non-interactive mode, or structured output? |
| 3 | How does the harness handle subscription logins for each provider? |
| 4 | Which CLIs support resuming sessions, accepting permissions at launch, and accepting MCP setup? |
| 5 | How are CLIs detected and run across native Windows and WSL? |
| 6 | How are commits and file changes attributed when a CLI makes edits on its own? |
| 7 | How does the 70% summarization rule apply to CLI members that manage their own context? |
| 8 | How are connectors for new providers and CLIs defined: built in, or added through plugins? |
| 9 | What is the plugin sandboxing and security model for code that runs on the user's machine? |
| 10 | How large is the offline allowance, and how are license keys issued and renewed with the payment provider? |
| 11 | How is the anonymous ID for Free users generated and stored? |

---

# Appendix. Decisions at a Glance

| Area | Decision |
|---|---|
| Scope | Complete product from the first release |
| Platform | Windows first, others later |
| Team size | 1 to 5 members |
| Roles | User-defined, any role |
| Leader | User-designated, coordinates the team |
| Communication | Hub-and-spoke through the Leader |
| Delegation | The Leader can assign tasks to several members at once |
| User control | Stop, message the Leader, all members, or any single member |
| Busy members | Messages wait until the current task finishes |
| Visibility | The user sees everything |
| Model context | Per-member setting, default full transcript, automatic summarization at 70% |
| Permissions | Fully customizable per member |
| Connection types | Login, API (any binding method), CLI |
| CLI handling | The user installs it. The app detects, launches, and shows a real terminal. |
| Harness | Purpose-built TIYE Harness for CLI control and login access |
| File safety | Leader assigns ownership; the app blocks out-of-ownership writes by API members and detects them for CLI members |
| Git | Built in, with attribution always on, and push and merge approvals enforced for the app's own Git operations (best-effort for CLIs) |
| Code viewing | Displayed inside the app, view-only |
| History | Everything saved and searchable |
| Restore | Automatic checkpoints and rollback |
| Failures | Alert the user, the Leader takes over, a successor steps in if the Leader fails |
| App crash | Session recovered on the next launch |
| Extensions | Roles, skills, MCP, plugins, open installation, assignable to all members |
| Presets | Ready-made and custom |
| Parallel teams | Supported, one tab per team |
| First launch | Guided and skippable |
| Languages | Seven, including Arabic right-to-left |
| Privacy | Local-first, no account, no telemetry |
| Server contact | Only the license and limit check and the update check |
| Plans | Free, Weekly, Monthly, Annual, counting team sessions |
| Limit enforcement | Minimal server check with an offline allowance |
| Updates | The user is notified on every plan and approves installation |
| Model costs | Paid by the user directly to providers |
