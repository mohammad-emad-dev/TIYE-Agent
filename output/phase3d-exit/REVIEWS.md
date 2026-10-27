# Independent review and parent disposition

The Codex and OpenCode delegate skills ran read-only, with relevant source and
the new cases embedded, no tools/edits/execution/commit requested. Touched-file
lists reflected pre-existing parent changes. delegates.json retains exact relay
statuses, reports and local raw-result hashes.

Luna/max completed: it identified that if an arbitrary adapter.stop promise
rejects, the loop stop/dispose path would skip finish/draining. This conditional
concern is valid for such an adapter. Parent inspected the actual fixed factory,
ScriptedAdapter.stop/cleanup/finish/emit and scripted abort paths. Factory entry
points accept no supplied adapter or transport. The supported cleanup catches
script abort throws, bounds unknown closure, resolves owned result promises and
isolates observer exceptions/rejections. Its terminal notification has no user
completion hook. The reviewed bounded notification counts do not reach the
queue guard. No supported rejecting-stop path was found in this composition.

Disposition: no production change or invented adapter stub in this exit slice.
The concern is retained as an admission requirement for future provider/generic
adapters: define stop rejection and drain/uncertainty handling, then qualify it.
This is a scope/reachability disposition, not a claim that the loop already
handles every rejecting adapter. The normal resume/stop and disposal ordering
was considered sound by Luna under the supplied assumptions.

Flint timed out at 30 seconds and DeepSeek/max at 60 seconds without reports.
Neither supplies a verdict. Parent independently reviewed the complete bridge,
codec, fixture and pump, and ran source-bound native gates. The two added tests
use real core answers/stores, restore/dispose owned resources, assert outside
isolated callbacks and reopen/replay actual state. Existing overrun cases retain
their conservative uncertainty expectations; no operation deadline is extended.
