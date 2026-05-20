from datetime import date, timedelta

# 2026 calendar
# Jan 1 = Thursday
# First Sunday = Jan 4
# Week 2 starts = Jan 5 (Monday)

jan1 = date(2026, 1, 1)
print(f"Jan 1 2026 is: {jan1.strftime('%A')}")  # Thursday

# First Sunday
first_sunday = date(2026, 1, 4)  # Jan 4 is Sunday
print(f"First Sunday: {first_sunday} ({first_sunday.strftime('%A')})")

# Week 2 starts Monday after first Sunday
week2_start = date(2026, 1, 5)
print(f"Week 2 start: {week2_start} ({week2_start.strftime('%A')})")

print("\n=== PCO Period starts_at dates (UTC) ===")
# PCO periods from diagnostic:
# Period 45396657: starts_at 2026-05-07T23:00:00Z
# Period 45556913: starts_at 2026-05-14T23:00:00Z
# 
# In ET (UTC-4): May 7 23:00 UTC = May 7 19:00 ET
# So ET date is still May 7

# The JS code does:
# 1. Convert to ET using Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York'})
# 2. Build a local date from the ET components
# 3. Find the Monday of that week

# May 7 2026 is THURSDAY (not Wednesday as I assumed)
may7 = date(2026, 5, 7)
print(f"May 7 is: {may7.strftime('%A')}")

# JS getDay() for Thursday = 4
# daysToMonday = 4 - 1 = 3
# weekStart = May 7 - 3 = May 4 (Monday)
week_start_may7 = may7 - timedelta(days=may7.weekday())  # Python weekday: Mon=0
print(f"May 7 -> weekStart = {week_start_may7} ({week_start_may7.strftime('%A')})")

# getISOWeekNumber for May 4:
days_since_week2 = (week_start_may7 - week2_start).days
week_num = 2 + days_since_week2 // 7
print(f"May 4 -> daysSinceWeek2 = {days_since_week2}, weekNumber = {week_num}")

print()
# May 14 2026
may14 = date(2026, 5, 14)
print(f"May 14 is: {may14.strftime('%A')}")
week_start_may14 = may14 - timedelta(days=may14.weekday())
print(f"May 14 -> weekStart = {week_start_may14} ({week_start_may14.strftime('%A')})")
days_since_week2_14 = (week_start_may14 - week2_start).days
week_num_14 = 2 + days_since_week2_14 // 7
print(f"May 11 -> daysSinceWeek2 = {days_since_week2_14}, weekNumber = {week_num_14}")

print()
# The event_times from diagnostic:
# Period May 7: event_times at May 10 15:15, May 10 13:30, May 10 12:00, May 7 23:00
# Period May 14: event_times at May 17 15:15, May 17 13:30, May 17 12:00, May 14 23:00

# But wait - the code processes each event_time's starts_at independently?
# NO - it processes the PERIOD's starts_at to determine the week.
# Line 658: const startsAt = attrs?.starts_at;  (this is the PERIOD's starts_at)
# Line 661: const date = new Date(startsAt);
# Line 662: const sunday = getSunday(date);

# So the period's starts_at determines the week for ALL headcounts in that period.
# Period May 7 -> week 19 (start May 4)
# Period May 14 -> week 20 (start May 11)

# This is correct. So WHY does the DB show week 19 = 2142?

# Let me check: maybe the issue is with the pre-fetch.
# The pre-fetch fetches ALL headcounts for the event, indexed by event_time ID.
# Then for each period, it gets that period's event_time IDs and looks them up.
#
# From the diagnostic:
# Period May 7 event_time IDs: [58466383, 58466382, 58466355, 58466324]
# Period May 14 event_time IDs: [58674500, 58674474, 58674439, 58674411]
#
# These are DIFFERENT IDs. So the pre-fetch lookup should return different values.
# Period May 7 should get: 906 + 958 + 295 + 222 = 2381
# Period May 14 should get: 743 + 868 + 242 + 289 = 2142
#
# This is CORRECT. So the pre-fetch should work.
#
# Unless... the pre-fetch is only fetching the MOST RECENT headcounts (pagination issue?)
# or the event_time IDs for period May 7 are not in the pre-fetch map.

# WAIT - I just realized something. The pre-fetch uses paginateAll which fetches ALL pages.
# But the headcounts endpoint might return results ordered by updated_at or created_at.
# If there are 20+ weeks of data, that's 80+ headcount entries per attendance_type.
# paginateAll with per_page=100 should get them all in one page.

# Let me think about this differently.
# The diagnostic showed only 10 headcounts (we limited to 10).
# But paginateAll would get ALL of them.
# 
# If the pre-fetch correctly has all event_time IDs mapped to their headcounts,
# AND the period's event_time IDs are unique per period,
# THEN the lookup should return correct values.
#
# UNLESS: The issue is that for period May 7, the event_times endpoint returns
# DIFFERENT IDs than what the pre-fetch has indexed.
# 
# This could happen if:
# 1. The event_times for a period change over time (unlikely)
# 2. There's a timing issue where new event_times are created after the pre-fetch
# 3. The pre-fetch is using a different endpoint path
#
# Actually, let me look at the pre-fetch endpoint again:
#   /check-ins/v2/events/{eventId}/attendance_types/{attTypeId}/headcounts
#
# And the period event_times endpoint:
#   /check-ins/v2/events/{eventId}/event_periods/{periodId}/event_times
#
# The headcounts are linked to event_times via relationships.
# If the pre-fetch correctly indexes ALL headcounts by their event_time ID,
# and the period correctly returns its event_time IDs,
# the lookup should work.
#
# CONCLUSION: The bug might not be in the pre-fetch at all.
# It might be that the FALLBACK is being triggered for period May 7
# (because its event_time IDs aren't in the pre-fetch map),
# and the fallback is somehow returning wrong data.
#
# OR: The pre-fetch is working but the period May 7 event_times endpoint
# is returning WEEK 20's event_time IDs instead of its own.
#
# I need to add logging to understand what's actually happening during the sync.

print("\n=== CONCLUSION ===")
print("Week assignments are correct (May 7 -> week 19, May 14 -> week 20)")
print("Event time IDs ARE unique per period")
print("Pre-fetch logic SHOULD work correctly")
print("")
print("The bug must be in one of:")
print("1. The pre-fetch map doesn't contain week 19's event_time IDs")
print("   (so fallback is triggered, and fallback has a bug)")
print("2. The period's event_times endpoint returns wrong IDs for older periods")
print("3. There's a race condition or caching issue")
print("")
print("MOST LIKELY: The fallback path (line 739) is being triggered for week 19")
print("because the pre-fetch doesn't have its event_time IDs, and the fallback")
print("is returning week 20's data due to a PCO API quirk or caching.")
print("")
print("SAFEST FIX: Remove the pre-fetch entirely and always use per-period")
print("event_time drill-down. This is slower but guaranteed correct.")
