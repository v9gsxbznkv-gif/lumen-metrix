import 'dotenv/config';
import { getDb } from './server/db.ts';
import { attendanceWeekly } from './drizzle/schema.ts';
import { eq, and } from 'drizzle-orm';

const d = await getDb();

// Get week 16 2026 data
const rows = await d.select().from(attendanceWeekly)
  .where(and(eq(attendanceWeekly.year, 2026), eq(attendanceWeekly.weekNumber, 16)));

console.log('Week 16 2026 raw rows:', rows.length);
const bySubgroup = {};
for (const r of rows) {
  const key = r.campus + ' | ' + r.subgroup;
  bySubgroup[key] = (bySubgroup[key] || 0) + r.headcount;
}
console.log('By campus|subgroup:');
for (const [k,v] of Object.entries(bySubgroup).sort()) {
  console.log('  ', k, '=', v);
}

// Also check week 10 2025 for comparison
const rows2025 = await d.select().from(attendanceWeekly)
  .where(and(eq(attendanceWeekly.year, 2025), eq(attendanceWeekly.weekNumber, 10)));

console.log('\nWeek 10 2025 raw rows:', rows2025.length);
const bySubgroup2 = {};
for (const r of rows2025) {
  const key = r.campus + ' | ' + r.subgroup;
  bySubgroup2[key] = (bySubgroup2[key] || 0) + r.headcount;
}
console.log('By campus|subgroup:');
for (const [k,v] of Object.entries(bySubgroup2).sort()) {
  console.log('  ', k, '=', v);
}

// Now test the normalization logic
const PCO_CHECKIN_SUBGROUPS = [
  "Revolution Canton Check-In",
  "Revolution Jasper Check-In",
  "Revolution Online Check-In",
];

function classifySubgroup(subgroup) {
  if (PCO_CHECKIN_SUBGROUPS.includes(subgroup) || subgroup === "Adults") return "Adults";
  if (subgroup === "Kids" || subgroup.startsWith("Kids:") || subgroup.startsWith("Kids ")) return "Kids";
  if (["RevStudents HS", "RevStudents MS", "RevStudents Attendance", "Students"].includes(subgroup) ||
      subgroup.startsWith("RevStudents |")) return "Students";
  if (subgroup === "Online") return "Online";
  if (subgroup === "Volunteers") return "Volunteers";
  if (["YA Gathering", "Young Adults"].includes(subgroup)) return "Young Adults";
  if (["FTG Adults", "FTG Kids", "RevStudents FTG", "YA FTG", "FTG"].includes(subgroup)) return "FTG";
  return null;
}

console.log('\n=== NORMALIZED 2026 Week 16 ===');
const normalized = {};
for (const r of rows) {
  const cat = classifySubgroup(r.subgroup);
  const key = r.campus + ' | ' + (cat || 'UNCLASSIFIED: ' + r.subgroup);
  normalized[key] = (normalized[key] || 0) + r.headcount;
}
for (const [k,v] of Object.entries(normalized).sort()) {
  console.log('  ', k, '=', v);
}

console.log('\n=== NORMALIZED 2025 Week 10 ===');
const normalized2 = {};
for (const r of rows2025) {
  const cat = classifySubgroup(r.subgroup);
  const key = r.campus + ' | ' + (cat || 'UNCLASSIFIED: ' + r.subgroup);
  normalized2[key] = (normalized2[key] || 0) + r.headcount;
}
for (const [k,v] of Object.entries(normalized2).sort()) {
  console.log('  ', k, '=', v);
}

process.exit(0);
