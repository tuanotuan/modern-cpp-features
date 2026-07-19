# C++ Recall

Personal interview-practice app generated from the C++ notes in the repository
root.

## Current phase

Phase 0–5 provides:

- a stable registry for all 22 lessons;
- a tolerant Markdown parser that preserves note sections and C++ examples;
- deterministic source hashes and commit provenance;
- extraction of 117 numbered checklist prompts;
- a schema-validated pilot bank of 10 verified interview questions;
- a deterministic daily question and spaced-review queue;
- browser-local progress, self-rating, and streak tracking;
- grounded Gemini feedback against the exact rubric and source-note sections.
- optional GitHub OAuth and private cross-device progress/AI history in Supabase;
- offline-first local progress that merges into cloud state after sign-in.
- deterministic discovery for newly added `knowledge.md` lessons;
- question-level source snapshots that automatically quarantine stale questions;
- Gemini-generated question drafts with a human review gate.

## Local commands

```bash
npm install
npm run content:refresh
npm run dev
```

Copy `.env.example` to `.env.local` and add a Gemini API key before using the
AI coach. The key is read only by the server route and is never exposed to the
browser.

Cloud sync is optional. Add the Supabase project URL and publishable key, then
follow [`supabase/README.md`](supabase/README.md) to apply the RLS migration and
enable GitHub OAuth. Without those variables, the app stays fully functional in
local-only mode.

Run every validation gate with:

```bash
npm run validate
```

The app expects to remain in `/web` so the content generator can locate the Git
repository root and the `cpp98_foundation`, `cpp11`, and `cpp20` directories.

See [`content/README.md`](content/README.md) for the lesson and question contract.
