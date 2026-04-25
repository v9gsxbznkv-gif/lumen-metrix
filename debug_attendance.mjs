import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check 2026 weekly attendance for recent weeks
const [rows2026] = await conn.execute(`
  SELECT year, weekNumber, weekStartDate, campus, subgroup, headcount 
  FROM attendance_weekly 
  WHERE year = 2026 AND weekNumber IN (14, 15, 16)
  ORDER BY weekNumber, campus, subgroup
`);
console.log('=== 2026 Weeks 14-16 ===');
for (const r of rows2026) {
  console.log(`  W${r.weekNumber} ${r.weekStartDate} | ${r.campus.padEnd(15)} | ${r.subgroup.padEnd(20)} | ${r.headcount}`);
}

// Check what subgroups exist
const [subgroups] = await conn.execute(`
  SELECT DISTINCT subgroup FROM attendance_weekly WHERE year = 2026 ORDER BY subgroup
`);
console.log('\n=== 2026 Subgroups ===');
for (const s of subgroups) console.log(`  ${s.subgroup}`);

// Check 2025 weekly attendance for a couple weeks
const [rows2025] = await conn.execute(`
  SELECT year, weekNumber, weekStartDate, campus, subgroup, headcount 
  FROM attendance_weekly 
  WHERE year = 2025 AND weekNumber IN (1, 2, 3)
  ORDER BY weekNumber, campus, subgroup
`);
console.log('\n=== 2025 Weeks 1-3 ===');
for (const r of rows2025) {
  console.log(`  W${r.weekNumber} ${r.weekStartDate} | ${r.campus.padEnd(15)} | ${r.subgroup.padEnd(20)} | ${r.headcount}`);
}

// Check what campuses exist per year
const [campuses] = await conn.execute(`
  SELECT DISTINCT year, campus FROM attendance_weekly ORDER BY year, campus
`);
console.log('\n=== Campuses by Year ===');
let lastYear = 0;
for (const c of campuses) {
  if (c.year !== lastYear) { console.log(`  ${c.year}:`); lastYear = c.year; }
  console.log(`    ${c.campus}`);
}

// Check total headcount per week for 2026 (Total subgroup only)
const [totals2026] = await conn.execute(`
  SELECT weekNumber, weekStartDate, campus, headcount 
  FROM attendance_weekly 
  WHERE year = 2026 AND subgroup = 'Total'
  ORDER BY weekNumber, campus
`);
console.log('\n=== 2026 Weekly Totals (subgroup=Total) ===');
for (const r of totals2026) {
  console.log(`  W${r.weekNumber} ${r.weekStartDate} | ${r.campus.padEnd(15)} | ${r.headcount}`);
}

// Now check what the dataViews endpoint would return
const [allWeekly] = await conn.execute(`
  SELECT weekNumber, weekStartDate, campus, subgroup, headcount 
  FROM attendance_weekly 
  WHERE year = 2026
  ORDER BY weekNumber, campus, subgroup
  LIMIT 50
`);
console.log('\n=== First 50 rows of 2026 attendance_weekly ===');
for (const r of allWeekly) {
  console.log(`  W${r.weekNumber} ${r.weekStartDate} | ${r.campus.padEnd(15)} | ${r.subgroup.padEnd(20)} | ${r.headcount}`);
}

await conn.end();
