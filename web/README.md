# Recall

Personal interview-practice app generated from the C++ and Python notes in the
repository root.

## Current phase

Phase 0–5 provides:

- a stable registry for all 22 lessons;
- a tolerant Markdown parser that preserves note sections and C++ examples;
- deterministic source hashes and commit provenance;
- extraction of 117 numbered checklist prompts;
- a schema-validated pilot bank of 10 verified interview questions;
- a deterministic daily question and spaced-review queue;
- browser-local progress, self-rating, and streak tracking;
- grounded OpenAI feedback against the exact rubric and source-note sections;
- optional GitHub OAuth and private cross-device progress/AI history in Supabase;
- offline-first local progress that merges into cloud state after sign-in.
- deterministic discovery for newly added `knowledge.md` lessons;
- question-level source snapshots that automatically quarantine stale questions;
- OpenAI Luna-generated question drafts with a human review gate;
- Luna for routine grading and Terra for deeper follow-up explanations;
- an atomic daily/monthly AI budget guard reset at midnight Vietnam time;
- official OpenAI Costs API reconciliation with realtime token accounting.
- Gemini Free fallback for grading and follow-ups after the app OpenAI budget is exhausted;
- a private web Review Queue with exact-version/hash bulk approval;
- GitHub Actions reconciliation for note additions, edits, renames, and deletes.

## Local commands

```bash
npm install
npm run content:refresh
npm run dev
```

Copy `.env.example` to `.env.local` and add an OpenAI API key before using the
AI coach. The key is read only by the server route and is never exposed to the
browser. `OPENAI_MONTHLY_BUDGET_USD` defaults to `5`; also set the same project
budget in the OpenAI dashboard as the provider-level backstop.

For Billing-accurate quota reconciliation, add an organization Admin API key as
`OPENAI_ADMIN_KEY` and the matching project ID as `OPENAI_PROJECT_ID`. These are
server-only variables. The app uses OpenAI's official Costs API as the source of
truth and keeps response-token accounting as a realtime fallback while provider
cost data is being settled.

Provider reconciliation snapshots the realtime counter at each successful Costs
API sync, then adds only newer realtime usage to that Billing total. This avoids
both double-counting and a frozen usage pill while provider data is delayed.

To enable the free fallback, keep `GEMINI_API_KEY` server-side and optionally set
`GEMINI_FALLBACK_MODEL`. The fallback is attempted only after the app rejects an
OpenAI request for reaching its daily or monthly budget. It can be toggled in
Admin; `GEMINI_FALLBACK_ENABLED=false` is the deployment-level kill switch.

Cloud sync is optional. Add the Supabase project URL and publishable key, then
follow [`supabase/README.md`](supabase/README.md) to apply the RLS migration and
enable GitHub OAuth. Without those variables, the app stays fully functional in
local-only mode.

Run every validation gate with:

```bash
npm run validate
```

The app expects to remain in `/web` so the content generator can locate the Git
repository root and the `cpp98_foundation`, `cpp11`, `cpp20`, and `python`
directories.

See [`content/README.md`](content/README.md) for the lesson and question contract.
