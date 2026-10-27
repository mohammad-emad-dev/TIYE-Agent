# Independent and parent reviews

All three requested models were dispatched read-only with focused source text
embedded in their briefs, without requiring shell access. GPT-6 Luna max completed
its worker/protocol review and reported no additional actionable findings beyond
the parent's stop-plus-invoke issue. Flint40B Free and DeepSeekV4.1 Flash Free max
each timed out after60 seconds without a final verdict. Those timeouts are not
approvals. No delegate changed files. `delegates.json` binds the raw result hashes.

The parent reviewed the complete package, actual tests and approved contract,
including ownership, claim/send ordering, full transcript validation, post-exit
independent witness, storage-failure fencing and current-handle cleanup. The
previous223-test record remains immutable. The stop bug was reproduced against
the original source with an actual child and independent proof1, then fixed with
guards in the worker's frame and invocation handlers. The final regression expects
proof0 and nonzero exit; duplicate invocation remains one append, never hidden by
deduplication. No controller resend or new executable fallback was introduced.

The new test temporarily cancels the scheduled controller callback and explicitly
claims through the real approved core before writing reviewed fault frames into
one owned pipe. It reuses the existing fixed launcher and verified lifecycle;
there are no fake stores/processes, arbitrary scripts or leaked workers. The
parent's final source review is bound to the final preflight before execution.

The first complete228-test run had227 passes and one failure: the new core-path
test expected target-version refusal, but the active core SQLite lease refused
the database open first. No child launched. Registration now compares the supplied
root's identity with the core root before opening any witness database and checks
that original root again after witness validation. The test asserts the explicit
core-path refusal. `attempts.json` preserves the failed capture's hashes/counts;
`red-exit-source.txt` preserves the exact original regression test bytes used for
the earlier stop-bug reproduction. The original223 tests and four wire regressions
passed in this first full run; a fresh full capture follows the ordering fix.

The next run had five concurrent deadline overruns around584 seconds, including
unchanged baseline tests. Windows logged sleep/resume during that run; safe event
times are in `host-interruption.json`. This supports a host interruption but does
not establish the entire stall's cause or duration. The failed run is retained and
cannot qualify acceptance. No engine/test deadlines were extended. The recorder
now also rejects measured suite-budget overruns when a child exits during resume,
in addition to its existing subprocess timeout. The unchanged final sources and
tests are re-reviewed and re-sealed before the next bounded attempt.
