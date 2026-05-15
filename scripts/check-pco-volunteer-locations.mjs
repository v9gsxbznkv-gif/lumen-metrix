/**
 * Diagnostic: Query PCO Check-Ins API directly to see what volunteer locations
 * exist and whether they have check-in counts.
 * 
 * The issue: Kids room data IS being captured (Kids: Canton Babies, etc.)
 * but "Volunteer Check-Ins" subgroup has 0 rows. This means the VOLUNTEER_LOCATIONS
 * set isn't matching any actual location names in PCO.
 * 
 * Let's see what location names PCO actually returns for a recent event.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get PCO access token
const [tokens] = await conn.execute(
  `SELECT accessToken FROM pco_tokens WHERE id = 1`
);
if (!tokens.length) {
  console.log("No PCO tokens found");
  process.exit(1);
}
const { accessToken } = tokens[0];
if (!accessToken) {
  console.log("No access token");
  process.exit(1);
}

async function pcoGet(path) {
  const url = `https://api.planningcenteronline.com${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error(`PCO API error: ${res.status} ${res.statusText} for ${path}`);
    return null;
  }
  return res.json();
}

// Get recent Canton Check-In event
const eventsResult = await pcoGet("/check-ins/v2/events?per_page=50");
if (!eventsResult) process.exit(1);

console.log("\n=== PCO Check-In Events ===");
for (const ev of eventsResult.data) {
  console.log(`  ${ev.id}: ${ev.attributes.name}`);
}

// Find Canton Check-In event
const cantonEvent = eventsResult.data.find(e => e.attributes.name === "Revolution Canton Check-In");
if (!cantonEvent) {
  console.log("Canton Check-In event not found");
  process.exit(1);
}

// Get recent event periods for Canton
const periodsResult = await pcoGet(
  `/check-ins/v2/events/${cantonEvent.id}/event_periods?per_page=5&order=-starts_at`
);
if (!periodsResult) process.exit(1);

console.log(`\n=== Recent Canton Check-In Event Periods ===`);
for (const p of periodsResult.data) {
  console.log(`  ${p.id}: ${p.attributes.starts_at} → ${p.attributes.ends_at}`);
}

// Get the most recent period's event_times
const latestPeriod = periodsResult.data[0];
const timesResult = await pcoGet(
  `/check-ins/v2/event_periods/${latestPeriod.id}/event_times?per_page=50`
);
if (!timesResult) process.exit(1);

console.log(`\n=== Event Times for period ${latestPeriod.id} ===`);
for (const t of timesResult.data) {
  console.log(`  ${t.id}: ${t.attributes.name || "(no name)"} — starts: ${t.attributes.starts_at}`);
}

// For the first event_time, get ALL location_event_times with location names
const firstTime = timesResult.data[0];
const locResult = await pcoGet(
  `/check-ins/v2/event_times/${firstTime.id}/location_event_times?per_page=100&include=location`
);
if (!locResult) process.exit(1);

// Build location name map
const locationNames = new Map();
if (locResult.included) {
  for (const inc of locResult.included) {
    if (inc.type === "Location" && inc.attributes?.name) {
      locationNames.set(inc.id, inc.attributes.name);
    }
  }
}

console.log(`\n=== ALL Location Event Times for event_time ${firstTime.id} ===`);
console.log(`(These are the actual location names PCO returns)\n`);

let volunteerTotal = 0;
let nonVolunteerTotal = 0;

const VOLUNTEER_LOCATIONS = new Set([
  "Campus Safety", "Gathering Leaders", "Adult Worship & Production Team",
  "GROW Band", "Prayer Team Members", "First Time Guests/GROW Area",
  "General Operations", "Greeter", "Parking", "Usher", "Team Member Lounge",
  "Welcome Team Member", "FTG Gathering Leaders", "Welcome Team Coach",
  "Gathering Coordinator", "Campus Safety Leader", "Small Group Leader",
  "Stage Host", "Photography", "Videography", "RK Production", "RK Band",
  "Buddy Team", "Coach", "Team Leader", "Team Leaders", "RevKids Check-In",
  "Welcome Team Leaders", "Prayer Team", "Photo & Video Team",
  "RevStudents Team Member", "RevKids TEAM MEMBER", "Stage Host - K-5th",
  "Team Leader - K-5th", "WORSHIP & PRODUCTION TEAM MEMBERS", "RevKids Welcome Team",
]);

for (const let_ of locResult.data) {
  const regular = let_.attributes?.regular_count || 0;
  const guest = let_.attributes?.guest_count || 0;
  const total = regular + guest;
  const locId = let_.relationships?.location?.data?.id;
  const locName = locId ? locationNames.get(locId) : "(unknown)";
  const trimmedName = (locName || "").trim();
  
  const isVolunteer = VOLUNTEER_LOCATIONS.has(trimmedName) || trimmedName.toLowerCase() === "team member";
  
  if (isVolunteer) {
    volunteerTotal += total;
    console.log(`  ✅ VOLUNTEER: "${locName}" — regular: ${regular}, guest: ${guest}, total: ${total}`);
  } else {
    nonVolunteerTotal += total;
    console.log(`  ❌ NOT MATCHED: "${locName}" — regular: ${regular}, guest: ${guest}, total: ${total}`);
  }
}

console.log(`\n=== Summary ===`);
console.log(`Volunteer check-in total: ${volunteerTotal}`);
console.log(`Non-volunteer total: ${nonVolunteerTotal}`);
console.log(`Total locations: ${locResult.data.length}`);

await conn.end();
