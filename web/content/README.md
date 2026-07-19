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
attempts. Only `verified` questions are eligible for daily practice.

## Updating knowledge

Keep notes in one of the existing source roots: `cpp98_foundation`, `cpp11`, or
`cpp20`. Every lesson directory needs a `knowledge.md`; `main.cpp` remains
optional.

After adding or editing a note, run:

```bash
npm run content:refresh
npm run content:status
```

`content:refresh` discovers unregistered lesson directories, gives them a stable
ID/order, refreshes the generated manifest, and reports stale questions. Review
the inferred tags and prerequisites in `lesson-registry.yaml` after discovery.

## Drafting and approving questions

Generate one to five grounded drafts for a lesson with Gemini:

```bash
npm run content:draft -- --lesson cpp11-range-based-for --count 2
```

Drafts are appended to `questions/generated.yaml` with `status: draft`; they do
not appear in daily practice. Review the prompt, canonical answer, rubric, and
citations in YAML, then approve a single question:

```bash
npm run content:review -- --id cpp11-range-based-for-001
```

Approval captures the current source hash. Re-approving a stale question bumps
its version; approving a new draft keeps version 1. AI never changes a question
to `verified` by itself.

## Commands

```bash
npm run content:generate
npm run content:check
npm run content:status
npm test
```

`content:generate` writes the deterministic manifest consumed by the app.
`content:check` fails when the committed manifest is stale.
