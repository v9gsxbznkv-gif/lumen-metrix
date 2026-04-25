# Round 84 Investigation Notes

## Giving Week 16 - DUPLICATE ROWS!
Multiple rows per campus for the same weekNumber+year:
- Canton: 51907.66, 98332.57, 46199.77 (3 rows!)
- Jasper: 25773.24, 37649.11, 11875.87 (3 rows!)
- All Campuses: 682.53, 298.42, 682.53, 384.11 (4 rows!)

The query sums ALL rows → massively inflated giving.
The sync is appending new rows instead of replacing old ones.
The LATEST row (most recent createdAt) should be the correct one.

FIX: The weekly report should use the LATEST row per campus per week, not sum all rows.
OR: The sync should delete old rows before inserting new ones.

## Groups Monthly March 2026
- Canton: avgAttendance=689 (this is group attendance, not headcount)
- Jasper: avgAttendance=200
- Total: 889

The weekly report shows "Groups" as avgAttendance. Is this what Chad expects?
Groups = 889 seems like the right number from the spreadsheet data.

## Young Adults Week 16
- Only 1 row: "YA Gathering" headcount=15 under "Other" campus
- The weekly report shows 15 — this seems correct?
- Chad says it's wrong — need to understand what the expected number is.

## Online — FOUND IT!
- Canton subgroup "Online" headcount=554
- This is a manual headcount from Canton
- Currently NOT displayed in the weekly report at all
- Need to add "Online" as a new metric in CampusWeeklyMetrics

## Summary of fixes needed:
1. GIVING: Deduplicate — use only the latest row per campus per weekNumber+year
2. GROUPS: Verify what number Chad expects (avgAttendance? activeGroups? totalMembers?)
3. YOUNG ADULTS: Verify expected number
4. ONLINE: Add new metric from "Online" subgroup in attendance_weekly
