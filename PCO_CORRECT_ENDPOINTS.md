# Correct PCO Check-Ins API Endpoints

## Event hierarchy:
- Event → has many EventPeriods (weeks/recurrences)
- EventPeriod → has many EventTimes (actual service times)
- EventTime → has many Headcounts

## Correct endpoint paths:
- GET /check-ins/v2/events - List all events ✅
- GET /check-ins/v2/events/{event_id}/event_periods - List event periods ✅
- GET /check-ins/v2/events/{event_id}/current_event_times - Current event times ✅
- GET /check-ins/v2/events/{event_id}/event_labels - Event labels

## WRONG in our code:
- `/check-ins/v2/events/{event_id}/event_times` ← THIS DOES NOT EXIST! Returns 404!

## The fix:
- Use `/check-ins/v2/events/{event_id}/event_periods` to get periods
- Then use event_periods to get event_times
- OR use headcounts directly from event_periods

## Headcount access:
- GET /check-ins/v2/event_times/{event_time_id}/headcounts
- Need to go: events → event_periods → event_times → headcounts
