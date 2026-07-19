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

When a note changes, its content hash changes. Questions referencing that lesson
can then be flagged for review without rewriting past attempts.

## Commands

```bash
npm run content:generate
npm run content:check
npm test
```

`content:generate` writes the deterministic manifest consumed by the app.
`content:check` fails when the committed manifest is stale.
