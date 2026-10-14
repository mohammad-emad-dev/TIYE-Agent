# Antigravity consumer account route decision

Reviewed 14 October 2026 after the operator identified Antigravity CLI as the
proposed route. Account/region details remain in the conversation; they are not
copied into repository evidence. Model identity was resolved with `agy models`:
`gemini-3.8-flash-high`, label Gemini 3.8 Flash (High). Version: 1.3.5.

**Classification D for TIYE consumer CLI wrapping and delegate use.**
The [FAQ](https://antigravity.google/docs/faq) explicitly limits consumer headless
use to direct scripting/CI and excludes third-party coding-agent/application
wrapping. [Additional terms section 6](https://antigravity.google/terms) also
restricts third-party service access. This applies to the proposed consumer
login route independently of model availability.

The [headless documentation](https://antigravity.google/docs/cli/headless/)
establishes capability and the public model slug, not wrapper permission.
[Installation/auth](https://antigravity.google/docs/cli/install/) and
[plans](https://antigravity.google/docs/plans) describe distinct account/API and
Enterprise routes; those alternatives require separate evaluation.

No credential/config/log files were opened. Only help, version and the model-list
command were run. No native model request or delegate request was made in this
cohort after the restriction was established. Older Agy review evidence remains
historical; its success grants no exemption from the current product conditions.

`route.json` records the refusal with no execution surface. `npm run check`
verifies the decision metadata; it cannot independently establish
policy truth. This additive decision preserves earlier sealed cohorts, whose
Antigravity vendor/endpoint identity was unresolved at their review time.

Next: select an API or another reviewed official route with appropriate access
authorization, or establish a separately applicable Enterprise agreement. No
automatic API/provider/account substitution is made. S4 remains partial.
