/**
 * Diagnostic: Check what volunteer check-in locations exist in PCO Check-Ins
 * and how many check-ins they have for recent weeks.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import mysql from "mysql2/promise";

// Connect to DB
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check what subgroups exist in attendance_weekly that contain "Volunteer" or "volunteer"
const [rows] = await conn.execute(
  `SELECT DISTINCT subgroup, source, year, COUNT(*) as cnt 
   FROM attendance_weekly 
   WHERE subgroup LIKE '%olunteer%' OR subgroup LIKE '%Team%' OR subgroup LIKE '%Check%'
   GROUP BY subgroup, source, year 
   ORDER BY year DESC, subgroup`
);
console.log("\n=== Volunteer-related subgroups in attendance_weekly ===");
console.table(rows);

// Check serving_weekly data
const [servingRows] = await conn.execute(
  `SELECT year, weekNumber, campus, total, scheduled, confirmed 
   FROM serving_weekly 
   WHERE year = 2026 
   ORDER BY weekNumber DESC 
   LIMIT 10`
);
console.log("\n=== serving_weekly 2026 (latest 10) ===");
console.table(servingRows);

// Check if the attendance sync is actually hitting the location_event_times endpoint
// by looking for any "Kids:" subgroups (those come from the same code path)
const [kidsRows] = await conn.execute(
  `SELECT DISTINCT subgroup, year, COUNT(*) as cnt 
   FROM attendance_weekly 
   WHERE subgroup LIKE 'Kids:%' AND year = 2026
   GROUP BY subgroup, year`
);
console.log("\n=== Kids room subgroups in 2026 (from same code path as volunteer check-ins) ===");
console.table(kidsRows);

await conn.end();
