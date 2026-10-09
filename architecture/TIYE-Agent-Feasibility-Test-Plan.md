# TIYE Agent: Feasibility Test Plan

| | |
|---|---|
| **Product** | TIYE Agent |
| **Document** | Step-by-step plan for the six feasibility tests (S1 to S6) from the Architecture, Section 11 |
| **Who runs it** | A developer on a Windows machine with the CLIs installed and logged in |
| **Output** | A result report per test, updated capability data for each CLI, and a list of architecture changes |
| **Date** | October 2026 |

---

# Part A. Before You Start

## A1. Purpose

The architecture rests on a few assumptions about how real tools behave. These tests check each assumption cheaply, before any product code is written. Every test ends with a **pass, partial, or fail** result and a defined next action, so the architecture is adjusted with evidence.

| Test | Question it answers | Architecture section |
|---|---|---|
| **S1** | Does the display channel work? A real CLI inside Electron, in a pseudo-terminal | 5.2 |
| **S2** | Does the control channel work? Tasks go in and results come back through team tools | 4.2, 5.2 |
| **S3** | Is worktree isolation practical? | 6 |
| **S4** | Which providers can be login members, and how? | 5.4 |
| **S5** | Does the UI stay responsive with five active members? | 9 |
| **S6** | Does everything work through WSL? | 5.2 |

## A2. Recommended order

```
S1 ──► S2 ──► S5
        │
        ├──► S3
        │
        └──► S6

S4 runs in parallel from the start
```

- **S1 first:** every other test needs a CLI running in a pseudo-terminal.
- **S2 second:** it is the biggest unknown, and the one the product depends on most.
- **S3, S5, and S6** can run in any order after S2.
- **S4** needs no code and can run in parallel from day one.

## A3. Environment checklist

| Item | Requirement | Done |
|---|---|---|
| Windows | Windows 10 version 1809 or later, or Windows 11 (the pseudo-terminal API needs this). Test on both if possible. | ☐ |
| Node.js | A current long-term-support version | ☐ |
| Electron | The version planned for the product | ☐ |
| Native build tools | The tools needed to build node-pty and better-sqlite3 for Electron | ☐ |
| Git | Installed, with worktree support | ☐ |
| WSL | WSL 2 with one Linux distribution (needed for S6) | ☐ |
| CLIs | Claude Code, Codex, Gemini CLI, and OpenCode installed and logged in, with their versions written down | ☐ |
| Accounts | At least one subscription login and one API key per provider, for S4 | ☐ |
| Test machine | A clean Windows user profile, so results are not affected by old settings | ☐ |

Record the exact **version of every tool** used. CLIs change often, and results are only valid for the versions tested.

## A4. The test project

Use one small, known repository for every test, so results are comparable.

| Part | Content |
|---|---|
| Language | Any one that needs a dependency install step (for example Node with a test runner) |
| Size | A few files, a package manifest, and a small set of tests |
| State | A clean Git repository with at least one commit |
| Standard tasks | **T1:** add a small function with a test. **T2:** fix a failing test. **T3:** review a given diff and return a verdict. |
| Local files | One untracked local settings file, to test copying (S3) |

## A5. Mock tools to build

| Tool | Purpose | Used in |
|---|---|---|
| **Minimal Electron shell** | One window with xterm.js connected to a node-pty process | S1, S5 |
| **Minimal team tools server** | A small MCP server with the tools `report_result`, `ask_leader`, and `delegate_task`, which log every call | S2 |
| **Mock CLI** | A scripted program that can print fast, hang, crash, ask for approval, or print a rate-limit message | S5 and later contract tests |

## A6. Scoring and evidence

| Result | Meaning |
|---|---|
| **Pass** | Works as the architecture assumes. |
| **Partial** | Works with a limitation or a workaround. Write down exactly what. |
| **Fail** | Does not work. Follow the fallback in the test. |

For every test, keep:

1. A short screen recording of the key steps.
2. The raw logs (terminal output, tool-call log).
3. The tool versions.
4. The filled result table from Part C.

---

# Part B. The Tests

## S1. Display channel

**Objective:** confirm that each CLI runs correctly inside Electron, in a real pseudo-terminal, exactly as in the Windows terminal.

**Setup:** the minimal Electron shell from A5. Repeat for each CLI.

