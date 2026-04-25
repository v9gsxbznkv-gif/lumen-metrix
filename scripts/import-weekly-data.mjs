/**
 * Import extracted spreadsheet data into the weekly tables.
 *
 * This replaces all spreadsheet-sourced rows (source = 'spreadsheet')
 * in attendance_weekly, giving_weekly, serving_weekly, and next_steps_weekly,
 * then inserts the freshly extracted data.
 *
 * PCO-sourced rows (source = 'pco') are NOT touched.
 *
 * Usage: node scripts/import-weekly-data.mjs
 */
import { readFileSync } from "fs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DATA_DIR = "/home/ubuntu/extracted_data";

async function main() {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    connectTimeout: 30000,
  });

  console.log("Connected to database");

  try {
    // ============================================================
    // 1. Import attendance_weekly
    // ============================================================
    console.log("\n=== Importing attendance_weekly ===");
    const attendanceData = JSON.parse(readFileSync(`${DATA_DIR}/attendance_weekly.json`, "utf-8"));
    console.log(`  Loaded ${attendanceData.length} rows`);

    // Delete existing spreadsheet rows (preserve PCO rows and manually locked rows)
    const [delAtt] = await conn.execute(
      "DELETE FROM attendance_weekly WHERE source = 'spreadsheet' AND manualLock = 0"
    );
    console.log(`  Deleted ${delAtt.affectedRows} existing spreadsheet rows`);

    // Insert in batches
    const CHUNK = 100;
    let inserted = 0;
    for (let i = 0; i < attendanceData.length; i += CHUNK) {
      const chunk = attendanceData.slice(i, i + CHUNK);
      const values = chunk.map((r) => [
        r.year,
        r.weekNumber,
        r.weekStartDate,
        r.campus,
        r.subgroup,
        r.headcount,
        r.regularCount || r.headcount,
        r.guestCount || 0,
        r.volunteerCount || 0,
        "spreadsheet",
      ]);

      const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const flat = values.flat();

      await conn.execute(
        `INSERT INTO attendance_weekly (year, weekNumber, weekStartDate, campus, subgroup, headcount, regularCount, guestCount, volunteerCount, source)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           headcount = VALUES(headcount),
           regularCount = VALUES(regularCount),
           guestCount = VALUES(guestCount),
           volunteerCount = VALUES(volunteerCount),
           source = VALUES(source)`,
        flat
      );
      inserted += chunk.length;
      if (inserted % 500 === 0) console.log(`  ... ${inserted}/${attendanceData.length}`);
    }
    console.log(`  Inserted ${inserted} attendance rows`);

    // ============================================================
    // 2. Import giving_weekly
    // ============================================================
    console.log("\n=== Importing giving_weekly ===");
    const givingData = JSON.parse(readFileSync(`${DATA_DIR}/giving_weekly.json`, "utf-8"));
    console.log(`  Loaded ${givingData.length} rows`);

    const [delGiv] = await conn.execute(
      "DELETE FROM giving_weekly WHERE source = 'spreadsheet' AND manualLock = 0"
    );
    console.log(`  Deleted ${delGiv.affectedRows} existing spreadsheet rows`);

    inserted = 0;
    for (let i = 0; i < givingData.length; i += CHUNK) {
      const chunk = givingData.slice(i, i + CHUNK);
      const values = chunk.map((r) => [
        r.year,
        r.weekNumber,
        r.weekStartDate,
        r.campus,
        r.total,
        r.general,
        r.designated,
        r.donationCount || 0,
        "spreadsheet",
      ]);

      const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
      const flat = values.flat();

      await conn.execute(
        `INSERT INTO giving_weekly (year, weekNumber, weekStartDate, campus, total, general, designated, donationCount, source)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           total = VALUES(total),
           general = VALUES(general),
           designated = VALUES(designated),
           donationCount = VALUES(donationCount),
           source = VALUES(source)`,
        flat
      );
      inserted += chunk.length;
    }
    console.log(`  Inserted ${inserted} giving rows`);

    // ============================================================
    // 3. Import serving_weekly
    // ============================================================
    console.log("\n=== Importing serving_weekly ===");
    const servingData = JSON.parse(readFileSync(`${DATA_DIR}/serving_weekly.json`, "utf-8"));
    console.log(`  Loaded ${servingData.length} rows`);

    const [delServ] = await conn.execute(
      "DELETE FROM serving_weekly WHERE source = 'spreadsheet'"
    );
    console.log(`  Deleted ${delServ.affectedRows} existing spreadsheet rows`);

    inserted = 0;
    for (let i = 0; i < servingData.length; i += CHUNK) {
      const chunk = servingData.slice(i, i + CHUNK);
      const values = chunk.map((r) => [
        r.year,
        r.weekNumber,
        r.weekStartDate,
        r.campus,
        r.total,
        "spreadsheet",
      ]);

      const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
      const flat = values.flat();

      await conn.execute(
        `INSERT INTO serving_weekly (year, weekNumber, weekStartDate, campus, total, source)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           total = VALUES(total),
           source = VALUES(source)`,
        flat
      );
      inserted += chunk.length;
    }
    console.log(`  Inserted ${inserted} serving rows`);

    // ============================================================
    // 4. Import next_steps_weekly
    // ============================================================
    console.log("\n=== Importing next_steps_weekly ===");
    const nextStepsData = JSON.parse(readFileSync(`${DATA_DIR}/next_steps_weekly.json`, "utf-8"));
    console.log(`  Loaded ${nextStepsData.length} rows`);

    const [delNS] = await conn.execute(
      "DELETE FROM next_steps_weekly WHERE source = 'spreadsheet'"
    );
    console.log(`  Deleted ${delNS.affectedRows} existing spreadsheet rows`);

    inserted = 0;
    for (let i = 0; i < nextStepsData.length; i += CHUNK) {
      const chunk = nextStepsData.slice(i, i + CHUNK);
      const values = chunk.map((r) => [
        r.year,
        r.weekNumber,
        r.weekStartDate,
        r.campus,
        r.metric,
        r.count,
        "spreadsheet",
      ]);

      const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
      const flat = values.flat();

      await conn.execute(
        `INSERT INTO next_steps_weekly (year, weekNumber, weekStartDate, campus, metric, count, source)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           count = VALUES(count),
           source = VALUES(source)`,
        flat
      );
      inserted += chunk.length;
    }
    console.log(`  Inserted ${inserted} next steps rows`);

    // ============================================================
    // Summary
    // ============================================================
    console.log("\n=== Verification ===");
    const [attCount] = await conn.execute("SELECT COUNT(*) as cnt FROM attendance_weekly");
    const [givCount] = await conn.execute("SELECT COUNT(*) as cnt FROM giving_weekly");
    const [srvCount] = await conn.execute("SELECT COUNT(*) as cnt FROM serving_weekly");
    const [nsCount] = await conn.execute("SELECT COUNT(*) as cnt FROM next_steps_weekly");

    console.log(`  attendance_weekly: ${attCount[0].cnt} total rows`);
    console.log(`  giving_weekly: ${givCount[0].cnt} total rows`);
    console.log(`  serving_weekly: ${srvCount[0].cnt} total rows`);
    console.log(`  next_steps_weekly: ${nsCount[0].cnt} total rows`);

    // Check attendance by year
    const [attByYear] = await conn.execute(
      "SELECT year, COUNT(*) as cnt, COUNT(DISTINCT campus) as campuses, COUNT(DISTINCT subgroup) as subgroups FROM attendance_weekly GROUP BY year ORDER BY year"
    );
    console.log("\n  Attendance by year:");
    for (const row of attByYear) {
      console.log(`    ${row.year}: ${row.cnt} rows, ${row.campuses} campuses, ${row.subgroups} subgroups`);
    }

    // Check kids room subgroups
    const [kidsSubgroups] = await conn.execute(
      "SELECT DISTINCT subgroup FROM attendance_weekly WHERE subgroup LIKE 'Kids:%' ORDER BY subgroup"
    );
    console.log("\n  Kids room subgroups in DB:");
    for (const row of kidsSubgroups) {
      console.log(`    ${row.subgroup}`);
    }

    console.log("\n=== IMPORT COMPLETE ===");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("IMPORT FAILED:", err);
  process.exit(1);
});
