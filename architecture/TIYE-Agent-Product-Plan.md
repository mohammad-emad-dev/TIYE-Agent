# TIYE Agent: Product Plan

**Status:** Idea definition (pre-architecture)
**Scope:** Complete product from the first release, no staged versions
**Initial platform:** Windows (macOS and Linux later)

> This document gathers every decision made during the idea-planning discussion. All assumptions listed in Section 22, including the harness responsibilities, are now **confirmed**. Remaining open items are architecture questions (Section 22).

---

## 1. Vision

TIYE Agent is a **desktop coding-agent application** in the same category as Codex and Zcode, but with one core difference:

- Codex is tied to OpenAI models, and Zcode is tied to GLM models.
- **TIYE Agent works with every type of provider**, and a single session can host **1 to 5 models working together as a team**, each with a user-defined role.

The user watches the whole team work in real time: who is talking, who is delegating, and what each member is doing.

### 1.1 The problem it solves

Developers are already moving to multiple models and multi-agent workflows, but they juggle them across separate tools. TIYE Agent puts them in one place, where they collaborate and everything is visible.

### 1.2 Target users

- **Professional developers:** full customization of roles, permissions, tools, and delegation rules.
- **Junior developers:** ready-made teams, safe permission presets, and a guided first launch.

The core product is the same for both. Juniors get defaults, and professionals get depth.

### 1.3 Business model

TIYE Agent is a paid application with four **usage-based plans** (confirmed). Plans limit the number of projects, not features. This is separate from model costs: the app does not sell or resell model access, and users pay each provider directly (Section 13).

| Plan | Price | Project limit |
|---|---|---|
| **Free** | $0 | 1 project per day |
| **Weekly** | $7.99 per week | 5 projects per week |
| **Monthly** | $15 per month | 6 projects per week, limit renews weekly |
| **Annual** | $50 per year | 12 projects per month, limit renews monthly |

**What counts as one "project":** one **team session** (a team of models working together on a task). This is the unit every plan limit uses. Where this document says "per project" elsewhere (history, settings), it means the project folder; plan limits count team sessions.

**Counting rules (confirmed):**

- A session counts when the **first task is sent**, not when the tab is opened.
- **Resuming** a saved session does not use new quota.
- **Crash recovery** (Section 12.3) does not use new quota.

**Updates (confirmed):** every plan, including Free, is notified when an update is available. The user decides whether to install it (Section 20.2).

**Limit enforcement (confirmed):**

- When a session's **first task is sent**, the app asks the TIYE server whether the license can start another session. The server only counts.
- The app sends only the **license key** (a random anonymous ID for Free users) and the session count. No project data, conversations, files, or usage details are ever sent.
- **Offline allowance:** if there is no internet connection, the app allows a small number of sessions and syncs the count when the connection returns, so users are never blocked. This also keeps local models usable offline.
- The goal is fairness, not perfection: a determined user could still bypass any check.
- Details in Section 14.

---

## 2. Core Concept: The Team Session

### 2.1 Team composition

- A session has **1 to 5 members**.
- Each member is a model or an agent connected through any supported method (Section 6).
- The user defines each member's **role** freely. Roles are never fixed by the app.
- The user designates one member as the **Leader**.

### 2.2 Hub-and-spoke model

- The user's default conversation is with the **Leader**.
- The Leader delegates tasks to other members, collects their results, and reports back to the user.
- Members do not hold free-form conversations among themselves. Handoffs go through the Leader.
- When the Leader finishes the mission, it returns to the user and reports that the work is done.

### 2.3 Team briefing

When a session starts, the app tells every member (the Leader especially):

- Who else is on the team.
- What each member's role is.
- What each member is allowed to do.

### 2.4 Example workflow (from the discussion)

| Member | Role |
|---|---|
| Claude | Leader |
| OpenCode | Code writer |
| GPT | Reviewer |
| Gemini | Notator (documents what was done) |

1. The user sends the task to Claude.
2. Claude delegates code writing to OpenCode.
3. OpenCode finishes and reports back to Claude.
4. Claude sends the code to GPT for review.
5. If the review passes, Claude asks Gemini to write the notes.
6. If the review fails, Claude returns the work to OpenCode for changes, and the loop repeats.
7. Claude reports completion to the user.

The whole process is visible to the user throughout.

### 2.5 Loop control