| Step | Action | Observe |
|---|---|---|
| 1 | Launch the CLI in the test project folder through node-pty. | Does it start without errors? |
| 2 | Compare its interface with the same CLI in the Windows terminal. | Colors, layout, spinners, and boxes match? |
| 3 | Type a prompt and press Enter. | Input works, including editing keys and history. |
| 4 | Trigger a permission prompt (ask it to edit a file). | The prompt displays and accepts an answer. |
| 5 | Resize the window and the terminal. | The layout re-flows correctly. |
| 6 | Paste a multi-line message. | It arrives intact. |
| 7 | Press Ctrl+C during work. | The CLI is interrupted as it would be normally. |
| 8 | Type text with Arabic, Chinese, Japanese, and Korean characters. | Characters display and are not corrupted. |
| 9 | Close the window while the CLI runs. | Is the process tree cleaned up, with no orphan processes? |

**Pass criteria:**
- Steps 1 to 7 behave identically to the Windows terminal.
- No orphan processes after step 9.
- Step 8 shows wide characters correctly (right-to-left shaping inside the terminal is not required).

**If it fails:** record the exact difference. Try an alternative terminal setting (for example a different color or terminal-type setting) before concluding. If a specific CLI cannot run reliably, it stays unsupported until its adapter is fixed, and the product still works with the others.

---

## S2. Control channel

**Objective:** confirm that the engine can delegate a task to a CLI member and receive its result reliably through the team tools.

**Setup:** S1 shell, plus the minimal team tools server from A5, running on the loopback interface with a separate access token per test member. Repeat for each CLI.

### S2.1 Attaching the tools

| Step | Action | Observe |
|---|---|---|
| 1 | Find how this CLI accepts an MCP server (a launch option, a config file, or a command). | Write down the exact method. |
| 2 | Attach the team tools server at launch, without touching the user's global configuration if possible. | Does the CLI list the tools? |
| 3 | Check whether it works over a local network connection, or needs a stdio bridge. | Write down which. |
| 4 | Check that the member's access token is sent, so the server knows who is calling. | The log shows the right member. |

**Pass criteria:** the tools attach at launch, without permanently changing the user's configuration, and each call is attributed to the right member.

### S2.2 Task round trip

| Step | Action | Observe |
|---|---|---|
| 1 | Type task **T1** into the terminal, with an instruction to finish by calling `report_result`. | The CLI starts working. |
| 2 | Wait for completion. | Did it call `report_result` with a sensible summary? |
| 3 | Repeat 10 times with the same wording. | Count the successful reports. |
| 4 | Try 3 different instruction wordings. | Which wording is most reliable? |
| 5 | Give a task that needs a question. | Does it call `ask_leader`? |
| 6 | Give a task and then do nothing. | Does it ever finish without reporting? |

**Initial thresholds (adjust after the first measurements):**
- At least **9 of 10** runs report correctly without help.
- With one automatic nudge, **10 of 10** report.
- The CLI uses `ask_leader` when instructed.

### S2.3 Briefing delivery

| Step | Action | Observe |
|---|---|---|
| 1 | Check whether the CLI has a launch option or an instruction mechanism for a role briefing. | Write down the exact method. |
| 2 | Otherwise deliver the briefing as the first typed message. | Does the CLI keep to its role in later tasks? |
| 3 | Ask it who is on the team and what its role is. | The answer matches the briefing. |

### S2.4 Permissions at launch

| Step | Action | Observe |
|---|---|---|
| 1 | List every permission option the CLI has at launch (file access, commands, approval behavior). | Write them all down. |
| 2 | Launch with a read-only setup. Ask it to edit a file. | Is the edit refused or asked? |
| 3 | Launch with "ask before each command". | Does it ask? |
| 4 | Launch with the most permissive setup. | Does it act freely? |
| 5 | Map each option to the product's settings: file access (none, read-only, read and edit) and terminal (off, ask, auto). | Mark which settings this CLI supports and which it cannot. |

The result tells the product exactly which permission options to offer for this CLI.

### S2.5 Approval, errors, and recovery signals

| Check | How to test | Record |
|---|---|---|
| **Approval prompt** | Trigger one. | A hook, or an output pattern, that identifies it |
| **Authentication failure** | Log out, or use an invalid key. | The exact output and exit behavior |
| **Network loss** | Disconnect the network during a task. | The exact output and exit behavior |
| **Rate limit** | Capture the real message if one occurs, or find it in the CLI's documentation. | The output pattern |
| **Crash** | Kill the CLI process. | The exit code and what the shell sees |
| **Hang** | Suspend the process. | How long until activity stops |
| **Resume** | Close and relaunch with the CLI's own resume feature, if it has one. | Does it keep its context? |

