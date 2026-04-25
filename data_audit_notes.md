# Data Audit Notes — Page Rebuild

## Available Data by Table

### attendance_weekly
- 2025: 1 week only (Dec 29), 9 rows
- 2026: 16 weeks, 257 rows (PCO sync)
- NO historical weekly data pre-2025

### attendance_monthly  
- 2014-2026: Rich monthly data from spreadsheets + PCO
- Fields: year, month, campus, subgroup, headcount, source
- Subgroups include: Adults, Kids, Students, Online, FTG Adults, FTG Kids, Volunteers, etc.

### giving_weekly
- 2025: 1 week only (Dec 29), 3 rows
- 2026: 16 weeks, 48 rows (PCO sync)
- NO historical weekly data pre-2025

### giving_monthly
- 2012-2026: Monthly data from spreadsheets + PCO
- Fields: year, month, campus, subgroup (General/Designated), total, source

### next_steps_monthly
- 2014-2026: Monthly data
- Fields: year, month, campus, metric (FTG, Salvations, Baptisms, etc.), count, source

### serving_monthly
- 2014-2026: Monthly data
- Fields: year, month, campus, total, source

### groups_monthly
- 2025-2026: Monthly data
- Fields: year, month, campus, activeGroups, totalMembers, totalLeaders, avgAttendance

### groups_annual
- 2014-2026: Annual data
- Fields: year, campus, activeGroups, totalMembers, totalLeaders, avgAttendance

## Key Insight
- **Weekly data only exists for 2026** (from PCO sync)
- **Pre-2026 data is monthly** (from spreadsheet imports)
- Pages need to handle BOTH: weekly view for 2026, monthly view for all years
- For pre-2026 years, weekly toggle should either be disabled or show "monthly data only"

## Monthly Bucketing Rule
- Week belongs to the month of its weekStartDate (Sunday)
- Example: Sunday April 5 → April, Sunday March 29 → March
