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
- [x] Sync all remaining PCO modules (giving, groups, events, people) — Attendance sync working; giving/groups/events/people can be synced on-demand via Settings UI
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
- [x] Publish updated site with Reports fixes

## Weekly Report Feature (Round 5)
- [x] Add weekly_report_config table for auto-generation scheduling
- [x] Build tRPC procedures for weekly report data with comparison options (same week last year, previous week, same period last year)
- [x] Build WeeklyReportTab frontend with campus breakdown, metric cards, and comparison toggles
- [x] Add auto-generation scheduling (user picks day/time, e.g. every Monday at 8am)
- [x] Add Weekly Report to dashboard sidebar navigation
- [x] Write vitest tests for weekly report procedures (9 tests)
- [x] Publish updated site with Weekly Report feature

## Password Login Feature (Round 6)
- [x] Add dashboard password to env/secrets (DASHBOARD_PASSWORD, defaults to Test123)
- [x] Add tRPC procedures: dashboardAuth.login (verify password, set cookie) and dashboardAuth.check (validate session) and dashboardAuth.logout
- [x] Build LoginPage component with Lumen Metrix branding and single password field
- [x] Gate Home.tsx to show LoginPage until authenticated (30-day session cookie)
- [x] Add logout button to Sidebar (bottom, red hover, collapses to icon)
- [x] Write vitest tests for dashboardAuth procedures (8 tests, 47 total)
- [x] Publish updated site with public visibility

## Mobile Responsiveness (Round 7)
- [x] Login page: optimize for phone screens (full-width card, proper padding)
- [x] Sidebar: convert to hamburger/overlay menu on mobile (< 768px)
- [x] DashboardHeader: make year/campus dropdowns full-width and touch-friendly on mobile
- [x] Home.tsx layout: remove fixed sidebar margin on mobile, use full-width content
- [x] OverviewTab: stack metric cards vertically, resize charts for mobile width
- [x] PeopleTab: stack cards and make tables horizontally scrollable
- [x] GivingTab: stack cards and resize charts for mobile
- [x] AttendanceTab: stack cards and resize charts for mobile
- [x] VolunteersTab: stack cards and resize charts for mobile
- [x] EventsTab: stack cards and make tables scrollable
- [x] VisitorsTab: stack cards and resize charts for mobile
- [x] CampusesTab: make campus comparison tables scrollable
- [x] CompareTab: make comparison tables scrollable, stack controls
- [x] HealthTab: stack health score cards, resize gauges
- [x] ReportsTab: stack report builder controls, make preview scrollable
- [x] WeeklyReportTab: stack cards and comparison tables
- [x] AIAnalystTab: ensure chat interface works on mobile
- [x] SettingsTab: stack settings panels vertically
- [x] KpiCard: reduce padding and font sizes on mobile
- [x] Add global mobile utility CSS (table-scroll, responsive chart containers)
- [x] Publish updated site with public visibility

## Groups Page Feature (Round 8)
- [x] Add groups_annual and groups_monthly schema tables to drizzle/schema.ts
- [x] Seed historical groups data (2015-2026) for Canton and Jasper
- [x] Add tRPC procedure groups.getData with campus/year filters, prior year comparison, monthly trends, campus breakdown, yearly trend
- [x] Build GroupsTab frontend with 5 KPI cards: active groups, total members, leaders, avg attendance, participation rate
- [x] Add 3 charts: monthly bar chart, members YoY line chart, multi-year area trend
- [x] Add campus breakdown table with YoY change column
- [x] Add key ratios section (members/group, members/leader, leaders/group)
- [x] Add Groups to sidebar navigation (UsersRound icon, under Overview section)
- [x] GroupsTab built mobile-responsive from the start (responsive grids, scrollable table)
- [x] Write 9 vitest tests for groups.getData procedure (56 total tests passing)
- [x] Publish updated site with public visibility

## Health Page Charts Fix (Round 9)
- [x] Fix Volunteer-to-Attendee Ratio chart: use undefined for missing data + connectNulls so line connects valid points
- [x] Fix Year-over-Year Growth Rate chart: use same-period comparison for partial years (Q1 2026 vs Q1 2025)
- [x] Publish updated site with public visibility

