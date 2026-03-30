# Kalon Creative Proposal vs Lumen Metrix — Feature Gap Analysis

## Summary

The Kalon Creative proposal outlined a three-tier reporting platform (Core $55–65K, Enhanced $65–75K, Advanced $90–100K) built on Planning Center Online (PCO) API integration. Lumen Metrix has been built using the existing Google Sheets data and delivers the majority of the proposal's functionality at a fraction of the cost. This document details what has been implemented, what remains, and what requires external data sources.

---

## Feature Comparison

| Proposal Feature | Status | Notes |
|---|---|---|
| **Dashboard Overview** | Implemented | 6 KPIs with partial-year-aware YoY comparisons |
| **Sidebar Navigation** | Implemented | Matches proposal: Dashboard, People, Giving, Attendance, Volunteers, Events, Visitors, Campuses, Reports, AI Analyst, Settings |
| **Campus Filter** | Implemented | All Campuses, Canton, Jasper, Online |
| **Year Range Filter** | Implemented | 2014–2026 with partial-year detection |
| **Giving & Generosity** | Implemented | Annual tithes, GPC, general vs designated, campus comparison |
| **Average Gift Size** | Implemented | Computed from total giving / estimated weekly givers |
| **Attendance Tracking** | Implemented | Adults, Kids, Students, Young Adults, Online — weekly and monthly |
| **Volunteer Metrics** | Implemented | Dedicated page with ratios, trends, campus breakdown |
| **First-Time Guests** | Implemented | Dedicated Visitors page with conversion funnels |
| **Salvations & Baptisms** | Implemented | Tracked in People page and Overview KPIs |
| **Stewardship** | Implemented | Part of assimilation funnel |
| **Events Page** | Implemented | Easter, Christmas, Mother's Day, Back to School with multi-year comparison |
| **Campuses Page** | Implemented | Side-by-side scorecards, radar chart, share table |
| **Compare Tool** | Implemented | Event-to-event and month-to-month comparisons across years |
| **Health Metrics** | Implemented | Growth rate, volunteer ratio, GPC, FTG rate scoring |
| **Custom Reports** | Implemented | Builder with section selection, campus/year filters, preview, PDF export |
| **Scheduled Reports** | Partial | UI for scheduling (weekly/monthly/quarterly + email) — email delivery requires backend upgrade |
| **AI Analyst** | Implemented | Chat interface with natural language data queries, suggested questions |
| **Settings Page** | Implemented | Church profile, data source info, integrity notes |
| **Multi-Year Trends** | Implemented | 2014–2026 across all metrics |
| **Partial-Year Awareness** | Implemented | 2026 YTD auto-detected, Q1-to-Q1 comparisons |

---

## Features Requiring External Data (Not in Spreadsheets)

These features from the Kalon proposal require Planning Center Online (PCO) API integration or similar church management system data that is not present in the current Google Sheets:

| Feature | Data Source Needed | Proposal Tier |
|---|---|---|
| Distinct Givers Count | PCO Giving API | Core |
| Giver Retention % | PCO Giving API (donor tracking) | Core |
| Total Members | PCO People API | Core |
| Member Retention % | PCO People API (membership tracking) | Core |
| Check-Ins | PCO Check-Ins API | Core |
| Small Group Participation | PCO Groups API | Enhanced |
| Group Analytics | PCO Groups API | Enhanced |
| Community/Care Group Attendance | PCO Groups API | Enhanced |

---

## What Lumen Metrix Delivers vs Kalon Proposal Pricing

| Kalon Tier | Price | What It Includes | Lumen Metrix Coverage |
|---|---|---|---|
| Core | $55–65K + $7–9K/yr | Dashboard, PCO integration, basic KPIs | ~85% delivered (missing PCO-dependent metrics) |
| Enhanced | $65–75K + $7–9K/yr | Core + Groups, Scheduled Reports | ~75% delivered (missing Groups data) |
| Advanced | $90–100K + $10K+/yr | Enhanced + AI Analyst | ~80% delivered (AI Analyst built, missing PCO data) |

---

## Recommended Next Steps

1. **PCO API Integration** — Connect to Planning Center Online to unlock distinct givers, member counts, check-ins, and group analytics. This would close the remaining gaps with the Kalon proposal.

2. **Backend Upgrade** — Upgrade to full-stack to enable actual email delivery for scheduled reports and real-time data refresh from PCO.

3. **Custom Domain** — Publish to app.lumenmetrix.com for permanent access by the leadership team.

4. **Data Refresh Automation** — Set up periodic re-extraction from Google Sheets (or PCO) so the dashboard stays current without manual updates.
