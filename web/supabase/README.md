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
