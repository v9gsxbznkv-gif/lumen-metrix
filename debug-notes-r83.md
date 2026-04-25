# Round 83 Investigation Notes

## Key Findings

### Date Mismatch: attendance vs giving weekStartDate
- attendance_weekly week 16: weekStartDate = "2026-04-13" (Sunday)
- giving_weekly week 16: weekStartDate = "2026-04-19" (Saturday? or different anchor)
- This is the ROOT CAUSE for giving showing $0 — the weekly report queries by weekStartDate from attendance, but giving uses a different date

### Giving Data EXISTS
- giving_weekly has 204 rows total
- Week 16 has data: Canton $98,107.43, Jasper $37,649.11, All Campuses $82,537.43 + $682.53 designated
- BUT weekStartDate is "2026-04-19" not "2026-04-13"

### Salvations Data EXISTS but not for recent weeks
- Salvations stored as subgroup "RevStudents Salvations" in attendance_weekly
- Most recent: week 12 (Mar 16) — none for weeks 13-16
- This might be correct (no salvations those weeks) or PCO doesn't have the data

### Groups
- No groups_weekly table exists
- groups_monthly has data (from spreadsheet source)
- groups_annual has data
- pco_groups has 99 groups
- Weekly report probably needs to pull from groups_monthly for the current month

### Baptisms
- Need to check where baptisms come from — likely next_steps or next_steps_monthly table
