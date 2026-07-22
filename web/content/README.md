# Content contract

## Multi-language identity

Lessons have a normalized `language` and `track`. Existing registry entries that
use `standard: cpp98|cpp11|cpp20` remain valid and normalize to `language: cpp`;
new language integrations use the explicit pair, for example
`language: python` with `track: python3`. Generated manifests retain `standard`
as a compatibility alias for `track` until the multi-deck UI migration is
complete.

Code filenames are language-aware: C++ lessons use optional `main.cpp`, while
Python lessons use optional `main.py`. Python directory discovery is enabled;
the practice and analytics UI select either the `cpp-interview` or
`python-interview` deck. Reviews remain keyed by stable question ID, while daily
queues, random practice, streaks, Custom Study, and analytics are calculated
inside the selected deck.

The C++ and Python notes in the repository root remain the source of truth. The
web app adds stable metadata and interview questions without requiring existing
notes to be reformatted.

## Lesson registry

`lesson-registry.yaml` maps a stable lesson ID to a source directory. Renaming a
folder only requires changing `sourcePath`; attempts and review history keep the
same lesson ID.

Every registered directory must contain `knowledge.md`. A sibling `main.cpp`
(C++) or `main.py` (Python) is optional.

## Question bank

Question files live under `questions/`. Generated questions must start as
`draft`. A question may become `verified` only after its prompt, answer, rubric,
and cited source sections have been reviewed.

Each question contains:

- a stable ID and version;
- a lesson ID, type, difficulty, and expected duration;
- an optional `responseMode: code` only when the candidate must write or modify code in the lesson language;
- a canonical short answer and detailed explanation;
- required points, optional bonus points, and common misconceptions;
- one or more source section IDs from the parsed note.
- the lesson `sourceHash` captured when the question was last approved.

When a note changes, its content hash changes. Questions referencing that lesson
are emitted as `needs_review` in the app manifest without rewriting past
attempts. A question enters daily practice when it is committed as `verified` or
the signed-in owner approves its exact version and source hash in the web queue.

### Trading interview convention

The target is C++ or Python software engineering at trading and
quantitative-finance companies. Every AI-generated batch of two or more
questions must contain at least one realistic `scenario` question when grounded
by the lesson. C++ scenarios may cover latency-sensitive market data, order
routing, allocation, cache locality, concurrency, ownership, or recovery.
Python scenarios may cover market-data ingestion, research pipelines, data
validation, batch processing, risk tooling, service integration, concurrency,
memory use, testing, or recovery.

Trading vocabulary must not be cosmetic: renaming a toy variable to `Order` or
`Price` is not a realistic scenario. The context must materially affect the
language design choice, correctness argument, performance trade-off, or failure
analysis.
At the same time, questions must remain grounded in the lesson, include enough
context to be answered in an interview, and must not invent exchange rules,
latency numbers, market behavior, risk formulas, or other finance knowledge not
present in the source note.

## Updating knowledge

Keep notes in one of the managed source roots: `cpp98_foundation`, `cpp11`,
`cpp20`, or `python`. Every lesson directory needs a `knowledge.md`; use an
optional `main.cpp` for C++ and `main.py` for Python. Python lessons are assigned
to `language: python`, `track: python3`, and receive stable IDs beginning with
`python-`.

On `main`, GitHub Actions runs the safe automation automatically after a note is
added, edited, renamed, or deleted. It:

- registers new lessons and preserves stable IDs across detectable renames;
- archives questions whose lesson was deleted;
- marks questions grounded in an older hash as `needs_review`;
- validates and commits only the deterministic lesson registry and Git manifest;
- transactionally syncs that committed snapshot into Supabase before the Vercel
  deployment reads it in `db` mode;
- enqueues every uncovered lesson revision, then asks OpenAI Luna for two drafts
  (Gemini is the 429/quota fallback) and writes immutable question revisions
  directly to Supabase.

The workflow needs GitHub Actions secrets `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY`. Add `GEMINI_API_KEY` to enable
the free fallback. For a local preview of deterministic Git reconciliation, run:

```bash
npm run content:refresh
npm run content:status
```

`content:refresh` performs discovery/archive/manifest refresh without calling
AI. CI no longer writes AI drafts to Git. `content:auto` and `content:draft` are
legacy/manual repository tools; do not use them for normal Phase E automation.

The database sync additionally requires GitHub Actions secrets `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is server-only and must
never be added to a `NEXT_PUBLIC_` variable or committed. Each sync is an atomic,
idempotent full snapshot: current pointers and ordering move forward together,
while lesson/question revision rows remain immutable for audit history.

## Drafting and approving questions

For a legacy local repository draft, this command still works:

```bash
npm run content:draft -- --lesson cpp11-range-based-for --count 2
```

The production pipeline does not append to `questions/generated.yaml`. It stores
new drafts as DB-owned rows with IDs such as `cpp11-move-semantics-ai-001` and
`status: draft`. They appear in the signed-in owner's Review Queue but do not
enter daily practice until approved. Approval remains private in Supabase and is
invalidated automatically when the question version or source hash changes.

Maintainers can alternatively approve a single question in the repository:

```bash
npm run content:review -- --id cpp11-range-based-for-001
```

Repository approval captures the current source hash. Re-approving a stale
question bumps its version; approving a new draft keeps version 1. AI never
changes a question to `verified` by itself.

## Admin edits and archives

The owner can edit or archive a question from the Admin question bank. These
changes are stored as a private Supabase overlay; the generated YAML and source
note remain unchanged for audit and regeneration.

Saving an edit increments the question version, invalidates its previous
approval, and sends it back to the Review Queue. Existing review and AI-attempt
rows remain attached to the stable question ID, while the Anki state detects the
new version as changed content. "Delete" is implemented as an archive: the
question is excluded from practice, sync, and AI coach, but its history is not
deleted and the owner can restore it from the Archived filter.

## Commands

```bash
npm run content:generate
npm run content:auto
npm run content:check
npm run content:status
npm test
```

`content:generate` writes the deterministic manifest consumed by the app.
`content:check` fails when the committed manifest is stale.
