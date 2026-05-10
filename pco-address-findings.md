# PCO Address API Findings

## Address Attributes (from API docs)
- `city` - string
- `country_code` - string
- `country_name` - string
- `created_at` - date_time
- `id` - primary_key
- `location` - string (e.g., "Home", "Work")
- `primary` - boolean
- `state` - string
- `street` - string  <-- THIS IS THE FIELD
- `updated_at` - date_time
- `zip` - string

## Key Endpoints
- GET `/people/v2/addresses` - List ALL addresses in org
- GET `/people/v2/people/{person_id}/addresses` - Get addresses for a specific person

## Important: Order By fields include `street_line_1` and `street_line_2`
This suggests the `street` field may contain multi-line data (line 1 + line 2 combined).

## Current Problem
- The DB has `street = "NULL"` (string) for all 2,230 geocoded people
- This means PCO returned addresses with city/state/zip but empty/null street
- OR the code is not correctly extracting the street field from the response

## Bulk Fetch Option
- We can GET `/people/v2/addresses` to fetch ALL addresses at once
- Then match by person relationship
- This is much more efficient than per-person calls
- Can also use `/people/v2/people?include=addresses` for bulk fetch with includes
