# PCO API Findings

## Check-Ins API
- Endpoint: `GET /check-ins/v2/events` — confirmed correct
- Event associations: `/check-ins/v2/events/{event_id}/event_periods`
- Event times: `/check-ins/v2/events/{event_id}/current_event_times`
- Headcounts: `/check-ins/v2/event_times/{event_time_id}/headcounts`

## Key issue
The endpoint paths in our sync.ts look correct according to the API docs.
The 404 might be caused by:
1. The API version header not being sent
2. The access token not having proper scopes
3. The organization not having Check-Ins enabled

## API Versioning
PCO supports `X-PCO-API-Version` header with `YYYY-MM-DD` format.
User's app has Check-Ins version: 2025-05-28
