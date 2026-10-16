# Draft: TIYE local desktop integration scope

Prepared for the project owner to review. **Not sent or submitted.**

We are developing TIYE Agent, a local desktop coding-team application with paid
plans and a Free tier. Users would run their own installed official Codex CLI,
use their own provider access and retain project data on their devices. We intend
to support streamed work and user approvals. We do not intend to collect or reuse
the CLI's cached credentials outside an approved integration mechanism.

Before implementing the OpenAI login route, we would like to clarify:

1. Does the commercial/hosted-service restriction under the app-server auth
   documentation cover a paid, locally executed desktop app using an unmodified
   official Codex CLI with each user's own account? Please distinguish terminal
   orchestration from app-server managed authentication if the scopes differ.
2. Which documented integration route should this product use: approved Sign in
   with ChatGPT, a separately qualified API route, or another supported option?
3. If Sign in with ChatGPT is appropriate, what commercial/private-client
   selection, onboarding, registered callbacks and inference scopes are required?
4. What account-plan, regional, enterprise-control and distribution conditions
   must the application meet? Identity-only sign-in will not meet our inference
   requirement.

References checked 16 October 2026:

- [App-server authentication](https://learn.chatgpt.com/docs/app-server#auth-endpoints)
- [Sign in with ChatGPT quickstart](https://developers.openai.com/siwc/quickstart)
- [Client-ID request](https://developers.openai.com/siwc/request-client-id)

No credentials, personal account identifiers or project files are needed in this
initial scope inquiry. An answer must be recorded against the exact selected
route before TIYE treats it as eligible; it would not replace native testing.
