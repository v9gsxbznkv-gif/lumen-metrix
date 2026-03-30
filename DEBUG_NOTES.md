# PCO OAuth Debug Notes

## Root Cause Analysis

The "malformed redirect" error from PCO is caused by a **redirect URI mismatch**:

1. The PCO OAuth application has these registered callback URLs:
   - `https://app.lumenmetrix.com/auth/callback`
   - `http://localhost:5000/auth/callback`

2. But the app is generating this redirect URI:
   - `https://3000-ivvtlm3q0hbnt4dvxpp2g-df78d5a3.us2.manus.computer/api/pco/callback`
   - Or in production: `https://churchdash-emzmxpmc.manus.space/api/pco/callback`

**Two problems:**
- The **domain** doesn't match (sandbox/manus.space vs app.lumenmetrix.com)
- The **path** doesn't match (`/api/pco/callback` vs `/auth/callback`)

## Fix Required

Option A: Change our callback path to `/auth/callback` AND use the registered domain
Option B: Add the actual deployed URLs to the PCO app's registered callbacks

Since the user may be accessing from the Manus preview domain, the best approach is:
1. Change our callback path from `/api/pco/callback` to `/auth/callback` to match PCO config
2. Also need to add the actual domain to PCO's registered callbacks, OR use a fixed redirect URI