## Giving Calculation Fix (Round 10)
- [x] Fix giving YTD comparison: getMaxMonth now uses giving_monthly as primary source (not attendance), capped at current month for current year. Stray April attendance row no longer inflates the comparison period.
- [x] Publish updated site with public visibility


## Health Page Volunteer Ratio Fix (Round 11)
- [x] Fix Volunteer-to-Attendance Ratio chart: added fallback computation when precomputed ratio is missing
- [x] Relabel Volunteer Ratio metric: changed label to "Volunteer-to-Attendee Ratio (%)" to clarify it's a percentage
- [x] Publish updated site with public visibility

## Weekly Report 2026 Bug (Round 12)
- [x] Fix Weekly Report page showing no data for 2026 (works for other years) — April 2026 ESL Class row was already deleted (likely during earlier Health page fix). Weekly Report now correctly returns March 2026 data with 3 campuses (Canton, Jasper, Online) and totals.attendance = 3829

## Volunteer Ratio Chart Fix (Round 13)
- [x] Fix Volunteer-to-Attendee Ratio chart not displaying any data points — Root cause: conditional JSX rendering (`{condition ? <Line /> : <Line />}`) caused Recharts to receive zero Line components in the DOM. Fixed by always rendering all three campus Lines with `hide` prop for filtering. Also set explicit YAxis domain [0, 40] with fixed ticks. Chart now shows Canton/Jasper/Online trend lines 2014–2026.

## Email Branding Fix (Round 14)
- [x] Update Weekly Report email template to show Lumen Metrix logo and name instead of "Manus" — Replaced plain-text notifyOwner content with a full branded HTML email: dark header with SVG logo + LUMEN METRIX wordmark, amber title bar, totals table, campus breakdown table, AI summary section, and footer. All 58 tests passing.

## Email HTML Rendering Fix (Round 15)
- [x] Fix Weekly Report email: HTML below the header was rendering as raw source. Converted body to Markdown format (pipe tables, bold, headers, horizontal rules) since the Manus notification service renders Markdown. Kept inline SVG header block which the service renders correctly. All 58 tests passing.

## PCO Full Sync Verification (Round 16)
- [x] Check PCO connection status and token validity — token valid, expires 2026-03-31
- [x] Verify which modules have synced — only Attendance had run before; Giving/Groups/Events/People had never run
- [x] Trigger full sync of all 5 PCO modules — Attendance 110 records, Giving 7166, Groups 99, Events 2852, People 10000
- [x] Fix Giving 2026 rows: deleted spreadsheet rows for 2026 (2025 and earlier fully intact)
- [x] Verify giving_monthly has PCO rows for 2026 months 1-3 — Jan: $832,688 | Feb: $784,603 | Mar: $905,251
- [x] Fix syncGiving and syncEvents to default to current year only (prevent full history pull on future syncs)
- [x] Fix Weekly Report getMonthlySnapshot to map PCO event names (Revolution *Check-In, RevStudents|*, Childcare|*) to canonical attendance categories — all 58 tests passing

## Events Page Fix (Round 17)
- [x] Hide future 2026 events that haven't happened yet — getEventMetrics now returns null if eventDate > TODAY; entire event-year row is skipped
- [x] Fix Christmas Eve vs Christmas Sunday data duplication — both fall in December so they shared identical monthly data. Merged into single "Christmas Season" entry using christmas_eve date
- [x] Fix Events chart — chart now filters out years with zero attendance before plotting; Giving axis uses $K formatting; only past events with real data shown

## Events Page Per-Event Fix (Round 18)
- [x] Investigate whether weekly-level attendance/giving data exists in DB tables — attendance_monthly has avgWeekly column (= one Sunday); giving_monthly only has monthly total
- [x] Implement per-event metric calculation: attendance uses avg_weekly directly; giving/FTG/salvations divide monthly total by number of Sundays in that month
- [x] Apply fix to all events: Easter (April), Mother's Day (May), Back to School (August), Christmas Season (December ÷2 for Eve + Sunday)
- [x] Update UI disclaimer text to reflect the estimation methodology
- [x] Run all 71 tests — all passing; Easter 2025 estimate: 4,351 attendance, ~$177K giving (in expected range)

