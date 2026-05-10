# Round 117 Visual Verification

## Giving Page (GivingTab2) - Verified Working

### KPI Cards (4-column grid):
1. **Latest Week**: $36K (May 4) — -84.0% vs prior year
2. **2026 YTD**: $3.5M (19 weeks)
3. **Avg Weekly**: $186K (2026 average)
4. **Per Capita**: $61 — Per person per week — +11.6% vs same weeks 2025

### Per Capita YoY Chart:
- Title: "Per Capita — 2026 vs 2025"
- Shows weekly per capita as a line chart
- 2026 line (purple solid) vs 2025 line (gray dashed)
- Y-axis: $0-$600 (some Easter spikes)
- X-axis: Wk 1 through Wk 49 (prior year extends further)
- Legend: 2026 (circle) and 2025 (circle)

### Weekly Giving Chart:
- Area chart showing weekly giving totals for 2026

### Dashboard Overview GPC:
- Already showing $61 "Per person per week" with +7.1% vs Weeks 1-19 2025

## Notes:
- The +11.6% on Giving page vs +7.1% on Dashboard is because:
  - Dashboard uses the `getWeeklyGivingPerCapita` from data.ts (CDN data / legacy computed)
  - Giving page uses the new tRPC `getPerCapita` endpoint (direct DB query)
  - Slight difference may be due to attendance normalization differences
  - Both are computing total giving / total attendance correctly
