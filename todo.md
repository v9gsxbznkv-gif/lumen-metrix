# Lumen Metrix — Project TODO

## Completed Features
- [x] Basic dashboard with 13 tabs (Overview, People, Giving, Attendance, Volunteers, Events, Visitors, Campuses, Compare, Health, Reports, AI, Settings)
- [x] 12 years of church data extracted from Google Sheets (2014-2026)
- [x] Campus filtering, year range selection, KPI cards with YoY changes
- [x] Lumen Metrix brand identity (amber palette, DM Sans typography, logo)
- [x] Compare tab with event calendar and year-over-year comparisons
- [x] Reports tab with custom report builder and PDF export
- [x] Partial-year-aware YoY comparisons for 2026 Q1 data
- [x] Fixed Kids attendance double-counting bug
- [x] Fixed attendance mismatch between Overview and Attendance pages
- [x] Upgraded from static frontend to full-stack (Node.js + tRPC + MySQL)

## Full-Stack Upgrade & PCO Integration
- [x] Design database schema for PCO data (attendance, giving, groups, events, people)
- [x] Create pco_settings table for storing PCO credentials
- [x] Create sync_logs table for tracking sync history
- [x] Migrate historical spreadsheet data to database (4,457 records across 8 tables)
- [x] Build PCO API client with OAuth Bearer token support
- [x] Build sync endpoints: attendance (check-ins headcounts)
- [x] Build sync endpoints: giving (donations, funds)
- [x] Build sync endpoints: groups (small groups, memberships)
- [x] Build sync endpoints: events (calendar, event instances)
- [x] Build sync endpoints: people (person records)
- [x] Create tRPC routers for PCO settings and sync operations

## PCO OAuth 2.0 Flow
- [x] Swap PCO_APP_ID / PCO_SECRET env vars to correct Client ID / Client Secret
- [x] Add pco_tokens table for storing OAuth access + refresh tokens
- [x] Build PCO OAuth authorize endpoint (redirect to PCO)
- [x] Build PCO OAuth callback endpoint (exchange code for tokens)
- [x] Build token refresh logic (auto-refresh on 401 with 5-min buffer)
- [x] Update PCO client to use Bearer token auth instead of Basic Auth
- [x] Update Settings UI with "Connect to Planning Center" button
- [x] Show connection status, org name, token expiry, scopes display
- [x] Settings UI: disconnect button
- [x] Settings UI: test connection button
- [x] Settings UI: sync controls with module selector and date range
- [x] Settings UI: sync history log display

## Remaining
- [x] Connect frontend data layer to backend API (hybrid: DB + static JSON fallback)
- [x] Write vitest tests for PCO router and sync logic (19 tests passing)
- [x] Push updated code to GitHub (v9gsxbznkv-gif/lumen-metrix)

## Bug Fixes
- [x] Fix PCO OAuth sign-in error: changed callback path from /api/pco/callback to /auth/callback to match PCO registered URLs
- [x] Fix PCO OAuth redirect URI: hardcoded to use PCO_REDIRECT_URI env var (churchdash-emzmxpmc.manus.space/auth/callback) instead of dynamic origin
- [x] Fix 404 on /auth/callback after PCO authorization — Manus gateway intercepts /auth/ paths, changed to /api/pco/callback which passes through to Express
- [x] Fix attendance sync 404 error: fixed fallback redirect URI in env.ts and republished
- [x] Fix PCO attendance sync 404: changed from /events/{id}/event_times (doesn't exist) to /events/{id}/event_periods (correct PCO hierarchy)
- [x] Add better error logging to sync functions to capture exact failing URL and response

## Data Source Migration & Auto-Sync
- [ ] Sync all remaining PCO modules (giving, groups, events, people)
- [x] Switch dashboard to use PCO/DB data as primary source for 2026+ (source-aware filtering in getDashboardData)
- [x] Keep historical spreadsheet data (2014-2025) as fallback for years <2026
- [x] Remove spreadsheet dependency for current year data (2026+ uses PCO exclusively)
- [x] Build nightly auto-sync scheduler (midnight ET) for all PCO modules
- [x] Add Auto-Sync Scheduler status section to Settings page
- [x] Update Data Source section to reflect new source strategy
- [x] Publish updated site with auto-sync enabled

## Bug Fixes (Round 3)
- [x] Fix Health page Attendance Growth: now compares YTD avg_weekly vs same-period prior year avg_weekly (apples-to-apples)
- [x] Fix Health page Volunteer Ratio: computeVolunteerRatio now builds All Campuses aggregate by summing Canton+Jasper rows
- [x] Fix Health page Giving Per Capita: computeGPC now annualizes partial-year giving before dividing by avg_weekly attendance
- [x] Fix Health page FTG Rate: now uses monthly next_steps data for same-period count, summing individual campuses for All Campuses
- [x] Fix year dropdown width cutoff: increased from 80px to 90px so "2026" displays fully

## Bug Fixes (Round 2)
- [x] Fix "All Campuses" volunteer avg weekly calculation — excluded pre-aggregated row from DB query, frontend now sums Canton + Jasper dynamically
- [x] Fix 2026 missing from year dropdown — sourceFilter was requiring source='pco' for 2026+ but all data is still source='spreadsheet'; relaxed filter to allow any source for all years, and year list now built from all tables not just attendance/giving

## Reports Page (Round 4)
- [x] Fix Reports page so reports generate correctly (rewrote with tRPC backend, server-persisted reports)
- [x] Add recurring schedule capability (weekly, monthly, quarterly) with DB persistence
- [x] Add email delivery for reports via AI executive summary + owner notification
- [x] Add vitest tests for reports router (11 tests)
- [ ] Publish updated site with Reports fixes
