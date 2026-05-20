import dotenv from "dotenv";
dotenv.config();

const PCO_APP_ID = process.env.PCO_APP_ID;
const PCO_SECRET = process.env.PCO_SECRET;

// Get token from DB
import mysql from "mysql2/promise";
const db = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await db.execute("SELECT accessToken FROM pco_tokens LIMIT 1");
const token = rows[0]?.accessToken;
if (!token) { console.log("No token"); process.exit(1); }

async function pcoGet(path) {
  const url = `https://api.planningcenteronline.com${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

// Canton Check-In event ID
const eventsResp = await pcoGet("/check-ins/v2/events?per_page=100");
const cantonEvent = eventsResp.data.find(e => e.attributes.name === "Revolution Canton Check-In");
if (!cantonEvent) { console.log("Canton event not found"); process.exit(1); }
console.log(`Canton Check-In event ID: ${cantonEvent.id}`);

// Get attendance types for this event
const attTypesResp = await pcoGet(`/check-ins/v2/events/${cantonEvent.id}/attendance_types?per_page=100`);
const onlineAttType = attTypesResp.data.find(at => at.attributes.name === "6-Online");
if (!onlineAttType) { console.log("6-Online att type not found"); process.exit(1); }
console.log(`6-Online attendance_type ID: ${onlineAttType.id}`);

// Get headcounts for 6-Online (this is what the pre-fetch does)
const hcsResp = await pcoGet(`/check-ins/v2/events/${cantonEvent.id}/attendance_types/${onlineAttType.id}/headcounts?per_page=100`);
console.log(`\n6-Online headcounts: ${hcsResp.data.length} entries`);

// Get the event_time IDs that have Online data
const onlineEventTimeIds = new Set();
for (const hc of hcsResp.data) {
  const etId = hc.relationships?.event_time?.data?.id;
  const total = hc.attributes?.total || 0;
  if (etId && total > 0) {
    onlineEventTimeIds.add(etId);
    console.log(`  event_time ${etId}: total=${total}`);
  }
}

// Now get periods for the date range and their event_times
const periodsResp = await pcoGet(`/check-ins/v2/events/${cantonEvent.id}/event_periods?per_page=10&order=-starts_at`);
console.log(`\nRecent periods:`);
for (const period of periodsResp.data.slice(0, 5)) {
  const startDate = period.attributes.starts_at?.split("T")[0];
  console.log(`\n  Period ${period.id} (${startDate}):`);
  
  // Get event_times for this period
  const etResp = await pcoGet(`/check-ins/v2/events/${cantonEvent.id}/event_periods/${period.id}/event_times?per_page=25`);
  for (const et of etResp.data) {
    const startsAt = et.attributes.starts_at;
    const hasOnline = onlineEventTimeIds.has(et.id);
    console.log(`    event_time ${et.id} (${startsAt}) ${hasOnline ? "← HAS ONLINE DATA" : ""}`);
  }
}

await db.end();
