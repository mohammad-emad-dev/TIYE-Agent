# Next slice: bounded API loop with a read-only core tool

27 October 2026 — proposal only; owner construction decision pending.

The [Phase3A exit](../phase3a-exit/README.md) accepted the offline adapter with273
passing tests. The next milestone runs an entire bounded conversation cycle:
one scripted response requests get_my_context, a trusted bridge reads the bound
member's existing core profile, the loop submits the structured result in a new
request, and a later response finishes the conversation.

Review [AMENDMENT.md](AMENDMENT.md) and [CONTRACT.md](CONTRACT.md). A private loop
package and a narrowly enabled adapter profile can implement this path while
preserving the existing text-only adapter. Core and mock-team stay unchanged.
The only tool is read-only; it cannot claim/report a task, ask a question, delegate,
complete a mission or execute a file/command action. Conversation completion is
distinct from task completion, and local scripted closure proves no remote stop.

This proposal changes no accepted source, runtime, permission or test result.
Construction requires the owner decision on the frozen proposal and parent
review/preflight of actual source before execution. Real SDK/HTTPS/credentials,
provider-specific formats, MCP, mutating tools, durable loop recovery, automatic
retry, UI and release remain outside this slice.
