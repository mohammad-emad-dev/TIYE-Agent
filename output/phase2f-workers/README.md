# Phase 2F owned mock worker implementation

The private mock-team package connects accepted schema7 state to fixed owned
workers with committed claims, at-most-once invocation delivery, independent
post-exit witnesses and bounded cleanup. Core production sources are unchanged.

Qualification records and actual test totals are in `verification.json` and
`evidence.json`. `TEST-PLAN.md` defines the pre-execution source review and finite
budget. Raw execution streams remain local; public records contain safe hashes.
`REVIEWS.md` records delegate availability and parent review.

This is internal synthetic process composition. Provider/native integration,
UI, general execution and release remain HOLD. Phase 2F exit is a separate review.
