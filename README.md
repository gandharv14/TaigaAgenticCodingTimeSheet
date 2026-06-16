# Live Compare Timesheet

A Next.js timesheet app for Live Compare work. Users authenticate with Auth0, submit task timing and turn-level task types, and review/edit their own history. Supabase stores the data through server-side API routes only.

## Environment

Copy `.env.example` to `.env.local` and provide:

- `AUTH0_SECRET`
- `AUTH0_DOMAIN`
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

No Labelbox variables are used.

## Supabase

Apply `supabase/migrations/001_timesheets.sql` to the Supabase project before using the app.

The migration creates `timesheet_entries` and `timesheet_turns`, enables row-level security, and relies on the Next.js backend to authorize each request against the Auth0 user ID.

## Auth0

Create a Regular Web Application in Auth0. For local development, allow:

- Callback URL: `http://localhost:3000/auth/callback`
- Logout URL: `http://localhost:3000`

For Vercel preview or production URLs, add the matching `/auth/callback` URL and base logout URL in Auth0.

## Development

```bash
npm install
npm run dev
```

If your npm cache has local permission issues, use a cache outside the project tree, for example `npm --cache /tmp/taiga-timesheet-npm-cache install`.

## Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Local Debug E2E

Set `AUTH_DEBUG_BYPASS=true` locally to bypass Auth0 and use an in-memory timesheet store. This bypass is ignored on Vercel.

```bash
AUTH_DEBUG_BYPASS=true AUTH_DEBUG_EMAIL=debug.alignerr@alignerr.com npm run dev
```

For scripted API coverage against a running debug server:

```bash
E2E_BASE_URL=http://127.0.0.1:3010 npm run e2e:script
```

For browser E2E coverage:

```bash
npm run e2e:playwright:install
npm run e2e:playwright
```

## Deployment

After the real environment variables are configured in Vercel:

```bash
vercel deploy --scope labelbox -y
```

Use `--prod` only when a production deployment is explicitly intended.
