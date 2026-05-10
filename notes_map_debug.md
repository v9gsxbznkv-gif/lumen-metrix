# Map Debug - Round 121

## Findings from dev server:
- The map IS rendering with 954 members mapped (737 geocoded + some more completed since)
- There are 149 pending geocode still
- The AdvancedMarkerElements ARE present in the DOM (hundreds of gmp-advanced-marker elements)
- The numbered red/blue boxes in the screenshot are the browser tool's element annotations, NOT the actual dots
- The actual dots are 8px circles that may be too small to see at this zoom level
- The map is zoomed out to show all of Georgia, so the dots are clustered and tiny

## Issue:
The dots ARE there (I can see the marker elements in the DOM), but they may be:
1. Too small (8px) at the current zoom level
2. The opacity is 0.75 which makes them hard to see
3. They're all clustered on top of each other since most people are in Canton/Jasper area

## The user might be on production which may not have completed geocoding yet
- Production was just deployed, the geocoding was done on the dev DB
- Need to check if production DB has the same geocoded data (it should - same DB)
