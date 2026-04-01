/**
 * Check what locations (rooms) exist under Revolution Canton Check-In
 * and Revolution Jasper Check-In in PCO.
 * Uses the app's built-in token refresh mechanism.
 */
import { config } from "dotenv";
config();

import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get token and check if expired
const [rows] = await conn.execute("SELECT accessToken, refreshToken, expiresAt FROM pco_tokens ORDER BY id DESC LIMIT 1");
if (!rows.length) {
  console.error("No PCO token found");
  process.exit(1);
}

let token = rows[0].accessToken;
const expiresAt = new Date(rows[0].expiresAt);
const refreshToken = rows[0].refreshToken;

// If expired, refresh the token first
if (expiresAt < new Date()) {
  console.log("Token expired, refreshing...");
  // Use env vars like the app does (PCO_APP_ID and PCO_SECRET)
  const appId = process.env.PCO_APP_ID;
  const secret = process.env.PCO_SECRET;
  console.log('PCO_APP_ID from env:', appId?.substring(0, 15) + '...');
  console.log('PCO_SECRET from env:', secret?.substring(0, 15) + '...');

  const refreshRes = await fetch("https://api.planningcenteronline.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: appId,
      client_secret: secret,
    }),
  });

  if (!refreshRes.ok) {
    console.error("Token refresh failed:", await refreshRes.text());
    process.exit(1);
  }

  const refreshData = await refreshRes.json();
  token = refreshData.access_token;
  const newRefreshToken = refreshData.refresh_token || refreshToken;
  const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000);

  // Update the token in the database
  await conn.execute(
    "UPDATE pco_tokens SET accessToken = ?, refreshToken = ?, expiresAt = ? WHERE id = (SELECT id FROM (SELECT id FROM pco_tokens ORDER BY id DESC LIMIT 1) AS t)",
    [token, newRefreshToken, newExpiresAt]
  );
  console.log("Token refreshed successfully. New expiry:", newExpiresAt);
}

await conn.end();

const BASE = "https://api.planningcenteronline.com";

async function pcoGet(url, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const fullUrl = `${BASE}${url}${qs ? "?" + qs : ""}`;
  const res = await fetch(fullUrl, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`PCO API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Step 1: Get all check-in events
console.log("\nFetching all PCO check-in events...\n");
const eventsRes = await pcoGet("/check-ins/v2/events", { per_page: 100 });
const events = eventsRes.data;

// Find Revolution Canton Check-In and Revolution Jasper Check-In
const targetEvents = events.filter(e => {
  const name = e.attributes?.name || "";
  return name.includes("Revolution Canton Check-In") || name.includes("Revolution Jasper Check-In");
});

console.log(`Found ${targetEvents.length} target events:\n`);
for (const evt of targetEvents) {
  console.log(`  Event: "${evt.attributes.name}" (ID: ${evt.id})`);
}

// Step 2: For each target event, get its locations (rooms)
for (const evt of targetEvents) {
  const eventName = evt.attributes.name;
  const eventId = evt.id;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Locations under "${eventName}" (ID: ${eventId})`);
  console.log("=".repeat(60));

  const locsRes = await pcoGet(`/check-ins/v2/events/${eventId}/locations`, { per_page: 100 });
  const locations = locsRes.data;

  for (const loc of locations) {
    const attrs = loc.attributes;
    console.log(`\n  [${loc.id}] "${attrs.name}" — kind: ${attrs.kind}, position: ${attrs.position}`);

    // Check for child locations (sub-rooms)
    try {
      const childRes = await pcoGet(`/check-ins/v2/events/${eventId}/locations/${loc.id}/locations`, { per_page: 100 });
      if (childRes.data && childRes.data.length > 0) {
        for (const child of childRes.data) {
          const cAttrs = child.attributes;
          console.log(`    └─ [${child.id}] "${cAttrs.name}" — kind: ${cAttrs.kind}, position: ${cAttrs.position}`);

          // Check for grandchild locations
          try {
            const gcRes = await pcoGet(`/check-ins/v2/events/${eventId}/locations/${child.id}/locations`, { per_page: 100 });
            if (gcRes.data && gcRes.data.length > 0) {
              for (const gc of gcRes.data) {
                const gcAttrs = gc.attributes;
                console.log(`      └─ [${gc.id}] "${gcAttrs.name}" — kind: ${gcAttrs.kind}, position: ${gcAttrs.position}`);
              }
            }
          } catch (e) { /* no grandchildren */ }
        }
      }
    } catch (e) { /* no children */ }
  }
}

console.log("\n\nDone.");