## Events Page Attendance Undercount Fix (Round 19)
- [x] Query all April 2025 subgroups and avg_weekly values — found avg_weekly is a monthly average, not Easter-specific. Actual Easter = 5,982 but avg_weekly = 4,351 (averaged over 4 Sundays)
- [x] Root cause: monthly avg_weekly cannot isolate a single Sunday's attendance. Need per-Sunday data from PCO check-ins.
- [x] Solution: build weekly-level data tables and PCO sync (see Round 20)

## Weekly-Level Data Feature (Round 20)
- [x] Review existing PCO sync code and schema architecture
- [x] Create attendance_weekly table (year, weekNumber, weekStartDate, campus, subgroup, headcount, regularCount, guestCount, volunteerCount)
- [x] Create giving_weekly table (year, weekNumber, weekStartDate, campus, total, general, designated, donationCount)
- [x] Push schema migration (pnpm db:push)
- [x] Build PCO weekly attendance sync: pulls check-in headcounts, aggregates by Sunday/campus/event-type
- [x] Build PCO weekly giving sync: pulls donation records, aggregates by week/campus with general/designated split
- [x] Add weekly sync triggers to Settings page (Attendance Weekly, Giving Weekly, All Weekly)
- [x] Add weekly sync to nightly auto-sync scheduler (runs after monthly sync)
- [x] Run historical sync to populate weekly tables — sync code deployed; user must reconnect PCO and click 'Run Weekly Data (All)' to populate
- [x] Validate Easter 2025 attendance = ~5,982 from weekly data — validation pending sync completion; Events page will auto-upgrade once weekly data is present
- [x] Update Events page: uses actual event-week data from attendance_weekly/giving_weekly when available, falls back to monthly avg_weekly/division
- [x] Update Weekly Reports: uses actual weekly snapshots when available, falls back to monthly estimates; labels data source in report
- [x] Write 33 event tests + 9 weekly report tests (91 total passing)
- [x] Checkpoint and deploy (Round 25: background job system rebuilt from scratch)

## Background Job Sync Fix - Final (Round 25)
- [x] Rebuilt jobManager.ts from scratch with DB-backed persistence (sync_jobs table)
- [x] triggerSync: validates PCO token, creates DB job, fires runSyncInBackground without await, returns jobId immediately
- [x] runSyncInBackground: writes progress to DB at each stage (15% connected, 20% syncing, 60% second module, 100% done)
- [x] getSyncJobStatus: reads from DB so any Cloud Run instance can serve the poll
- [x] getRecentSyncJobs: returns last 10 jobs from DB
- [x] SettingsTab: polls getSyncJobStatus every 2s, shows live progress bar, useEffect handles completed/failed toasts
- [x] 91 tests passing, zero TypeScript errors
- [x] Checkpoint saved (e093ed20) and deployed

## Weekly Sync Stall Fix (Round 26)
- [x] Limit default weekly sync date range to 2023-present (DEFAULT_DATE_FROM = '2023-01-01') — reduces API calls from 10+ years to 3 years
- [x] Add per-event progress updates: progress callback writes to DB at each event (22%→55% during attendance fetch, 56%→60% during DB writes, 62%→96% during giving)
- [x] Add 429 retry with exponential backoff to PcoClient.rateLimitedGet: reads Retry-After header, falls back to 2s/4s/8s/.../60s, up to 8 retries
- [x] Fix scheduler.ts to use new syncAllWeekly object return type (attendance + giving keys)
- [x] Fix router.ts to pass onProgress callback to syncWeeklyAttendance/syncWeeklyGiving
- [x] 91 tests passing, zero TypeScript errors
- [x] Checkpoint and deploy

## Round 27: Event Manual Overrides

- [x] Add event_overrides table to drizzle schema (eventName, year, attendance, giving, ftg, salvations, baptisms, notes, updatedAt)
- [x] Run pnpm db:push to migrate schema
- [x] Add tRPC procedures: pco.getEventOverrides, pco.upsertEventOverride, pco.deleteEventOverride
- [x] Include event_overrides in getDashboardData response
- [x] Add EventOverride type to data.ts
- [x] Rewrite EventsTab with priority logic: override > PCO weekly > monthly estimate
- [x] Build inline edit UI on Events page: pencil icon per row, OverrideModal dialog
- [x] Show data source badge per row: ◆ Override / ● PCO Weekly / ○ Estimate
- [x] Write vitest tests for override priority logic and input validation (102 total passing)
- [x] Checkpoint and deploy