- No forced round limit. The Leader decides when the mission is complete, and the user can stop at any time.
- **Review-round indicator (included, optional setting):** a small informational indicator such as "Review round 4" so the user can spot long loops. It never stops anything automatically.

### 2.6 Parallel delegation

- The Leader can assign tasks to **more than one member at the same time**.
- Parallel members still follow the file rules in Section 7: the Leader assigns file ownership, and the app blocks conflicting writes.
- The feed and member bar show every active task at once, with each member's status.

---

## 3. User Controls

The user can do any of the following at any moment:

| Control | Behavior |
|---|---|
| **Stop** | Halt the whole process immediately, even mid-task. |
| **Message the Leader** | Default target. The Leader coordinates the rest. |
| **Message all models** | Broadcast that every member sees. |
| **Message any single member** | Direct contact with any member, such as going straight to the reviewer. |

### 3.1 Staying in sync

- Every message in the shared transcript is tagged with **who sent it** and **who it is addressed to**.
- When the user messages a non-Leader member directly, the Leader is kept aware of it.

### 3.2 Messaging a busy member

- If a message is sent to a member that is in the middle of a task, the member **waits until it finishes the current task**, then receives the message.
- The message shows in the feed as queued, so the user knows it has not been delivered yet.
- **Stop** (Section 3) still halts everything immediately, so the user always has an override.

---

## 4. Context and Visibility

### 4.1 What the user sees

- **Everything.** All conversations and all actions of every member are visible and readily available to the user.

### 4.2 What each model receives

- **Per-member setting.**
- **Default:** the full shared transcript.
- **Option:** "only what concerns this member" (its own messages, role, and the team briefing) to reduce token usage.
- This is a per-member setting. The user's view always shows everything.

### 4.3 Automatic summarization

- When a model's context reaches **70% of its window**, the older part of the conversation is **summarized automatically**.
- The full, original record stays saved and searchable in the app (Section 10). Summarization affects only what the model receives, never what the user sees.

---

## 5. Permissions

Permissions are chosen by the user, at the session level and per member.

### 5.1 Structure

- **Session mode** works as a starting preset (for example: ask before every action, auto-approve edits, full autonomy).
- **Per-member customization** sits on top of the preset.

### 5.2 Per-member controls

| Area | Options |
|---|---|
| File access | None, read-only, read and edit |
| Terminal | Off, ask before each command, auto-run |
| Approvals | Which actions require the user's confirmation |

### 5.3 Examples

- Reviewer: read-only.
- Coder: can edit files.
- Leader: can run commands.

Juniors get safe presets. Professionals can tune every setting.

---

## 6. Connecting Members

A member can connect in **any** way. To the user, all types look the same: a name, a role, and a permission set.

### 6.1 Connection types

| Type | Description |
|---|---|
| **Login** | Sign in with an existing account or subscription. |
| **API** | Enter a provider key. |
| **CLI** | Use an installed agent such as Claude Code, Codex, Gemini CLI, or OpenCode. |

### 6.2 CLI members

- TIYE Agent **does not install or bundle** any CLI. The user must already have it installed.
- On linking, the app **checks that the CLI exists and reads its version**, then launches it in the terminal when that member has work to do.
- If the CLI is missing or its version is unsupported, the app says so clearly.
- Each model runs inside **its own company's CLI, in that CLI's native environment**.
- TIYE Agent launches the CLI, briefs it on its role, and shows everything it does.
- **Permissions for CLI members:** the CLI itself enforces them. TIYE Agent translates the user's per-member settings into the CLI's native options when launching it. The app can only offer options the CLI supports.
- A light file-change watcher remains as a safety net, mainly for the file-ownership rule (Section 7).

### 6.3 API members

- With an API model, TIYE Agent runs the tools itself, so it fully controls file access and commands.
- **Any API binding method is supported:**
  - Ready-made formats: OpenAI-style, Anthropic-style, Gemini-style.
  - Custom connection: base URL, authentication method (API key, bearer token, custom headers), and model name. This covers any provider, gateway, or proxy.
  - Local models such as Ollama and LM Studio, with no key needed.
- **Limit:** an API member needs **tool calling** to edit files or run commands. Without it, the model can still join as an advisor or reviewer.

### 6.4 Login members

- Subscription-login access is handled by the TIYE Harness (Section 6.7).

### 6.5 Custom CLIs

- Any CLI can be added by giving its launch command.

### 6.6 Windows environments

