import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check if Online campus has weekly data
const [rows] = await conn.execute(`
  SELECT DISTINCT campus, subgroup
  FROM attendance_weekly
  WHERE year = 2026 AND campus = 'Online'
  LIMIT 20
`);
console.log('=== Online campus in weekly data ===');
console.table(rows);

// Check the annual attendance table for Online
const [rows2] = await conn.execute(`
  SELECT year, campus, subgroup, avgWeekly, total
  FROM attendance
  WHERE campus = 'Online' AND year = 2026
`);
console.log('=== Online annual rows ===');
console.table(rows2);

// Check what campus='Canton' subgroup='Online' looks like in weekly
const [rows3] = await conn.execute(`
  SELECT DISTINCT campus, subgroup
  FROM attendance_weekly
  WHERE year = 2026 AND subgroup = 'Online'
  LIMIT 20
`);
console.log('=== Online subgroup in weekly data ===');
console.table(rows3);

await conn.end();
