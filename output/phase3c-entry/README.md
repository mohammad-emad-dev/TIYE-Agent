# Phase 3C proposal: bound durable result reporting

Baseline: [Phase 3B exit](../phase3b-exit/README.md), accepted at a0b9805 with
311 passing tests. This proposal connects one additional member tool to the
existing core: report_result for a task chosen by the trusted coordinator.
It makes a scripted conversation capable of recording a durable task result.

The [amendment](AMENDMENT.md) and [contract](CONTRACT.md) are ready for an owner
scope decision. No runtime implementation or new execution is included here.
The existing core, worker composition, adapter and loop sources remain unchanged.

Core evidence and model language retain separate roles. A successful report
requires the existing independently witnessed effect completion. Ordinary text,
including a final response, cannot complete a task. An accepted report survives
a later failed continuation or stop; an uncertain report is never resent.

The existing offline read-only factory remains read-only. Provider integration,
arbitrary tools, filesystem/command actions, UI and release remain pending.
