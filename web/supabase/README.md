# Supabase setup

Supabase stores private cross-device progress, AI history, question approvals,
and the atomic monthly AI spend guard.

1. Create a free project at <https://database.new>.
2. Copy the Project URL and publishable key into `web/.env.local`.
3. Link the CLI and apply the tracked migration:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

4. In Supabase Authentication > Providers, enable GitHub.
5. Create a GitHub OAuth App. Set its callback URL to the callback displayed by
   Supabase, normally `https://<project-ref>.supabase.co/auth/v1/callback`.
6. In Supabase Authentication > URL Configuration, add
   `http://localhost:3000/auth/callback` for local development. Add the deployed
   `/auth/callback` URL later.

`ALLOWED_GITHUB_LOGIN` defaults to `tuanotuan`. Authentication, progress, and AI
routes reject every other GitHub identity so the paid AI quota remains personal.

The migrations enable RLS. Authenticated users can only read and mutate rows
whose `user_id` matches their JWT identity. Question approvals are bound to an
exact question version and source hash, so a source edit automatically sends the
question back to the Review Queue.

The AI budget migrations reserve a conservative amount before each web AI call,
record the actual response-token cost afterward, and reconcile it against the
official OpenAI Costs API. Daily quota uses the Vietnam calendar day. Automated
draft generation is included when it uses the same `OPENAI_PROJECT_ID`. Keep the
OpenAI project budget at the same value as `OPENAI_MONTHLY_BUDGET_USD`.

The reconciliation baseline records the realtime counter at each Billing sync.
Effective spend is the provider total plus only the realtime delta created after
that baseline, so new requests are visible immediately without counting settled
usage twice.

Gemini fallback requests are counted separately in `gemini_usage_daily`; they do
not reduce the OpenAI dollar budget. `ai_provider_settings` stores the owner's
Admin toggle for that fallback. Both tables remain private under RLS.

`user_question_states` is the Anki-style current-state projection for each
user/question pair. `practice_reviews` remains the immutable learning history.
The Phase A migration backfills practiced questions as Review or Relearning;
unseen questions are created lazily as New when the Phase B scheduler is wired
to the practice flow.

Phase B extends `practice_reviews` with the state produced by each rating and
uses `record_practice_review(...)` to update review history plus
`user_question_states` in one database transaction. The browser may calculate
an optimistic interval, but the RPC remains authoritative for cloud progress.

Phase C adds owner-only scheduling operations through
`manage_question_schedule(...)`: suspend, unsuspend, reset, and reschedule.
Reset removes that question's review history and records a cutoff so stale
browser storage on another device cannot silently restore the deleted progress.

Phase D adds a server-rendered learning analytics page from the existing review
history and question-state projection. Retention, 28-day activity, 14-day due
forecast, deck distribution, and weak-topic ranking require no new table, RPC,
or AI request, so this phase has no additional Supabase migration.

`question_overrides` stores owner-only edits and archive flags over the generated
question manifest. Editing increments the effective question version and
requires a new approval; archiving hides the question without deleting review or
coach history. RLS keeps the overlay private to the authenticated owner.

## Hybrid content bank foundation

`20260723090000_create_content_question_bank.sql` adds the Phase A database
foundation without changing the production content source. Git remains the source
of truth for `knowledge.md` and `main.cpp`; Supabase will hold derived, immutable
lesson and question revisions in later phases.

The new tables are additive. They do not import or mutate the existing YAML bank,
approvals, practice history, Anki state, coach attempts, or overrides. The app
continues to default to `QUESTION_STORE=repo` until a later cutover.

Lesson revisions, question revisions, and question audit events are append-only.
Current pointers and lifecycle state live on `content_lessons` and
`content_questions`. `content_generation_jobs` and `content_sync_runs` provide the
idempotency and retry ledger for the future Git-to-Supabase automation.

Only authenticated readers that pass RLS can see content. Browser roles receive no
direct write grants. Add the owner to `content_admins` during the Phase B backfill;
do not expose a service-role key through a `NEXT_PUBLIC_` variable.

## Content bank backfill

`20260723130000_backfill_content_question_bank.sql` installs the Phase B importer.
The function is not executable by browser roles. Run it through the Supabase SQL
Editor with the deterministic payload generated from the checked-out Git commit:

```powershell
npm.cmd run --silent content:backfill:sql | Set-Clipboard
```

Paste the clipboard into a new SQL query and run it. The returned JSON must contain
`"ok": true`; it also reports expected/imported lesson and question counts,
checksum mismatches, missing current revisions, and materialized Admin overrides.

The importer is idempotent. Re-running the same payload does not create duplicate
revisions or audit events. If an existing question ID/version has different
content, the transaction raises a checksum conflict and rolls back instead of
overwriting history. Existing approvals, practice reviews, Anki state, coach
attempts, and overrides are never mutated.

For a local payload-only dry run that does not connect to Supabase:

