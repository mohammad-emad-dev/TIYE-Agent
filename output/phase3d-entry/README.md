# Phase 3D proposal: durable questions and explicit answer continuation

Baseline: [Phase 3C exit](../phase3c-exit/README.md), accepted at 972aa4d with
350 passing tests. The next vertical slice connects the existing durable question
engine to the offline API loop. A member can ask_leader; a bound Leader can
ask_user. Work waits for a real recorded answer before the conversation continues.

The [amendment](AMENDMENT.md) and [contract](CONTRACT.md) require an owner scope
decision. This proposal includes no runtime code or new native execution.

The trusted coordinator records answers using existing core APIs. The model
cannot answer its own question, select another recipient or release its task slot.
An explicit resume request reads the actual answer; timers, prose and subscriber
callbacks cannot synthesize one. Stop and uncertain writes stay fenced.

Existing text, context-only and reporting factories keep their current behavior.
Providers, UI question cards, automatic polling, durable conversation recovery,
arbitrary tools and release remain pending.
