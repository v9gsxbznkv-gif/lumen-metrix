# Planning Center Online (PCO) API Integration Guide
## Lumen Metrix — Live Data Connection

---

## Overview

Planning Center Online exposes a comprehensive REST API that follows the [JSON:API spec](https://jsonapi.org/). All four data areas you need — **head counts, giving, groups, and events** — are available through separate API "apps," each with its own base URL and versioned endpoints. Authentication is shared across all apps using a single Personal Access Token (PAT) or OAuth 2.0 flow.

This guide covers everything needed to connect Lumen Metrix to PCO for live, automated data ingestion — replacing the manual spreadsheet workflow entirely.

---

## 1. Authentication

PCO supports two authentication methods. For a server-side integration like Lumen Metrix, **Personal Access Tokens** are the simplest path. OAuth 2.0 is required if you ever want to build a multi-church SaaS login flow.

### Personal Access Token (Recommended for Single-Church Use)

1. Go to [https://api.planningcenteronline.com/oauth/applications](https://api.planningcenteronline.com/oauth/applications)
2. Click **"New Personal Access Token"**
3. Give it a name (e.g., "Lumen Metrix Integration") and select the scopes you need:
   - `check_ins` — headcounts and attendance
   - `giving` — donations and funds
   - `groups` — small groups and memberships
   - `calendar` — events and event instances
   - `people` — person records (for giver/attendee counts)
4. Copy the **Application ID** and **Secret** — these are your credentials

All API requests use **HTTP Basic Auth** with the Application ID as the username and the Secret as the password:

```bash
curl -u APP_ID:SECRET https://api.planningcenteronline.com/check-ins/v2/events
```

In your Node.js/Python backend:

```typescript
// TypeScript / Node.js
const PCO_APP_ID = process.env.PCO_APP_ID;
const PCO_SECRET = process.env.PCO_SECRET;

const headers = {
  Authorization: `Basic ${Buffer.from(`${PCO_APP_ID}:${PCO_SECRET}`).toString('base64')}`,
  'Content-Type': 'application/json',
};
```

```python
# Python
import requests
import base64
import os

PCO_APP_ID = os.environ['PCO_APP_ID']
PCO_SECRET = os.environ['PCO_SECRET']

session = requests.Session()
session.auth = (PCO_APP_ID, PCO_SECRET)
```

### OAuth 2.0 (For Multi-Church SaaS)

If Lumen Metrix expands to serve multiple churches, each church authenticates via OAuth. PCO's OAuth flow is standard:
- Authorization URL: `https://api.planningcenteronline.com/oauth/authorize`
- Token URL: `https://api.planningcenteronline.com/oauth/token`
- Scopes: same as above

---

## 2. API Base URLs

Each PCO product has its own versioned base URL:

| Data Area | App | Base URL | Current Version |
|---|---|---|---|
| Head Counts / Attendance | Check-Ins | `https://api.planningcenteronline.com/check-ins/v2` | `2025-05-28` |
| Giving / Donations | Giving | `https://api.planningcenteronline.com/giving/v2` | `2019-10-18` |
| Small Groups | Groups | `https://api.planningcenteronline.com/groups/v2` | `2023-07-10` |
| Events / Calendar | Calendar | `https://api.planningcenteronline.com/calendar/v2` | `2022-07-07` |
| People / Members | People | `https://api.planningcenteronline.com/people/v2` | `2023-02-15` |

All responses are paginated (default 25 records, max 100). Use `?per_page=100&offset=N` to paginate through large datasets.

---

## 3. Head Counts (Check-Ins API)

The Check-Ins API is the authoritative source for weekly service attendance, replacing the manual spreadsheet entry. It tracks both **digital check-ins** (scanned badges) and **manual headcounts** entered by staff.

### Key Endpoints

| What You Need | Endpoint |
|---|---|
| List all events (services) | `GET /check-ins/v2/events` |
| Get event times for a service | `GET /check-ins/v2/events/{id}/event_times` |
| Get headcounts for a service time | `GET /check-ins/v2/event_times/{id}/headcounts` |
| Get individual check-ins | `GET /check-ins/v2/check_ins` |
| Filter by date range | `?where[created_at][gte]=2026-01-01T00:00:00Z` |

### Data Model

A **Headcount** is a tally of attendees for a given `EventTime` and `AttendanceType` (e.g., Adults, Kids, Students). This maps directly to what you currently track in your spreadsheets.

```json
{
  "type": "Headcount",
  "id": "12345",
  "attributes": {
    "total": 847,
    "created_at": "2026-03-23T09:00:00Z",
    "updated_at": "2026-03-23T11:30:00Z"
  },
  "relationships": {
    "event_time": { "data": { "type": "EventTime", "id": "98765" } },
    "attendance_type": { "data": { "type": "AttendanceType", "id": "111" } }
  }
}
```

### Practical Example: Weekly Attendance Pull

```python
import requests
from datetime import datetime, timedelta

BASE = "https://api.planningcenteronline.com/check-ins/v2"
AUTH = (PCO_APP_ID, PCO_SECRET)

def get_weekly_headcounts(event_id: str, week_start: str) -> dict:
    """Pull headcounts for all service times in a given week."""
    week_end = (datetime.fromisoformat(week_start) + timedelta(days=7)).isoformat()
    
    # Get all event times for this week
    r = requests.get(
        f"{BASE}/events/{event_id}/event_times",
        params={
            "where[starts_at][gte]": week_start,
            "where[starts_at][lte]": week_end,
            "include": "headcounts",
            "per_page": 100,
        },
        auth=AUTH,
    )
    data = r.json()
    
    totals = {}
    for event_time in data.get("data", []):
        time_id = event_time["id"]
        time_label = event_time["attributes"].get("name", time_id)
        
        # Get headcounts per attendance type for this time
        hc_r = requests.get(
            f"{BASE}/event_times/{time_id}/headcounts",
            params={"include": "attendance_type", "per_page": 100},
            auth=AUTH,
        )
        for hc in hc_r.json().get("data", []):
            att_type = hc["relationships"]["attendance_type"]["data"]["id"]
            totals[f"{time_label}_{att_type}"] = hc["attributes"]["total"]
    
    return totals
```

### Mapping to Lumen Metrix

| PCO Concept | Lumen Metrix Equivalent |
|---|---|
| `Event` | Service (e.g., "Sunday Worship") |
| `EventTime` | Service time (e.g., "9:00 AM", "11:00 AM") |
| `AttendanceType` | Demographic (Adults, Kids, Students) |
| `Headcount.total` | Weekly count per demographic |
| `Location` | Campus (Canton, Jasper) |

> **Note:** Filter events by `Location` to separate Canton and Jasper campus counts. The Online campus headcount is typically tracked separately via a streaming platform integration or manual entry.

---

## 4. Giving (Giving API)

The Giving API provides full access to donation records, fund designations, and batch summaries. This replaces the Canton Offering and Jasper Offering spreadsheet tabs.

### Key Endpoints

| What You Need | Endpoint |
|---|---|
| List all donations | `GET /giving/v2/donations` |
| Filter by date range | `?where[received_at][gte]=2026-01-01` |
| Filter by campus | `?where[campus_id]=123` |
| List all funds | `GET /giving/v2/funds` |
| Get fund designations per donation | `GET /giving/v2/donations/{id}/designations` |
| List batches (weekly envelopes) | `GET /giving/v2/batches` |
| Get donors (distinct givers count) | `GET /giving/v2/people` |

### Key Fields on a Donation

| Field | Description |
|---|---|
| `amount_cents` | Donation amount in cents (divide by 100 for dollars) |
| `received_at` | Date the donation was received — use this for weekly grouping |
| `payment_method` | `ach`, `cash`, `check`, or `card` |
| `payment_channel` | `web`, `mobile_app`, `admin`, `api`, `sms` |
| `payment_status` | `succeeded` = committed, `pending` = not yet committed |
| `refunded` | Boolean — exclude refunded donations from totals |

### Practical Example: Weekly Giving Summary

```python
def get_weekly_giving(start_date: str, end_date: str, campus_id: str = None) -> dict:
    """Pull total general and designated giving for a date range."""
    BASE_GIVING = "https://api.planningcenteronline.com/giving/v2"
    
    params = {
        "where[received_at][gte]": start_date,
        "where[received_at][lte]": end_date,
        "where[payment_status]": "succeeded",
        "include": "designations",
        "per_page": 100,
    }
    if campus_id:
        params["where[campus_id]"] = campus_id
    
    general_total = 0
    designated_total = 0
    offset = 0
    
    while True:
        params["offset"] = offset
        r = requests.get(f"{BASE_GIVING}/donations", params=params, auth=AUTH)
        data = r.json()
        donations = data.get("data", [])
        if not donations:
            break
        
        for donation in donations:
            if donation["attributes"]["refunded"]:
                continue
            amount = donation["attributes"]["amount_cents"] / 100
            
            # Check designations to split general vs. designated
            # (requires include=designations in the request)
            general_total += amount  # Simplified — use fund lookup for split
        
        offset += len(donations)
        if len(donations) < 100:
            break
    
    return {"general": general_total, "designated": designated_total}
```

### Unlocking Metrics Not in Spreadsheets

The Giving API enables metrics your spreadsheets cannot provide:

| New Metric | How to Compute |
|---|---|
| **Distinct Givers** | Count unique `person` relationships across donations in a period |
| **Average Gift Size** | `total_amount / distinct_givers` |
| **Giver Retention Rate** | Compare unique givers in period A vs. period B |
| **First-Time Givers** | Givers with no prior donation records |
| **Recurring vs. One-Time** | Filter by `recurring_donation` relationship presence |
| **Online vs. In-Person Giving** | Filter by `payment_channel` |
| **Giving by Fund** | Group by `fund` via `designations` endpoint |

---

## 5. Groups (Groups API)

The Groups API tracks small groups, their membership, and meeting attendance. This enables the "Group Participation" metrics referenced in the Kalon proposal.

### Key Endpoints

| What You Need | Endpoint |
|---|---|
| List all groups | `GET /groups/v2/groups` |
| Get group members | `GET /groups/v2/groups/{id}/memberships` |
| Get group meeting attendance | `GET /groups/v2/groups/{id}/events` |
| Filter by group type | `?where[group_type_id]=123` |
| Filter by campus | `?where[location_id]=456` |
| Get enrollment status | `GET /groups/v2/groups/{id}/enrollment` |

### Key Fields

| Field | Description |
|---|---|
| `Group.name` | Group name |
| `Group.members_count` | Current member count |
| `Group.schedule` | Meeting frequency |
| `GroupType.name` | Category (e.g., "Life Groups", "Men's", "Women's") |
| `Membership.role` | `member` or `leader` |
| `Attendance.headcount` | Number who attended a group meeting |
| `Enrollment.status` | `open`, `closed`, `full`, `request_to_join` |

### Practical Example: Group Health Summary

```python
def get_group_summary() -> list:
    """Pull all active groups with member counts and type."""
    BASE_GROUPS = "https://api.planningcenteronline.com/groups/v2"
    
    r = requests.get(
        f"{BASE_GROUPS}/groups",
        params={
            "include": "group_type,location",
            "where[archived_at]": "null",
            "per_page": 100,
        },
        auth=AUTH,
    )
    
    groups = []
    for group in r.json().get("data", []):
        groups.append({
            "id": group["id"],
            "name": group["attributes"]["name"],
            "members": group["attributes"]["members_count"],
            "schedule": group["attributes"]["schedule"],
        })
    return groups
```

---

## 6. Events (Calendar API)

The Calendar API tracks all church events — special services, classes (GriefShare, DivorceCare, Financial Peace), and campus events. This replaces the Events/Classes tracking in your spreadsheets.

### Key Endpoints

| What You Need | Endpoint |
|---|---|
| List all events | `GET /calendar/v2/events` |
| Get event instances (occurrences) | `GET /calendar/v2/event_instances` |
| Filter by date range | `?where[starts_at][gte]=2026-01-01` |
| Filter by tag (event type) | `?where[tag_ids]=123` |
| Get registrations | Use **Registrations API** (separate app) |

> **Important:** The Calendar API tracks scheduling and logistics. For **registration counts** (how many signed up for Welcome Lunch, Financial Peace, etc.), use the **Registrations API** at `https://api.planningcenteronline.com/registrations/v2`.

### Practical Example: Upcoming Events List

```python
def get_upcoming_events(days_ahead: int = 30) -> list:
    """Pull all events in the next N days."""
    BASE_CAL = "https://api.planningcenteronline.com/calendar/v2"
    from datetime import datetime, timedelta
    
    now = datetime.utcnow().isoformat() + "Z"
    future = (datetime.utcnow() + timedelta(days=days_ahead)).isoformat() + "Z"
    
    r = requests.get(
        f"{BASE_CAL}/event_instances",
        params={
            "where[starts_at][gte]": now,
            "where[starts_at][lte]": future,
            "include": "event",
            "order": "starts_at",
            "per_page": 100,
        },
        auth=AUTH,
    )
    
    events = []
    for instance in r.json().get("data", []):
        events.append({
            "name": instance["attributes"].get("name"),
            "starts_at": instance["attributes"]["starts_at"],
            "location": instance["attributes"].get("location"),
        })
    return events
```

---

## 7. Recommended Integration Architecture for Lumen Metrix

Given that Lumen Metrix is currently a static frontend, the PCO integration requires a **backend upgrade**. Here is the recommended architecture:

```
PCO API ──► Backend Sync Service ──► Database ──► Lumen Metrix API ──► Dashboard
              (Node.js/Python)        (Postgres)    (REST endpoints)     (React)
```

### Step-by-Step Implementation Plan

| Step | Action | Effort |
|---|---|---|
| **1. Upgrade to full-stack** | Use `webdev_add_feature` to add backend + database to Lumen Metrix | 1 hour |
| **2. Store PCO credentials** | Add `PCO_APP_ID` and `PCO_SECRET` as environment secrets | 5 min |
| **3. Build sync service** | Node.js cron job that pulls PCO data nightly and writes to Postgres | 1–2 days |
| **4. Create API routes** | Express endpoints that serve aggregated data to the React frontend | 1 day |
| **5. Replace static JSON** | Update `data.ts` to fetch from your API instead of the CDN JSON file | 2 hours |
| **6. Add webhooks** | Subscribe to PCO webhooks for real-time updates on donations and check-ins | 4 hours |

### Sync Frequency Recommendations

| Data Type | Recommended Sync | Reason |
|---|---|---|
| Donations | Every 15 minutes | Near real-time giving visibility |
| Headcounts | After each service (Sunday ~1 PM) | Staff enters counts post-service |
| Groups | Nightly | Membership changes are infrequent |
| Events/Calendar | Hourly | Event updates happen throughout the week |
| People | Nightly | Profile changes are low-frequency |

### PCO Webhooks (Real-Time Updates)

PCO supports webhooks for instant notifications when data changes. Subscribe at:
`POST https://api.planningcenteronline.com/webhooks/v2/subscriptions`

Available webhook events relevant to Lumen Metrix:

| Event | Trigger |
|---|---|
| `giving.v2.events.donation.created` | New donation received |
| `giving.v2.events.donation.updated` | Donation updated/refunded |
| `check_ins.v2.events.check_in.created` | New check-in recorded |
| `people.v2.events.person.created` | New person added to PCO |

---

## 8. Rate Limits & Pagination

PCO enforces rate limits to protect their API:

| Limit | Value |
|---|---|
| Requests per 20 seconds | 100 requests |
| Max records per page | 100 |
| Recommended page size | 100 |

For large historical pulls (e.g., all donations since 2014), implement exponential backoff and paginate with `offset`:

```python
def paginate_all(url: str, params: dict, auth: tuple) -> list:
    """Fetch all pages from a PCO endpoint."""
    results = []
    params = {**params, "per_page": 100, "offset": 0}
    
    while True:
        r = requests.get(url, params=params, auth=auth)
        r.raise_for_status()
        data = r.json()
        page = data.get("data", [])
        results.extend(page)
        
        # Check if there are more pages
        meta = data.get("meta", {})
        total = meta.get("total_count", 0)
        if len(results) >= total or len(page) < 100:
            break
        
        params["offset"] += 100
    
    return results
```

---

## 9. Getting Your PCO Credentials

To get started today:

1. Log into Planning Center at [https://app.planningcenteronline.com](https://app.planningcenteronline.com)
2. Go to **Profile → Developer → Personal Access Tokens**
   (direct URL: [https://api.planningcenteronline.com/oauth/applications](https://api.planningcenteronline.com/oauth/applications))
3. Click **"New Personal Access Token"**
4. Name it `Lumen Metrix` and check all four scopes: `check_ins`, `giving`, `groups`, `calendar`, `people`
5. Copy the **Application ID** and **Secret** — store them as environment variables, never in code

Once you have those credentials, the backend upgrade to Lumen Metrix can be completed and the live data pipeline can be activated.

---

## 10. What This Unlocks in Lumen Metrix

Connecting to PCO enables the following metrics that are currently unavailable from spreadsheet data alone:

| Metric | Currently Available | With PCO Integration |
|---|---|---|
| Weekly attendance by service time | Partial (manual entry) | Automatic, real-time |
| Giving by campus | Manual spreadsheet | Automatic, by campus |
| Distinct givers count | Not available | Available |
| Average gift size | Not available | Available |
| Giver retention rate | Not available | Available |
| First-time givers | Not available | Available |
| Small group participation | Not available | Available |
| Group leader-to-member ratio | Not available | Available |
| Event registration counts | Not available | Available |
| Kids check-in by room | Partial | Full room-by-room detail |
| Real-time Sunday dashboard | Not available | Available via webhooks |

---

## References

[1] Planning Center API Getting Started — https://developer.planning.center/docs/  
[2] PCO Giving API — Donation Endpoint — https://api.planningcenteronline.com/docs/apps/giving/versions/2019-10-18/vertices/donation  
[3] PCO Check-Ins API — Headcount Endpoint — https://api.planningcenteronline.com/docs/apps/check-ins/versions/2025-05-28/vertices/headcount  
[4] PCO Groups API — https://api.planningcenteronline.com/docs/apps/groups/versions/2023-07-10  
[5] PCO Calendar API — https://api.planningcenteronline.com/docs/apps/calendar/versions/2022-07-07  
[6] PCO Webhooks — https://api.planningcenteronline.com/docs/apps/webhooks  
[7] JSON:API Specification — https://jsonapi.org/
