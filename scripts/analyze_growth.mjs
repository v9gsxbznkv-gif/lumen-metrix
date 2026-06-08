import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Get 2026 weekly data
const [rows2026] = await conn.execute(`
  SELECT weekNumber, campus, subgroup, headcount
  FROM attendance_weekly
  WHERE year = 2026
  AND cancelled = 0
  ORDER BY weekNumber, campus, subgroup
`);

// Get 2025 weekly data (same weeks as 2026)
const maxWeek2026 = Math.max(...rows2026.map(r => r.weekNumber));
console.log('Max week in 2026:', maxWeek2026);

const [rows2025] = await conn.execute(`
  SELECT weekNumber, campus, subgroup, headcount
  FROM attendance_weekly
  WHERE year = 2025
  AND weekNumber <= ?
  AND cancelled = 0
  ORDER BY weekNumber, campus, subgroup
`, [maxWeek2026]);

function computeAvgWeekly(rows, label) {
  // Deduplication sets
  const hasCheckIn = new Set();
  const hasStudentsDetail = new Set();
  
  for (const r of rows) {
    if (r.subgroup === 'Revolution Canton Check-In' || r.subgroup === 'Revolution Jasper Check-In') {
      hasCheckIn.add(`${r.weekNumber}-${r.campus}`);
    }
    if (r.subgroup === 'RevStudents HS' || r.subgroup === 'RevStudents MS') {
      hasStudentsDetail.add(`${r.weekNumber}-${r.campus}`);
    }
  }
  
  // Sum per week (Adults+Kids only = "Total" as used by getAvgAttendanceFromWeekly)
  const weekMapTotal = new Map();
  // Sum per week (Adults+Kids+Students+YA = what annual row represents)
  const weekMapFull = new Map();
  
  for (const r of rows) {
    const key = `${r.weekNumber}-${r.campus}`;
    
    // Adults/Check-In (deduplicated)
    const isAdult = (r.subgroup === 'Adults' && !hasCheckIn.has(key)) ||
                    r.subgroup === 'Revolution Canton Check-In' ||
                    r.subgroup === 'Revolution Jasper Check-In';
    
    // Kids (aggregate only, not room-level)
    const isKids = r.subgroup === 'Kids';
    
    // Students (deduplicated)
    const isStudents = (r.subgroup === 'RevStudents Attendance' && !hasStudentsDetail.has(key)) ||
                       r.subgroup === 'RevStudents HS' || r.subgroup === 'RevStudents MS' ||
                       r.subgroup === 'Students';
    
    // YA Gathering
    const isYA = r.subgroup === 'YA Gathering';
    
    if (isAdult || isKids) {
      weekMapTotal.set(r.weekNumber, (weekMapTotal.get(r.weekNumber) || 0) + r.headcount);
    }
    if (isAdult || isKids || isStudents || isYA) {
      weekMapFull.set(r.weekNumber, (weekMapFull.get(r.weekNumber) || 0) + r.headcount);
    }
  }
  
  const totalsTotal = Array.from(weekMapTotal.values());
  const totalsFull = Array.from(weekMapFull.values());
  
  const avgTotal = totalsTotal.length > 0 ? totalsTotal.reduce((s, v) => s + v, 0) / totalsTotal.length : 0;
  const avgFull = totalsFull.length > 0 ? totalsFull.reduce((s, v) => s + v, 0) / totalsFull.length : 0;
  
  console.log(`\n=== ${label} ===`);
  console.log(`Adults+Kids avg_weekly: ${Math.round(avgTotal)} (${totalsTotal.length} weeks)`);
  console.log(`Adults+Kids+Students+YA avg_weekly: ${Math.round(avgFull)} (${totalsFull.length} weeks)`);
  
  return { avgTotal, avgFull };
}

const result2026 = computeAvgWeekly(rows2026, '2026 (all weeks YTD)');
const result2025 = computeAvgWeekly(rows2025, `2025 (weeks 1-${maxWeek2026})`);

console.log('\n=== GROWTH RATE COMPARISON ===');
console.log('Using Adults+Kids only (current getAvgAttendanceFromWeekly behavior):');
const growthTotal = result2025.avgTotal > 0 ? ((result2026.avgTotal - result2025.avgTotal) / result2025.avgTotal) * 100 : 0;
console.log(`  2026: ${Math.round(result2026.avgTotal)}, 2025 same-period: ${Math.round(result2025.avgTotal)}, Growth: ${growthTotal.toFixed(1)}%`);

console.log('\nUsing Adults+Kids+Students+YA (what annual row represents):');
const growthFull = result2025.avgFull > 0 ? ((result2026.avgFull - result2025.avgFull) / result2025.avgFull) * 100 : 0;
console.log(`  2026: ${Math.round(result2026.avgFull)}, 2025 same-period: ${Math.round(result2025.avgFull)}, Growth: ${growthFull.toFixed(1)}%`);

console.log('\nAnnual row values (for reference):');
console.log('  2026 annual avg_weekly: 3968');
console.log('  2025 annual avg_weekly: 3951');
console.log('  Full year growth (2025 vs 2026 YTD): N/A - different time periods');

await conn.end();