**Fallbacks if S2 fails for a CLI:**

| Problem | Fallback |
|---|---|
| The CLI cannot attach MCP tools | Use its non-interactive or structured-output mode, if it has one, for control, and keep the pseudo-terminal for display. |
| The CLI rarely calls `report_result` | Tune the instruction wording per CLI. If still unreliable, detect completion from the CLI's own hook or idle signal, and mark results as "reported by the app" in the feed. |
| No usable control at all | The CLI is offered as a **display-only member** that the user drives directly, and cannot be a Leader or a delegated worker. |

---

## S3. Worktree isolation, Git, and checkpoints

**Objective:** confirm that giving each editing member its own Git worktree is practical on Windows, and that attribution, push blocking, and checkpoints work.

**Setup:** the test project (A4), Git, and each CLI.

### S3.1 Worktree basics

| Step | Action | Observe |
|---|---|---|
| 1 | Create an integration branch and worktree, then one worktree per member, outside the project folder. | Creation time, and that the user's own folder is unchanged. |
| 2 | Run the project's setup command (for example a dependency install) in a new worktree. | Time taken and disk used. |
| 3 | Repeat with a shared-dependency variant (for example a directory link, or a shared package store). | Time, disk, and any problems when a member installs a new package. |
| 4 | Copy the untracked local settings file into the worktree. | The file arrives and the project runs. |
| 5 | Make two members edit **different files** in parallel, then merge both into integration. | A clean merge. |
| 6 | Make two members edit the **same file**, then merge. | The conflict is detected, and the conflicting files can be listed automatically. |
| 7 | Remove a worktree after merge. | Clean removal, with no leftovers. |

**Pass criteria:** steps 1 to 7 work. Record the setup time. Initial target: **under 60 seconds** for the small test project, to be revisited on larger real projects.

### S3.2 Attribution

| Step | Action | Observe |
|---|---|---|
| 1 | Launch each CLI with the Git author and committer set through environment variables. | Does it keep them? |
| 2 | Ask the CLI to commit its work. | Does `git log` show the right author? |
| 3 | Check whether the CLI adds its own author name or extra trailers. | Record exactly what it adds. |

**If a CLI overrides the author:** the engine rewrites the commit's author after the task ends, or commits the work itself on the member's behalf.

### S3.3 Push blocking

| Step | Action | Observe |
|---|---|---|
| 1 | Enable per-worktree configuration, then set a per-worktree hooks folder containing a hook that refuses pushes. | The setting applies only to that worktree. |
| 2 | Ask the CLI to push. | The push is refused, and the CLI reports it sensibly. |
| 3 | Check whether the CLI can bypass the hook (for example with a skip-hooks option). | Record the result. |

Hooks can be bypassed by anyone who passes a skip option, so this is a best-effort layer alongside the CLI's own permission settings (Architecture 6.6).

### S3.4 Ownership watcher

| Step | Action | Observe |
|---|---|---|
| 1 | Watch a worktree with a file watcher on Windows. | Do changes arrive reliably, including bursts from a CLI? |
| 2 | Make a CLI edit a file outside its assigned area. | Detected within a short time? |
| 3 | Revert the change from the engine. | Reverts only that change. |

### S3.5 Checkpoints

| Step | Action | Observe |
|---|---|---|
| 1 | Create a snapshot of a worktree using a temporary index, and store it under a hidden reference. | The user's branch, index, and status are unchanged. |
| 2 | Edit files, then restore the snapshot. | Files return to the snapshot state. Ignored files (like dependencies) are not affected. |
| 3 | Measure snapshot and restore time on the test project. | Record both. |
| 4 | Repeat on a folder with **no Git** using a separate Git directory. | Same results, and the folder gains no Git files. |

### S3.6 Final merge

| Step | Action | Observe |
|---|---|---|
| 1 | Merge integration into the user's branch with a clean working tree. | Works. |
| 2 | Try again with uncommitted changes in the user's folder. | The engine refuses and offers to leave the result on its branch. |

### S3.7 Windows specifics

Check these along the way and write down any problem: very long paths, antivirus scanning slowing creation, line endings, case-insensitive file names, and file locks that block removal.