- Some CLIs run natively in PowerShell and others work best through WSL. The app should **detect which environment a CLI lives in** when it checks for it.

### 6.7 The TIYE Harness

TIYE Agent will have its **own purpose-built harness**, developed specifically for this program. The harness is the layer between the app and every member's model or CLI. It solves the two hardest connection problems:

- **CLI control:** launching each vendor CLI, sending it tasks, reading its results, and detecting when it has finished, without relying on fragile terminal scraping.
- **Login access:** letting members use the user's existing subscriptions.

Because the harness is a dedicated component, CLI control and login access are treated as part of its design rather than as open risks.

#### 6.7.1 Where it sits

```
User  ⇄  TIYE Agent app (feed, terminals, controls)
                    ⇅
              TIYE Harness
        ┌───────┬───────┬────────┐
      CLI     API     Login    Custom
    members  members  members   CLIs
```

The app never talks to a model or CLI directly. Everything goes through the harness.

#### 6.7.2 Responsibilities

**Confirmed by the discussion:**

| Responsibility | Description |
|---|---|
| CLI control | Launch each vendor CLI, send it tasks, read its results, and detect completion. |
| Login access | Let members use the user's existing subscriptions. |

**Also confirmed (details to be defined at the architecture stage):**

| Responsibility | Description |
|---|---|
| Unified interface | One consistent interface for all member types (CLI, API, login, custom), so the Leader and the team feed treat them the same. |
| Launch setup | Pass the role briefing, permissions, skills, and MCP setup into each member at launch. |
| Status reporting | Report each member's state (working, waiting, needs approval, failed) back to the app. |
| Usage reporting | Report usage where the provider or CLI exposes it. |
| Live output | Stream each member's output to its terminal pane inside the app. |
| Approval relay | Surface each member's approval prompts inside the app and return the user's answer. |
| Failure detection | Detect crashes, rate limits, lost connections, and exhausted credits, and signal the app so the Leader can take over (Section 12). |
| Environment detection | Detect whether a CLI lives in native Windows or WSL, and check its version (Section 6.2, 6.6). |

#### 6.7.3 Design principles

- **Program-specific:** built for TIYE Agent's needs, not a generic tool.
- **Local-first:** runs entirely on the user's device and sends nothing to any TIYE server (Section 14).
- **Provider-neutral:** adding a new provider or CLI means adding a connector to the harness, not changing the app.
- **Platform-separated:** Windows-specific parts are isolated so later ports to macOS and Linux are easier (Section 20).

#### 6.7.4 Open design questions

Detailed at the architecture stage:

1. Is the harness a separate process, or a module inside the app?
2. How does it control each CLI (terminal session, non-interactive mode, or structured output)?
3. How does it handle login access for each provider?
4. How are connectors for new providers and CLIs defined (built in, or added through plugins)?

---

## 7. Files and Conflict Protection

Two layers protect against conflicting edits:

1. **Leader assigns.** After reviewing the request, the Leader decides which member owns which files or areas.
2. **App protects.** If a member tries to edit a file it does not own, or one another member is editing, the app **blocks the write** and notifies both that member and the Leader. The Leader resolves it by reassigning ownership or sequencing the work. This works even if the Leader is not paying attention.

---

## 8. Git Integration

Git is built in:

### 8.1 Always on

- **Commit attribution:** every commit is tagged with the member who made it, so history shows who planned, wrote, and reviewed.
- **Approval rules:** no member can push, force-push, or merge without the user's confirmation. The user can loosen this per member.

### 8.2 Optional (setting)

- **Branches or worktrees per member:** each member works on its own branch in its own working folder, and the Leader merges after review.

### 8.3 Without Git

- Projects that are not Git repositories still work through checkpoints. The app offers to initialize a repository.

---

## 9. User Interface

The user does not need to choose a layout. The default is a clean chat-style view, with raw terminals one click away. All conversations should appear in a neat, attractive, and user-friendly way.

### 9.1 Main elements

- **Team conversation feed (main area):**
  - Every message shows the member's name, color, and role, for example "Claude → OpenCode: write the login page".
  - File edits, commands, and test results appear as compact cards that expand for details.
- **Member bar:** a strip showing each member with a live status (working, waiting, idle, needs approval, failed).
- **Member terminals:**
  - Each CLI member gets a **real terminal inside the app**, showing exactly what the user would see in the Windows terminal: the CLI's own interface, tool calls, and approval prompts.
  - The user can type directly into any member's terminal.
  - A toggle switches between **focus view** (one terminal) and **grid view** (all terminals side by side).
  - API members have no native terminal, so they get a matching pane for consistency.
