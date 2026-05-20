/**
 * Diagnostic: Check if PCO event_time IDs are unique per period or shared.
 * This will tell us why the pre-fetch strategy produces duplicate data.
 */
import 'dotenv/config';

// We need to use the PCO client to make authenticated requests
const PCO_APP_ID = process.env.PCO_APP_ID;
const PCO_SECRET = process.env.PCO_SECRET;

// Import the DB to get the access token
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function getAccessToken() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const [rows] = await conn.execute('SELECT accessToken FROM pco_tokens LIMIT 1');
  await conn.end();
  return rows[0]?.accessToken;
}

async function pcoGet(path, token) {
  const url = `https://api.planningcenteronline.com${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) throw new Error(`PCO ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function main() {
  const token = await getAccessToken();
  if (!token) { console.error('No PCO token found'); process.exit(1); }
  
  // Get Revolution Canton Check-In event
  const eventsResp = await pcoGet('/check-ins/v2/events?per_page=100', token);
  const cantonEvent = eventsResp.data.find(e => e.attributes?.name === 'Revolution Canton Check-In');
  if (!cantonEvent) { console.error('Canton event not found'); process.exit(1); }
  
  const eventId = cantonEvent.id;
  console.log(`Canton Event ID: ${eventId}`);
  
  // Get last 3 event_periods (most recent weeks)
  const periodsResp = await pcoGet(
    `/check-ins/v2/events/${eventId}/event_periods?per_page=3&order=-starts_at`,
    token
  );
  
  console.log('\n=== Last 3 Event Periods ===');
  for (const period of periodsResp.data) {
    const periodId = period.id;
    const startsAt = period.attributes?.starts_at;
    console.log(`\nPeriod ${periodId} (${startsAt}):`);
    
    // Get event_times for this period
    const etResp = await pcoGet(
      `/check-ins/v2/events/${eventId}/event_periods/${periodId}/event_times?per_page=25`,
      token
    );
    
    const etIds = etResp.data.map(et => et.id);
    console.log(`  Event Time IDs: [${etIds.join(', ')}]`);
    console.log(`  Event Times: ${etResp.data.map(et => `${et.id}(${et.attributes?.starts_at})`).join(', ')}`);
  }
  
  // Now check: get attendance_types for the event
  const attTypesResp = await pcoGet(
    `/check-ins/v2/events/${eventId}/attendance_types?per_page=25`,
    token
  );
  console.log('\n=== Attendance Types ===');
  for (const at of attTypesResp.data) {
    console.log(`  ${at.id}: ${at.attributes?.name}`);
  }
  
  // Pick the first attendance type (likely "1-Adults") and fetch its headcounts
  const firstAttType = attTypesResp.data[0];
  if (firstAttType) {
    console.log(`\n=== Headcounts for "${firstAttType.attributes?.name}" (last 10) ===`);
    const hcResp = await pcoGet(
      `/check-ins/v2/events/${eventId}/attendance_types/${firstAttType.id}/headcounts?per_page=10&order=-updated_at`,
      token
    );
    for (const hc of hcResp.data) {
      const total = hc.attributes?.total;
      const etId = hc.relationships?.event_time?.data?.id;
      const updatedAt = hc.attributes?.updated_at;
      console.log(`  HC id=${hc.id} total=${total} event_time_id=${etId} updated=${updatedAt}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
