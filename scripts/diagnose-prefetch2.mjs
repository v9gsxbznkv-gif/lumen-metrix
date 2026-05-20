/**
 * Diagnostic: Check if the pre-fetch headcounts contain event_time IDs
 * for the May 7 period (week 19). If not, the fallback is being triggered.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

async function getAccessToken() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const [rows] = await conn.execute('SELECT accessToken FROM pco_tokens LIMIT 1');
  await conn.end();
  return rows[0]?.accessToken;
}

async function pcoGet(path, token, params = {}) {
  const url = new URL(`https://api.planningcenteronline.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) throw new Error(`PCO ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function pcoGetAll(path, token, params = {}) {
  let allData = [];
  let url = `https://api.planningcenteronline.com${path}`;
  const searchParams = new URLSearchParams(params);
  searchParams.set('per_page', '100');
  url += '?' + searchParams.toString();
  
  while (url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) throw new Error(`PCO ${resp.status}`);
    const json = await resp.json();
    allData = allData.concat(json.data || []);
    url = json.links?.next || null;
  }
  return allData;
}

async function main() {
  const token = await getAccessToken();
  if (!token) { console.error('No PCO token found'); process.exit(1); }
  
  const eventId = '15287'; // Revolution Canton Check-In
  
  // Step 1: Get attendance type "1-Adults" (ID 143871)
  const attTypeId = '143871';
  
  // Step 2: Pre-fetch ALL headcounts for this attendance type (same as sync does)
  console.log('Fetching ALL headcounts for 1-Adults (pre-fetch simulation)...');
  const allHeadcounts = await pcoGetAll(
    `/check-ins/v2/events/${eventId}/attendance_types/${attTypeId}/headcounts`,
    token,
    { per_page: '100' }
  );
  
  console.log(`Total headcounts fetched: ${allHeadcounts.length}`);
  
  // Build the same map as the sync code
  const byEt = new Map();
  for (const hc of allHeadcounts) {
    const total = hc.attributes?.total || 0;
    if (total === 0) continue;
    const etId = hc.relationships?.event_time?.data?.id;
    if (!etId) continue;
    byEt.set(etId, (byEt.get(etId) || 0) + total);
  }
  console.log(`Unique event_time IDs in pre-fetch map: ${byEt.size}`);
  
  // Step 3: Get event_time IDs for the May 7 period (week 19)
  const may7PeriodId = '45396657';
  const may14PeriodId = '45556913';
  
  console.log('\n=== Period May 7 (Week 19) ===');
  const may7EventTimes = await pcoGetAll(
    `/check-ins/v2/events/${eventId}/event_periods/${may7PeriodId}/event_times`,
    token
  );
  const may7EtIds = may7EventTimes.map(et => et.id);
  console.log(`Event time IDs: ${may7EtIds.join(', ')}`);
  
  let may7Total = 0;
  for (const etId of may7EtIds) {
    const val = byEt.get(etId) || 0;
    console.log(`  ET ${etId}: ${val} (in pre-fetch: ${byEt.has(etId)})`);
    may7Total += val;
  }
  console.log(`Total from pre-fetch for week 19: ${may7Total}`);
  
  console.log('\n=== Period May 14 (Week 20) ===');
  const may14EventTimes = await pcoGetAll(
    `/check-ins/v2/events/${eventId}/event_periods/${may14PeriodId}/event_times`,
    token
  );
  const may14EtIds = may14EventTimes.map(et => et.id);
  console.log(`Event time IDs: ${may14EtIds.join(', ')}`);
  
  let may14Total = 0;
  for (const etId of may14EtIds) {
    const val = byEt.get(etId) || 0;
    console.log(`  ET ${etId}: ${val} (in pre-fetch: ${byEt.has(etId)})`);
    may14Total += val;
  }
  console.log(`Total from pre-fetch for week 20: ${may14Total}`);
  
  console.log('\n=== DIAGNOSIS ===');
  if (may7Total === may14Total) {
    console.log('BUG CONFIRMED: Pre-fetch returns same total for both periods');
    if (may7Total === 0) {
      console.log('Week 19 event_time IDs are NOT in the pre-fetch map -> fallback triggered');
    }
  } else {
    console.log(`Pre-fetch returns different totals: week 19=${may7Total}, week 20=${may14Total}`);
    console.log('Pre-fetch is working correctly - bug must be elsewhere');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