- **Approvals:** all approvals happen **inside the app**. A badge appears on the member and a card appears in the feed.
- **Message box:** at the bottom, with a target selector: Leader (default), all models, or one specific member.

### 9.2 Technical note

- The Leader sends tasks into each CLI and reads results back through the TIYE Harness (Section 6.7).

### 9.3 Code viewing

- Code and file changes are **displayed inside the application**, so the user does not need an external editor to review work.
- Changes are shown with the member who made them (Section 8), and can be compared across checkpoints (Section 11).
- **Display only:** the app shows files and changes for review. Editing happens through the members or in an external editor, not inside the app.

---

## 10. History, Saving, and Search

**Everything is saved**, per project, so the user can close the app and resume exactly where they stopped.

### 10.1 What is saved

- **Team setup:** members, roles, connections, permissions.
- **Conversation:** the full team feed, including every delegation and report.
- **Terminals:** each member's terminal output.
- **Actions:** file edits, commands, approvals, test results.

### 10.2 Search

- All of it is searchable, for example "when did the reviewer reject the login page?"

### 10.3 Resuming CLI sessions

- A CLI can continue its own internal session only if it supports resuming.
- TIYE Agent keeps its own complete record either way and can re-brief a member with what happened.

---

## 11. Checkpoints and Restore

- A **register** records every change.
- **Checkpoints:** the app saves a restore point automatically at each meaningful step, such as after each member finishes a task.
- **Restore:** the user can roll the project files back to any point, for example "before the reviewer's last fix". Conversation history stays, and the rollback is logged as an event.
- **Leader notification:** the Leader is told about a rollback so it does not work from an outdated picture of the code.
- Checkpoints are the quick in-session undo. Git is the permanent project history.

---

## 12. Failure Handling

The process **never stops** because of a failure.

### 12.1 Member failure

A member can crash, hit a rate limit, lose its connection, or run out of credits. Two things happen at once:

- **Alert to the user:** the member's status turns to failed, with the reason and a notice in the feed.
- **Leader takes over:** the Leader is told which member failed and which task was interrupted. It completes the work itself or hands it to another capable member.
- The failed member's partial work stays recorded.
- The user can retry or reconnect the member later, and the Leader is told when it is back.

### 12.2 Leader failure

- The process continues. The app **automatically promotes a successor**, and the user is alerted at the same time.
- **Succession order:** set by the user in team setup (for example 1. OpenCode, 2. GPT). If unset, the app picks the next member that can coordinate.
- **Handover:** the interim Leader receives the full conversation, the team briefing, and the interrupted task.
- **Feed notice:** a card such as "Claude failed, GPT is now interim leader", and every member is told who the new Leader is.
- **Recovery:** when the original Leader returns, the user chooses whether to hand leadership back. The app never switches on its own.

### 12.3 App crash recovery

- If TIYE Agent itself closes unexpectedly, the app **recovers the session** on the next launch: team setup, conversation, terminals, actions, and checkpoints are restored from the saved record (Section 10).
- Members are re-briefed on what happened so work can continue.

---

## 13. Cost and Usage

- TIYE Agent **does not sell or resell model access**. All costs are paid by the user directly to each company through their own subscriptions, API keys, or CLI logins.
- **No billing system:** no credits, wallet, or payments inside the app.
- **Usage display is informational only.** Where a provider or CLI exposes usage, the app shows it per member (for example "Claude: 40% of limit used"). Where it cannot, it shows nothing. The app never shows a price of its own.
- A subscription limit being hit counts as a member failure (Section 12).

---

## 14. Privacy and Security (Local-First)

Local-first is the product's trust promise.

- **No TIYE account** is required.
- **Local storage:** API keys are stored encrypted in the system's secure storage. History, checkpoints, and terminal logs stay on the user's device.
- **Minimal TIYE server contact:** only two kinds, and nothing else:
  1. **License and limit check** when a session's first task is sent (Section 1.3).
  2. **Update check** (Section 20.2).
- **What is sent:** the license key (a random anonymous ID for Free users) and the session count. **Never** project data, conversations, files, prompts, or usage details.
- **No telemetry:** no analytics and no tracking. Everything else goes only from the user's device to the providers the user chose.
- **Offline allowance:** without internet, the app allows a small number of sessions and syncs the count later, so users are never blocked.
- **No cloud sync.** Moving a project's history to another device is a manual export and import.