**Fallbacks if S3 shows a serious problem:**

| Problem | Fallback |
|---|---|
| Setup is too slow or large | Make shared dependencies the default, or offer a lighter mode with fewer worktrees (only members that edit at the same time). |
| A CLI overrides authors | Engine-side commit rewrite. |
| File watching is unreliable | Poll changed files at task end and at intervals. |
| Worktrees are impractical for a project type | Offer shared-folder mode (Architecture 6.10). |

---

## S4. Login access per provider

**Objective:** find out, for each provider, whether and how a subscription can be used as a login member, within the provider's rules.

**Principles for this test:**
- The test follows each provider's **current published terms**. It never extracts, copies, or reuses tokens from a vendor's tool, and never bypasses a restriction.
- TIYE Agent should only use access methods the provider permits.

| Step | Action | Record |
|---|---|---|
| 1 | Read the provider's current terms and usage policy for third-party applications and automated use of subscriptions. | The link, the date read, and what applies |
| 2 | Check whether the provider's **own CLI** supports subscription login. | Yes or no, and how login works |
| 3 | Check whether that CLI can be driven by another program (non-interactive or scripted use) under the subscription. | Allowed, restricted, or not allowed |
| 4 | Check whether the provider offers an **official** way for third-party apps to use a subscription. | The method, if any |
| 5 | Check the API-key route, including any free or low-cost tier. | Availability and limits |
| 6 | Classify the provider using the table below. | The class |

| Class | Meaning | Product behavior |
|---|---|---|
| **A** | The provider's own CLI supports subscription login | A **CLI member**. The user logs in inside the CLI. TIYE Agent never handles the credentials. |
| **B** | An official third-party login exists | A **login member** through that official method |
| **C** | Only an API key is allowed | An **API member** |
| **D** | Not allowed or unclear | Not offered as a login member, and the user is told why |

Providers to cover: Anthropic, OpenAI, Google, and the providers behind OpenCode, plus any others the team wants to support at launch.

**Before release:** terms change, so have someone with legal competence confirm the final classification, and re-check it periodically. The classification belongs in the capability data so it can be updated.

---

## S5. Performance with five active members

**Objective:** confirm that the UI stays responsive, and no output is lost, with five members streaming at once.

**Setup:** the minimal Electron shell extended to five terminals, and the mock CLI from A5.

| Scenario | Description |
|---|---|
| **A. Normal** | Five members with realistic, moderate output. |
| **B. Flood** | Each member prints large volumes continuously for 60 seconds. |
| **C. Rich output** | Heavy color codes, cursor movement, and spinners, as real CLIs produce. |
| **D. Long run** | About an hour of mixed activity, with tens of thousands of feed events. |
| **E. Views** | Compare grid view (five visible terminals) with focus view (one visible, four hidden). |
| **F. Search** | Search the large log built in scenario D. |

**Measure:**

| Metric | How |
|---|---|
| Interface smoothness | Frame rate and long-frame count from the developer tools |
| Input delay | Time from a key press to its display in a terminal |
| Processor and memory | For the UI, main, core, and each pseudo-terminal process, over time |
| Output integrity | Compare bytes sent by the mock CLI with bytes displayed and stored (checksums) |
| Feed speed | Scroll smoothness at large event counts |
| Search speed | Time to results on the large log |
| Memory over time | Does memory settle after a flood, or keep growing? |

**Initial thresholds (adjust after the first measurements):**

| Metric | Target |
|---|---|
| Input delay during a flood | Under 100 ms |
| UI freezes | None longer than 500 ms |
| Output integrity | 100% of output stored, with no loss |
| Memory after a flood | Settles, with no steady growth |
| Search on the large log | Results within a couple of seconds |

**If it falls short:** tune flow control (pause a pseudo-terminal when its display falls behind), batch writes harder, lower the number of live terminals in grid view, or render hidden terminals only when shown.

---

## S6. WSL

**Objective:** confirm that CLIs installed inside WSL work as members.

