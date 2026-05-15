# Volunteer Check-In Analysis

## Current State
- Kids room data IS being captured from location_event_times (12 subgroups in 2026)
- The room-level code path (lines 824-898) IS executing successfully
- BUT: zero "Volunteer Check-Ins" subgroup rows exist in attendance_weekly
- The log output shows rooms (Nursery, Pre-K, Cove, etc.) but NEVER mentions volunteer check-ins

## Root Cause
The volunteer check-in capture code (lines 860-865) checks:
```
if (VOLUNTEER_LOCATIONS.has(trimmedName) || trimmedName.toLowerCase() === "team member")
```

But the log shows NO volunteer check-in messages like:
```
[PCO Weekly Sync]   Revolution Canton Check-In 2026-XX-XX volunteer check-ins: NNN
```

This means EITHER:
1. The PCO location names don't match our VOLUNTEER_LOCATIONS set (case sensitivity, different names)
2. The volunteer locations have 0 regular_count + 0 guest_count (total=0, so they're counted but the count is 0)
3. Volunteers don't check in through the Check-Ins system at Revolution Church

## Key Question for Chad
Does Revolution Church use PCO Check-Ins for volunteer check-in? Or do volunteers only get scheduled through PCO Services?

If volunteers don't check in through Check-Ins, then:
- Scheduled = PCO Services plan_people_count (the only data we have)
- Checked In = doesn't exist in PCO data
- We should show single "Team Members" column with the Services count