---

## 15. Roles, Skills, MCP, and Plugins

These four are part of the core product, with **a huge amount of customization** throughout.

### 15.1 Roles

- A reusable library. A role bundles instructions, default permissions, skills, and tools.
- Built-in roles for juniors, and custom roles for everyone.

### 15.2 Skills

- Instruction packs a member loads when relevant (for example "write tests in our style").
- Assigned per member or per role.

### 15.3 MCP

- MCP servers are configured **per member** (for example only the researcher gets web search).
- For CLI members, the CLI's own MCP support does the work, and TIYE Agent passes the setup through where the CLI allows it.

### 15.4 Plugins

- Extend the app itself: new providers, panels, tools, themes.
- A plugin can bundle roles, skills, and MCP servers together.

### 15.5 Customization scope

- Themes, layout, shortcuts, per-member behavior, and the Leader's delegation rules and prompts.
- Everything is editable, with sensible defaults so juniors never need to touch it.

### 15.6 Installing additions

Installation is open, with no required store:

- **Link:** a URL such as a GitHub repository or a direct file link.
- **Local file or folder:** picked from the device or dragged into the app.
- **Manual creation:** built directly inside the app.
- **Import and export:** roles, skills, and whole team presets can be shared as a single file.
- A community directory could be added later as one more source, but is never required.

**Trust safeguard:** because plugins can run code, the app shows where an addition came from and what it can access (files, terminal, network) before installation. The user confirms, and nothing runs automatically.

### 15.7 Applying to all members

- The user can assign **any skill, role, or MCP server to all members at once**, in addition to assigning them per member.
- This also covers shared project-wide guidance: a skill assigned to every member works as common instructions for the whole team.

---

## 16. Team Presets

Both options are available:

- **Ready-made presets:** built-in teams such as Leader + Coder + Reviewer, aimed at juniors.
- **Custom presets:** save any team setup (members, roles, permissions, succession order) and reuse it in one click, or start from a blank team.
- Any preset can be edited after loading. Changes affect only that project unless the user saves them back to the preset.

---

## 17. Parallel Sessions

- **Several teams run in parallel**, each in its own tab with its own members, transcript, checkpoints, and permissions. They never mix.
- **Notifications:** a background team sends a Windows notification when it finishes, fails, or needs approval. Clicking it opens that tab.
- **Same project, multiple sessions:** file protection works across sessions. Worktrees make this safe by default.
- **Shared limits:** teams using the same subscription share its limit, and the app shows a warning.
- **Machine load:** each CLI member is a running process. The app shows each tab's activity so the user can pause or close heavy ones.

---

## 18. First-Run Experience

A guided first launch, which professionals can skip:

1. **Detect:** the app scans the device for installed CLIs (Claude Code, Codex, Gemini CLI, OpenCode) and lists what it found.
2. **Suggest:** it proposes a ready-made team from those tools. If only one CLI is found, it offers a single-member team. If none are found, it explains how to add an API key.
3. **Start:** the user picks a project folder and sends their first task.

The scan happens only on the user's device and sends nothing anywhere.

---

## 19. Languages

### 19.1 Supported interface languages

English, Arabic, French, German, Japanese, Korean, and Chinese.

### 19.2 Details

- **Arabic:** the whole layout mirrors to right-to-left. Code, file paths, and terminals stay left-to-right.
- **Chinese, Japanese, Korean:** proper fonts and input methods are required, and terminals must handle wide characters correctly.
- **Interface language vs. model language:** these are separate. The Leader can be told to reply in the user's language, and role instructions can be written in any language.
- **Switching:** language can be changed anytime without restarting.
- **More languages:** since plugins are open, the community can add translations.
- **Chinese variants:** Simplified first, with Traditional as an added pack.

---

## 20. Platforms and Updates

### 20.1 Platforms

- **Initially Windows.** macOS and Linux will follow.
- Platform-specific parts (terminal handling, secure key storage, CLI launching) should be kept separate from the start to make later ports easier.

### 20.2 Updates

- The app checks for new versions and **asks before installing**. Nothing installs silently.
- Every plan, including Free, is notified when an update is available (Section 1.3).
- The update check is one of the two kinds of TIYE server contact (Section 14).

---

## 21. Summary of Decisions

