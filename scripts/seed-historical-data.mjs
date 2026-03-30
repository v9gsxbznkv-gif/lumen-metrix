/**
 * Seed Historical Data Migration
 * Loads church-data-v3.json and inserts all records into the MySQL database.
 * Run: node scripts/seed-historical-data.mjs
 */
import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import { config } from "dotenv";

config(); // Load .env

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// Parse the JSON data
const raw = JSON.parse(readFileSync("/tmp/church-data.json", "utf-8"));

async function main() {
  const conn = await createConnection(DATABASE_URL);
  console.log("Connected to database");

  try {
    // Clear existing spreadsheet data (preserves PCO data)
    console.log("Clearing existing spreadsheet data...");
    await conn.execute("DELETE FROM attendance WHERE source = 'spreadsheet'");
    await conn.execute("DELETE FROM attendance_monthly WHERE source = 'spreadsheet'");
    await conn.execute("DELETE FROM giving WHERE source = 'spreadsheet'");
    await conn.execute("DELETE FROM giving_monthly WHERE source = 'spreadsheet'");
    await conn.execute("DELETE FROM next_steps WHERE source = 'spreadsheet'");
    await conn.execute("DELETE FROM next_steps_monthly WHERE source = 'spreadsheet'");
    await conn.execute("DELETE FROM serving WHERE source = 'spreadsheet'");
    await conn.execute("DELETE FROM serving_monthly WHERE source = 'spreadsheet'");

    // 1. Attendance (annual)
    console.log(`Inserting ${raw.attendance.length} attendance records...`);
    for (const r of raw.attendance) {
      await conn.execute(
        "INSERT INTO attendance (year, campus, subgroup, avgWeekly, total, source) VALUES (?, ?, ?, ?, ?, 'spreadsheet')",
        [r.year, r.campus, r.subgroup, r.avg_weekly, r.total]
      );
    }

    // 2. Attendance Monthly
    console.log(`Inserting ${raw.attendance_monthly.length} attendance_monthly records...`);
    const attMonthlyBatch = [];
    for (const r of raw.attendance_monthly) {
      attMonthlyBatch.push([r.year, r.month, r.campus, r.subgroup, r.total, r.avg_weekly]);
    }
    // Batch insert in chunks of 100
    for (let i = 0; i < attMonthlyBatch.length; i += 100) {
      const chunk = attMonthlyBatch.slice(i, i + 100);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, 'spreadsheet')").join(", ");
      const values = chunk.flat();
      await conn.execute(
        `INSERT INTO attendance_monthly (year, month, campus, subgroup, total, avgWeekly, source) VALUES ${placeholders}`,
        values
      );
    }

    // 3. Giving (annual)
    console.log(`Inserting ${raw.giving.length} giving records...`);
    for (const r of raw.giving) {
      await conn.execute(
        "INSERT INTO giving (year, campus, general, designated, total, source) VALUES (?, ?, ?, ?, ?, 'spreadsheet')",
        [r.year, r.campus, r.general, r.designated, r.total]
      );
    }

    // 4. Giving Monthly
    console.log(`Inserting ${raw.giving_monthly.length} giving_monthly records...`);
    const givMonthlyBatch = [];
    for (const r of raw.giving_monthly) {
      givMonthlyBatch.push([r.year, r.month, r.campus, r.subgroup, r.total]);
    }
    for (let i = 0; i < givMonthlyBatch.length; i += 100) {
      const chunk = givMonthlyBatch.slice(i, i + 100);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, 'spreadsheet')").join(", ");
      const values = chunk.flat();
      await conn.execute(
        `INSERT INTO giving_monthly (year, month, campus, subgroup, total, source) VALUES ${placeholders}`,
        values
      );
    }

    // 5. Next Steps (annual)
    console.log(`Inserting ${raw.next_steps.length} next_steps records...`);
    for (const r of raw.next_steps) {
      await conn.execute(
        "INSERT INTO next_steps (year, campus, metric, total, source) VALUES (?, ?, ?, ?, 'spreadsheet')",
        [r.year, r.campus, r.metric, r.total]
      );
    }

    // 6. Next Steps Monthly
    console.log(`Inserting ${raw.next_steps_monthly.length} next_steps_monthly records...`);
    const nsMonthlyBatch = [];
    for (const r of raw.next_steps_monthly) {
      nsMonthlyBatch.push([r.year, r.month, r.campus, r.metric, r.count]);
    }
    for (let i = 0; i < nsMonthlyBatch.length; i += 100) {
      const chunk = nsMonthlyBatch.slice(i, i + 100);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, 'spreadsheet')").join(", ");
      const values = chunk.flat();
      await conn.execute(
        `INSERT INTO next_steps_monthly (year, month, campus, metric, count, source) VALUES ${placeholders}`,
        values
      );
    }

    // 7. Serving (annual)
    console.log(`Inserting ${raw.serving.length} serving records...`);
    for (const r of raw.serving) {
      await conn.execute(
        "INSERT INTO serving (year, campus, total, avgWeekly, source) VALUES (?, ?, ?, ?, 'spreadsheet')",
        [r.year, r.campus, r.total, r.avg_weekly]
      );
    }

    // 8. Serving Monthly
    console.log(`Inserting ${raw.serving_monthly.length} serving_monthly records...`);
    const srvMonthlyBatch = [];
    for (const r of raw.serving_monthly) {
      srvMonthlyBatch.push([r.year, r.month, r.campus, r.total]);
    }
    for (let i = 0; i < srvMonthlyBatch.length; i += 100) {
      const chunk = srvMonthlyBatch.slice(i, i + 100);
      const placeholders = chunk.map(() => "(?, ?, ?, ?, 'spreadsheet')").join(", ");
      const values = chunk.flat();
      await conn.execute(
        `INSERT INTO serving_monthly (year, month, campus, total, source) VALUES ${placeholders}`,
        values
      );
    }

    // Verify counts
    const tables = [
      "attendance", "attendance_monthly", "giving", "giving_monthly",
      "next_steps", "next_steps_monthly", "serving", "serving_monthly"
    ];
    console.log("\n=== Migration Summary ===");
    for (const table of tables) {
      const [rows] = await conn.execute(`SELECT COUNT(*) as cnt FROM ${table}`);
      console.log(`  ${table}: ${rows[0].cnt} records`);
    }

    console.log("\nMigration completed successfully!");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
