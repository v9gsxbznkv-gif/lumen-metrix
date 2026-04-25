/**
 * Import Jasper kids room-level data and Student MS/HS data into attendance_weekly.
 * 
 * Steps:
 * 1. Delete old incomplete Jasper kids room rows (Kids: Jasper Nursery, Kids: Jasper Pre-K)
 * 2. Insert new comprehensive Jasper kids room rows (15 rooms)
 * 3. Insert Student MS/HS rows (Students: Canton MS, Students: Canton HS, etc.)
 * 4. Preserve all existing 2026 PCO data
 */
import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  
  // Load extracted data
  const jasperKids = JSON.parse(readFileSync("/home/ubuntu/jasper_kids_rooms.json", "utf8"));
  const students = JSON.parse(readFileSync("/home/ubuntu/students_ms_hs.json", "utf8"));
  
  console.log(`Loaded ${jasperKids.length} Jasper kids room rows`);
  console.log(`Loaded ${students.length} student MS/HS rows`);
  
  // 1. Delete old incomplete Jasper kids room rows (only from spreadsheet source)
  const [delResult] = await conn.execute(
    `DELETE FROM attendance_weekly WHERE campus = 'Jasper' AND subgroup LIKE 'Kids: Jasper%' AND source = 'spreadsheet'`
  );
  console.log(`Deleted ${delResult.affectedRows} old Jasper kids room rows`);
  
  // 2. Delete any existing student breakdown rows (to avoid duplicates on re-run)
  const [delStudents] = await conn.execute(
    `DELETE FROM attendance_weekly WHERE subgroup LIKE 'Students:%' AND source = 'spreadsheet'`
  );
  console.log(`Deleted ${delStudents.affectedRows} old student breakdown rows`);
  
  // 3. Insert Jasper kids room rows
  let insertedJK = 0;
  const batchSize = 500;
  
  for (let i = 0; i < jasperKids.length; i += batchSize) {
    const batch = jasperKids.slice(i, i + batchSize);
    const values = batch.map(r => [
      r.year, r.weekNumber, r.weekStartDate, r.campus, r.subgroup,
      r.headcount, 0, 0, 0, r.source
    ]);
    
    const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const flat = values.flat();
    
    await conn.execute(
      `INSERT INTO attendance_weekly (year, weekNumber, weekStartDate, campus, subgroup, headcount, regularCount, guestCount, volunteerCount, source) VALUES ${placeholders}`,
      flat
    );
    insertedJK += batch.length;
  }
  console.log(`Inserted ${insertedJK} Jasper kids room rows`);
  
  // 4. Insert Student MS/HS rows
  let insertedSt = 0;
  
  for (let i = 0; i < students.length; i += batchSize) {
    const batch = students.slice(i, i + batchSize);
    const values = batch.map(r => [
      r.year, r.weekNumber, r.weekStartDate, r.campus, r.subgroup,
      r.headcount, 0, 0, 0, r.source
    ]);
    
    const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const flat = values.flat();
    
    await conn.execute(
      `INSERT INTO attendance_weekly (year, weekNumber, weekStartDate, campus, subgroup, headcount, regularCount, guestCount, volunteerCount, source) VALUES ${placeholders}`,
      flat
    );
    insertedSt += batch.length;
  }
  console.log(`Inserted ${insertedSt} student MS/HS rows`);
  
  // 5. Verify
  const [jasperRooms] = await conn.query(
    `SELECT DISTINCT subgroup, COUNT(*) as cnt FROM attendance_weekly WHERE campus = 'Jasper' AND subgroup LIKE 'Kids: Jasper%' GROUP BY subgroup ORDER BY subgroup`
  );
  console.log("\n=== Jasper Kids Rooms in DB ===");
  console.table(jasperRooms);
  
  const [studentRows] = await conn.query(
    `SELECT DISTINCT subgroup, campus, COUNT(*) as cnt FROM attendance_weekly WHERE subgroup LIKE 'Students:%' GROUP BY subgroup, campus ORDER BY campus, subgroup`
  );
  console.log("\n=== Student Breakdown in DB ===");
  console.table(studentRows);
  
  // 6. Total row count
  const [[{ total }]] = await conn.query(`SELECT COUNT(*) as total FROM attendance_weekly`);
  console.log(`\nTotal attendance_weekly rows: ${total}`);
  
  await conn.end();
  console.log("\nDone!");
}

main().catch(console.error);