| Area | Decision |
|---|---|
| Product scope | Complete from the first release |
| Platform | Windows first, others later |
| Team size | 1 to 5 members |
| Roles | User-defined, any role |
| Leader | User-designated, coordinates the team |
| Communication | Hub-and-spoke through the Leader |
| User control | Stop, message Leader, all, or any single member |
| Visibility | User sees everything |
| Model context | Per-member setting, default full transcript |
| Permissions | Fully customizable per member |
| Connection types | Login, API (any binding method), CLI |
| CLI handling | User installs it, app detects, launches, and shows a real terminal |
| Harness | Purpose-built TIYE Harness handles CLI control and login access |
| Delegation | Leader can assign tasks to several members at the same time |
| Busy members | Messages wait until the member finishes its current task |
| Long sessions | Automatic summarization at 70% of a model's context |
| Shared setup | Skills, roles, and MCP can be assigned to all members at once |
| Code viewing | Files and changes are displayed inside the app (view only) |
| App crash | Session is recovered on the next launch |
| Business model | Paid, usage-based plans: Free, Weekly, Monthly, Annual (Section 1.3) |
| Limit enforcement | Minimal server check of license key and session count, with offline allowance |
| Server contact | Only license and limit check, and update check. No project data, no telemetry |
| File safety | Leader assigns ownership plus app-level blocking |
| Git | Built in, attribution and approvals always on |
| History | Everything saved and searchable |
| Restore | Automatic checkpoints plus rollback |
| Failures | Alert user, Leader takes over, successor if Leader fails |
| Cost | Paid by the user to providers, no billing in the app |
| Privacy | Local-first, no account, no telemetry |
| Extensions | Roles, Skills, MCP, Plugins, open installation |
| Presets | Ready-made and custom |
| Parallel teams | Supported, one tab per team |
| First launch | Guided, skippable |
| Languages | 7 interface languages including Arabic RTL |

---

## 22. Confirmed Assumptions and Open Items

**Confirmed assumptions:**

1. "Notator" means a member that documents what was done.
2. The Leader is informed whenever the user messages another member directly.
3. Plugins and other additions show their origin and access, and need user confirmation before installing.
4. Chinese ships as Simplified first, with Traditional as an add-on.
5. Updates are checked automatically but only installed after the user approves.
6. The informational "review round" indicator is included, as an optional setting that never stops anything automatically.

**Confirmed decisions (second round):**

1. The Leader can assign tasks to more than one member at once (Section 2.6).
2. A message to a busy member waits until it finishes its current task (Section 3.2).
3. Older context is summarized automatically at 70% of a model's window (Section 4.3).
4. Skills, roles, and MCP can be assigned to all members (Section 15.7).
5. Code and changes are displayed inside the app (Section 9.3).
6. The app recovers the session after a crash (Section 12.3).
7. TIYE Agent is a paid application with four usage-based plans: Free, Weekly, Monthly, Annual (Section 1.3).
8. One "project" in the plan limits means one team session (Section 1.3).
9. Counting rules: a session counts when the first task is sent, and resuming or crash recovery does not use new quota (Section 1.3).
10. All plans, including Free, are notified of available updates (Section 1.3, Section 20.2).
11. The harness responsibilities in Section 6.7.2 are confirmed.
12. Limits are enforced by a minimal server check of license key and session count, with an offline allowance (Sections 1.3 and 14).

**Interpretations to confirm:**

- "Map" is read as **MCP**.
- "Summons" is read as **recovers** (crash recovery).
- The 70% rule is read as: when a model's context reaches 70% of its window, older parts are summarized.
- CLI members manage their own context, so the 70% rule may apply only where the app controls the context (for example API members). To settle at the architecture stage.

**Questions deferred to the architecture stage:**

1. The harness design: its structure, its interface to the app, and how it controls each CLI.
2. How the harness handles subscription logins for each provider.
3. Which CLIs support resuming sessions, passing permissions, and passing MCP setup at launch.
4. How to detect and run CLIs across native Windows and WSL.
5. How to attribute commits and file changes when a CLI makes edits on its own.
6. Plugin sandboxing and the security model for code that runs on the user's machine.
7. The size of the offline allowance, and how license keys are issued and renewed with the payment provider.
8. How the anonymous ID for Free users is generated and stored.

---

## 23. Next Step

Review this document, correct anything that is wrong, and fill the open items. Once the idea is confirmed complete, we move to **architecture**.
