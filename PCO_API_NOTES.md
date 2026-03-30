# PCO API Endpoint Notes

## Headcount Endpoints (Check-Ins v2)
- GET `/check-ins/v2/headcounts` — list all headcounts
- GET `/check-ins/v2/headcounts/{id}` — read one
- GET `/check-ins/v2/event_times/{event_time_id}/headcounts` — headcounts for an event time
- GET `/check-ins/v2/events/{event_id}/attendance_types/{attendance_type_id}/headcounts` — headcounts by attendance type

## Headcount attributes
- `total` (integer)
- `created_at`, `updated_at` (date_time)

## Headcount relationships
- `event_time` (EventTime, to_one)
- `attendance_type` (AttendanceType, to_one)

## Can include
- `attendance_type`
- `event_time`

## Key issue: Our sync code calls `/check-ins/v2/events` then `/check-ins/v2/events/{id}/event_times`
## Then `/check-ins/v2/event_times/{id}/headcounts`
## These all look correct based on the API docs.

## The 404 is likely NOT from the PCO API endpoints themselves.
## It's probably from our tRPC route not being found on the deployed server.
## The sync mutation is at `pco.triggerSync` which goes through `/api/trpc/pco.triggerSync`
