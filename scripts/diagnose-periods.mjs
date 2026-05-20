/**
 * Diagnostic: Check how many PCO periods map to each week number.
 * If multiple periods map to the same week, the last one processed wins (overwrites).
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

async function pcoGetAll(path, token, params = {}) {
  let allData = [];
  let url = `https://api.planningcenteronline.com${path}`;
  const searchParams = new URLSearchParams(params);
  if (!searchParams.has('per_page')) searchParams.set('per_page', '100');
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

// Replicate the getWeekStart logic from weeklySync.ts
function getWeekStart(date) {
  // Convert to ET
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const etParts = etFormatter.formatToParts(date);
  const etYear = parseInt(etParts.find(p => p.type === 'year').value);
  const etMonth = parseInt(etParts.find(p => p.type === 'month').value) - 1;
  const etDay = parseInt(etParts.find(p => p.type === 'day').value);
  const d = new Date(etYear, etMonth, etDay, 0, 0, 0, 0);

  const jan1 = new Date(etYear, 0, 1, 0, 0, 0, 0);
  const jan1Day = jan1.getDay();
  const firstSunday = new Date(jan1);
  if (jan1Day !== 0) {
    firstSunday.setDate(1 + (7 - jan1Day));
  }

  if (d.getTime() <= firstSunday.getTime()) {
    return jan1;
  }

  const day = d.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - daysToMonday);
  return d;
}

function getISOWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1, 0, 0, 0, 0);
  const jan1Day = jan1.getDay();
  let firstSunday;
  if (jan1Day === 0) {
    firstSunday = new Date(jan1);
  } else {
    firstSunday = new Date(year, 0, 1 + (7 - jan1Day), 0, 0, 0, 0);
  }
  if (d.getTime() <= firstSunday.getTime()) return 1;
  const week2Start = new Date(firstSunday);
  week2Start.setDate(firstSunday.getDate() + 1);
  const daysSinceWeek2 = Math.floor((d.getTime() - week2Start.getTime()) / 86400000);
  return 2 + Math.floor(daysSinceWeek2 / 7);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function main() {
  const token = await getAccessToken();
  if (!token) { console.error('No PCO token found'); process.exit(1); }
  
  const eventId = '15287'; // Revolution Canton Check-In
  
  // Fetch ALL periods for 2026
  console.log('Fetching all event periods for Canton Check-In (2026)...');
  const periods = await pcoGetAll(
    `/check-ins/v2/events/${eventId}/event_periods`,
    token,
    { 
      per_page: '100',
      order: '-starts_at',
      'where[starts_at][gte]': '2026-04-01',
      'where[starts_at][lte]': '2026-05-31'
    }
  );
  
  console.log(`Found ${periods.length} periods in Apr-May 2026\n`);
  
  // Map each period to its week number
  const weekMap = new Map(); // weekNumber -> [periods]
  
  for (const period of periods) {
    const startsAt = period.attributes?.starts_at;
    if (!startsAt) continue;
    
    const date = new Date(startsAt);
    const weekStart = getWeekStart(date);
    const weekStartDate = formatDate(weekStart);
    const weekNumber = getISOWeekNumber(weekStart);
    
    if (!weekMap.has(weekNumber)) weekMap.set(weekNumber, []);
    weekMap.get(weekNumber).push({
      periodId: period.id,
      startsAt,
      weekStartDate,
      weekNumber
    });
  }
  
  // Print results
  for (const [weekNum, periods] of [...weekMap.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`Week ${weekNum} (start ${periods[0].weekStartDate}):`);
    for (const p of periods) {
      console.log(`  Period ${p.periodId}: starts_at=${p.startsAt}`);
    }
    if (periods.length > 1) {
      console.log(`  ⚠️  MULTIPLE PERIODS IN SAME WEEK - last one processed will overwrite!`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