```powershell
npm.cmd run --silent content:backfill:check
```

The monotonic AI budget migration stores a conservative usage floor before each
OpenAI Billing reconciliation. Billing data can lag realtime requests, but that
lag can no longer make used cost decrease or remaining daily quota increase.

## Content bank shadow reads

`20260724100000_create_content_shadow_views.sql` adds the current-lesson view used
by Phase C. Apply it after the Phase B backfill, then set `QUESTION_STORE=shadow`
in Vercel Production. Shadow mode reads both stores and logs any mismatch, but it
continues serving the Git manifest, so a database problem cannot change the live
practice bank.

`20260724120000_fix_content_shadow_parity.sql` aligns stale-draft status handling
with the Git manifest. Apply it immediately after the shadow-view migration.

## Phase D automated sync and cutover

`20260725100000_sync_content_question_bank.sql` installs the transactional,
service-role-only `sync_content_question_bank(...)` RPC. It also stores the exact
manifest order and source revision, so DB reads reproduce the committed Git
snapshot rather than merely containing equivalent rows. The RPC is idempotent by
repository commit, rejects question ID/version checksum conflicts, archives rows
missing from the new snapshot, and advances all current pointers atomically.

Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as GitHub Actions secrets. Do
not add the service-role key to Vercel or any `NEXT_PUBLIC_` variable. After each
safe content refresh on `main`, the workflow runs:

```bash
npm run content:sync
```

For a local payload/checksum dry run that never contacts Supabase:

```bash
npm run content:sync:check
```

Cut over only after the main-branch sync succeeds and
`/api/admin/content-parity` returns `readyForCutover: true` (which requires both
content parity and an exact source revision). Set Vercel `QUESTION_STORE=db` and redeploy. DB
mode applies the same private Admin overrides after loading the base snapshot and
fails closed on missing/invalid state. Rollback is a Vercel-only change back to
`QUESTION_STORE=shadow`; immutable revisions and sync history remain intact.

While signed in as the configured owner, open `/api/admin/content-parity`. The
response must contain `"ok": true` and empty missing/extra/mismatched ID arrays
before a later phase changes `QUESTION_STORE` to `db`. Database mode fails closed
when the Supabase read or schema validation fails; do not enable it in Phase C.

## Phase E DB-native question generation

`20260726100000_create_db_native_generation_pipeline.sql` keeps Git as the source
of truth for lessons while moving newly generated question drafts out of YAML.
Apply it only after the Phase D migration and successful DB cutover.

The migration adds immutable question ownership, a repository-only parity view,
and service-role RPCs to enqueue, lease, complete, fail, and retry generation
jobs. Completion inserts the question, its immutable revision, provenance, and
audit event in one transaction. Generated IDs use a separate `-ai-NNN`
namespace, so future repository questions cannot silently collide with them.

The main workflow now runs `content:refresh`, `content:sync`, and then
`content:generate:db`. A lesson revision is enqueued only when it has no current,
non-archived question grounded in the same source hash. Jobs use a 10-minute
lease, exponential retry, and dead-letter after five attempts. OpenAI Luna is
primary; Gemini is used only after an OpenAI 429 when `GEMINI_API_KEY` exists.

Required GitHub Actions secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY` (optional fallback)

The service-role key must remain GitHub-only. OpenAI generation shares the same
OpenAI project hard budget as the web app, so keep that project budget at $5.
The Admin page shows the latest generation jobs and can move a deferred, failed,
or dead-letter job back to `pending`; execution resumes on the next scheduled or
manually dispatched workflow.

Rollback is non-destructive: disable the generation step in the workflow. DB
drafts, immutable revisions, jobs, and events remain available for audit, while
the existing DB reader continues serving already synchronized content.

## Multi-language Phase A foundation

`20260727100000_add_multilanguage_content_foundation.sql` adds language and track
metadata without rewriting immutable lesson or question revisions. Both values
are generated from the existing compatible `standard` column, whose constraint
is widened to include `python3`. Existing C++ rows therefore materialize as
`language = cpp` with their original track and checksum.

The current-lessons view appends `language` and `track`; existing columns retain
their names and order. Apply this migration before deploying the matching app
code. Phase A does not add Python lessons, change the selected practice deck, or
alter C++ question taxonomy, approvals, scheduling, and history.

## CMake Phase A foundation

`20260728100000_add_cmake_content_foundation.sql` widens the same compatibility
contract to `language = cmake`, `track = cmake`. Because PostgreSQL does not
allow changing a generated-column expression in place, the migration briefly
drops the current-lessons view and rebuilds only the derived `language`/`track`
columns before recreating the view. Immutable lesson revisions, source hashes,
questions, approvals, and learning history are not rewritten or deleted.

Apply it before deploying the matching app code. The migration is transactional;
an error rolls the whole change back. CMake discovery and the visible deck remain
disabled in this phase.