| Step | Action | Observe |
|---|---|---|
| 1 | Detect WSL and its distributions from the app side. | The list is retrieved. |
| 2 | Detect each CLI inside a distribution, with its version. | Detection works. |
| 3 | Launch a CLI through `wsl.exe` inside the pseudo-terminal. | Display and input match S1. |
| 4 | Run the CLI in a worktree stored on the **Windows file system**, then on the **Linux file system**. | Speed of Git and installs in each case, and any path problems. |
| 5 | Translate paths between Windows and Linux forms for tasks and ownership. | Translation is correct. |
| 6 | Connect from inside WSL to the team tools server running on Windows. | Does the loopback address work? Try each WSL networking mode that is available. |
| 7 | Pass environment variables, such as the Git author, into WSL. | They arrive. |
| 8 | Close the app, and kill the process. | No orphan processes inside WSL. |
| 9 | Create a worktree with Windows Git, then use it from WSL Git, and the reverse. | Do the two sides understand each other's worktree files? |

**Points to watch:** worktree bookkeeping files store absolute paths, which differ between Windows and Linux. If the two sides cannot share them, the product needs a rule that **all Git operations for one project run on one side**.

**If step 6 fails:** use a small bridge process inside WSL that forwards tool calls to the core through a pipe, or listen on an interface reachable from WSL with the per-member token.

---

# Part C. Result Forms

## C1. Per-test result form

Copy this for each test and each CLI.

| Field | Entry |
|---|---|
| Test and CLI | |
| Tool versions (Windows, Electron, CLI, Git) | |
| Result | Pass / Partial / Fail |
| What worked | |
| What did not | |
| Workaround used | |
| Measurements | |
| Evidence (recording, logs) | |
| Architecture impact | |

## C2. Per-CLI summary matrix

Fill one column per CLI after the tests.

| Item | Claude Code | Codex | Gemini CLI | OpenCode |
|---|---|---|---|---|
| Version tested | | | | |
| S1 display | | | | |
| S2 how tools attach | | | | |
| S2 reliability (of 10) | | | | |
| S2 briefing method | | | | |
| S2 permission options available | | | | |
| S2 approval detection | | | | |
| S2 error patterns | | | | |
| S2 resume support | | | | |
| S3 author kept | | | | |
| S3 push blocked | | | | |
| S4 login class (A to D) | | | | |
| S6 through WSL | | | | |

## C3. Capability data template

The results become the data file for each CLI (Architecture 5.5):

```json
{
  "id": "example-cli",
  "displayName": "Example CLI",
  "testedVersions": ["x.y.z"],
  "detection": { "command": "example", "versionPattern": "..." },
  "environments": ["windows", "wsl"],
  "launch": {
    "workingFolder": "...",
    "instructions": "option or first-message",
    "permissions": {
      "fileAccess": ["none", "readOnly", "readWrite"],
      "terminal": ["off", "ask", "auto"]
    }
  },
  "teamTools": { "attach": "launch-option | config | bridge", "transport": "http | stdio" },
  "resume": { "supported": true, "method": "..." },
  "approvals": { "detect": "hook | pattern", "pattern": "..." },
  "errors": { "rateLimit": "...", "auth": "...", "network": "..." },
  "login": { "class": "A" }
}
```

---

# Part D. Decisions After the Tests

## D1. Decision gates

| Finding | Architecture action |
|---|---|
| S1 passes for a CLI | The CLI is supported as a member. |
| S1 fails for a CLI | The CLI is not supported until its adapter is fixed. |
| S2 passes | Keep the control channel as designed (Architecture 5.2). |
| S2 partial | Add the CLI-specific instruction wording and the nudge, and keep the "needs attention" state. |
| S2 fails | Use the fallbacks in S2, down to display-only members. |
| S3 passes | Worktrees stay the default (Architecture 6.1). |
| S3 slow or heavy | Make shared dependencies the default, or offer the lighter mode. |
| S4 gives class D for a provider | Remove it from login members and keep the CLI or API route. |
| S5 passes | Keep the UI design (Architecture 9). |
| S5 falls short | Apply the tuning steps and re-test. |
| S6 shows path or worktree problems | Add the "one side per project" rule and the bridge, and document WSL limits. |

## D2. Deliverables

| # | Deliverable |
|---|---|
| 1 | A result form (C1) for every test and every CLI |
| 2 | The summary matrix (C2) |
| 3 | A capability data file (C3) for each supported CLI |
| 4 | The minimal team tools server and the mock CLI, kept for the later contract tests (Architecture 10.3) |
| 5 | A short list of changes to the Architecture, applied to that document |

## D3. What happens next

1. Update the Architecture with the findings.
2. Start build Phase 1: the core service and the event store (Architecture 11.2).
