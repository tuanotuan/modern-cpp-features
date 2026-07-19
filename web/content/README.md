# Content contract

The C++ notes in the repository root remain the source of truth. The web app
adds stable metadata and interview questions without requiring the existing
notes to be reformatted.

## Lesson registry

`lesson-registry.yaml` maps a stable lesson ID to a source directory. Renaming a
folder only requires changing `sourcePath`; attempts and review history keep the
same lesson ID.

Every registered directory must contain `knowledge.md`. A sibling `main.cpp` is
optional, but the current corpus has one for every lesson.

## Question bank

Question files live under `questions/`. Generated questions must start as
`draft`. A question may become `verified` only after its prompt, answer, rubric,
and cited source sections have been reviewed.

Each question contains:

- a stable ID and version;
- a lesson ID, type, difficulty, and expected duration;
- a canonical short answer and detailed explanation;
- required points, optional bonus points, and common misconceptions;
- one or more source section IDs from the parsed note.
- the lesson `sourceHash` captured when the question was last approved.

When a note changes, its content hash changes. Questions referencing that lesson
are emitted as `needs_review` in the app manifest without rewriting past
attempts. A question enters daily practice when it is committed as `verified` or
the signed-in owner approves its exact version and source hash in the web queue.

## Updating knowledge

Keep notes in one of the existing source roots: `cpp98_foundation`, `cpp11`, or
`cpp20`. Every lesson directory needs a `knowledge.md`; `main.cpp` remains
optional.

On `main`, GitHub Actions runs the safe automation automatically after a note is
added, edited, renamed, or deleted. It:

- registers new lessons and preserves stable IDs across detectable renames;
- archives questions whose lesson was deleted;
- marks questions grounded in an older hash as `needs_review`;
- asks Gemini for two new drafts when a changed lesson has no question grounded
  in its current hash;
- validates and commits the refreshed registry/question bank/manifest.

The repository needs a GitHub Actions secret named `GEMINI_API_KEY`. For a local
preview of the same deterministic reconciliation, run:

```bash
npm run content:refresh
npm run content:status
```

`content:refresh` performs discovery/archive/manifest refresh without calling
Gemini. `content:auto` is the full CI command including safe draft generation.

## Drafting and approving questions

Generate one to five grounded drafts for a lesson with Gemini:

```bash
npm run content:draft -- --lesson cpp11-range-based-for --count 2
```

Drafts are appended to `questions/generated.yaml` with `status: draft`. They
appear in the signed-in owner's Review Queue but do not enter daily practice
until the owner presses **Duyệt tất cả**. Approval is private in Supabase and is
invalidated automatically when the question version or source hash changes.

Maintainers can alternatively approve a single question in the repository:

```bash
npm run content:review -- --id cpp11-range-based-for-001
```

Repository approval captures the current source hash. Re-approving a stale
question bumps its version; approving a new draft keeps version 1. AI never
changes a question to `verified` by itself.

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
