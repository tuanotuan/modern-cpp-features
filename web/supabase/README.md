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

`20260720170000_create_ai_usage_budget.sql` reserves a conservative amount before
each web AI call and records the actual token cost afterward. This keeps
concurrent requests from crossing `OPENAI_MONTHLY_BUDGET_USD`. Automated draft
generation in GitHub Actions is protected by the OpenAI project budget, so set
that project budget to the same USD value.
