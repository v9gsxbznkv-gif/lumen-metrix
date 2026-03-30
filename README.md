# Lumen Metrix — Church Analytics Dashboard

> **"Lumen" means light.** Lumen Metrix illuminates the path forward through measurement and clarity.

A professional executive-level analytics dashboard for multi-site churches, built on 12 years of historical data (2014–2026). Designed for church leaders who value brevity, clarity, and actionable insights.

---

## Overview

Lumen Metrix consolidates attendance, giving, next steps, volunteer, and event data from Google Sheets into a single interactive dashboard. All data is extracted directly from raw campus tab sheets for maximum accuracy and traceability.

**Live data coverage:** Revolution Church — Canton, Jasper, and Online campuses, 2014–2026 YTD.

---

## Features

### Dashboard Pages (13 total)

| Page | Description |
|---|---|
| **Dashboard** | 6 KPIs with partial-year-aware YoY comparisons, attendance and giving trend charts |
| **People** | Assimilation funnel (FTG → Salvation → Baptism → Steward), multi-year trends |
| **Giving** | Tithes, offerings, GPC analysis, general vs designated, campus comparison |
| **Attendance** | Weekly averages, demographic breakdown (Adults, Kids, Students), monthly patterns |
| **Volunteers** | Volunteer counts, ratios, trends, campus breakdown |
| **Events** | Easter, Christmas, Mother's Day, Back to School — multi-year event performance |
| **Visitors** | First-time guest tracking, conversion rates, campus comparison |
| **Campuses** | Side-by-side campus scorecards, radar chart, share table |
| **Compare** | Event-to-event and month-to-month comparisons across years |
| **Health** | Organizational health scoring: growth rate, volunteer ratio, GPC, FTG rate |
| **Reports** | Custom report builder with section selection, preview, PDF export, and scheduling |
| **AI Analyst** | Natural language chat interface for data queries |
| **Settings** | Church profile, data source info, and integrity notes |

### Key Capabilities

- **Partial-year awareness** — 2026 YTD auto-detected; Q1 2026 compares against Q1 2025 (not full-year 2025)
- **Campus filters** — All Campuses, Canton, Jasper, Online
- **Year range filters** — 2014–2026
- **Event comparisons** — Easter 2024 vs Easter 2025, Christmas, Mother's Day, and more
- **Assimilation funnel** — FTG → Salvation → Baptism → Stewardship with conversion rates
- **Volunteer-to-Attendee ratios** — per campus and combined
- **Giving Per Capita** — weekly and annual, by campus and combined

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Charts | Recharts 2 |
| Routing | Wouter |
| Build | Vite 7 |
| Package Manager | pnpm |
| Fonts | DM Sans, DM Mono, Inter (Google Fonts) |

---

## Project Structure

```
church-dashboard/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── tabs/          # 13 dashboard page components
│   │   │   ├── DashboardHeader.tsx
│   │   │   ├── KpiCard.tsx
│   │   │   ├── LumenLogo.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── contexts/
│   │   │   └── DataContext.tsx
│   │   ├── lib/
│   │   │   ├── churchCalendar.ts   # Event dates (Easter, Christmas, etc.)
│   │   │   └── data.ts             # Data types, loaders, helpers
│   │   ├── pages/
│   │   │   └── Home.tsx
│   │   ├── App.tsx
│   │   ├── index.css              # Lumen Metrix brand theme
│   │   └── main.tsx
│   ├── index.html
│   └── public/
├── brand-guidelines.md            # Full brand identity documentation
├── PROPOSAL_GAP_ANALYSIS.md       # Feature comparison vs Kalon proposal
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Installation

```bash
# Clone the repository
git clone https://github.com/v9gsxbznkv-gif/lumen-metrix.git
cd lumen-metrix

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

The dashboard will be available at `http://localhost:3000`.

### Build for Production

```bash
pnpm build
pnpm start
```

---

## Data Architecture

All church metrics data is served from a CDN-hosted JSON file built from 12 Google Sheets workbooks (2014–2026). The data pipeline:

1. **Raw extraction** — Python scripts read exclusively from campus-specific tab sheets (not History/Summary sheets which contain broken formulas)
2. **Cleaning** — Deduplication, Kids double-counting fix, partial-year detection
3. **Assembly** — Single `dashboard_data.json` with annual and monthly records per campus
4. **Computed fields** — Giving Per Capita, Volunteer Ratios, and Assimilation Rates calculated client-side

### Known Data Notes

- 2013 and 2015 data is not available (missing source spreadsheets)
- 2020–2021 serving data may be incomplete due to COVID-19 volunteer tracking changes
- 2026 data is YTD (January–March)
- Online campus tracking began in 2020
- Jasper campus launched in 2017

---

## Brand Identity

**Lumen Metrix** brand system:

- **Primary color:** Amber `#E8913A` — warmth, light, energy
- **Background:** Deep charcoal `#0F0E0D` — focus, depth
- **Campus colors:** Canton `#E8913A`, Jasper `#4A7FB5`, Online `#7B6FA0`
- **Fonts:** DM Sans (headings), Inter (body), DM Mono (numbers)

Full brand guidelines: [`brand-guidelines.md`](./brand-guidelines.md)

---

## Roadmap

- [ ] Planning Center Online (PCO) API integration for distinct givers, member counts, check-ins
- [ ] Backend upgrade for actual email delivery of scheduled reports
- [ ] Real-time data refresh automation
- [ ] Small group / community group analytics
- [ ] Mobile-responsive layout improvements

---

## License

Private — Revolution Church / Lumen Metrix. All rights reserved.
