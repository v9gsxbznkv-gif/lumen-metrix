# Auth Callback 404 Debug

## Finding
When visiting `https://churchdash-emzmxpmc.manus.space/auth/callback?code=test`, 
the Manus gateway intercepts the `/auth/callback` path and redirects to the Manus OAuth login page.

This means the Manus hosting gateway treats `/auth/*` as a reserved path for its own OAuth system.
The PCO callback never reaches our Express server because the gateway intercepts it first.

## Solution
We need to use a different callback path that the gateway won't intercept. Options:
- `/api/pco/callback` (under /api/ which is passed through to the server)
- `/pco/callback`
- `/integrations/pco/callback`

The `/api/` prefix is the safest bet since tRPC routes already work under `/api/trpc`.

## Action Required
1. Change callback path from `/auth/callback` to `/api/pco/callback`
2. User must update the PCO app's registered callback URL to match
3. Update PCO_REDIRECT_URI env var
