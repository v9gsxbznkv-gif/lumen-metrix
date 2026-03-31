/**
 * PCO Sync Status Checker
 * Run with: pnpm tsx check-sync-status.mjs
 */
import { getDb } from "./server/db.ts";
import { syncLogs, pcoGroups, pcoEvents, pcoPeople, attendanceMonthly, givingMonthly, servingMonthly, nextStepsMonthly } from "./drizzle/schema.ts";
import { desc, eq, sql } from "drizzle-orm";

const db = await getDb();
if (!db) { console.error("DB not available"); process.exit(1); }

// 1. PCO tokens
console.log("\n=== PCO TOKEN STATUS ===");
try {
  const [tokens] = await db.execute(sql`SELECT id, access_token IS NOT NULL as has_token, expires_at, created_at FROM pco_tokens LIMIT 5`);
  if ((tokens as any[]).length === 0) {
    console.log("  No PCO tokens found — PCO has NOT been connected/authorized.");
  } else {
    for (const t of tokens as any[]) {
      const exp = new Date(t.expires_at);
      const isExpired = exp < new Date();
      console.log(`  Token ID: ${t.id} | Has token: ${t.has_token} | Expires: ${exp.toISOString()} | ${isExpired ? "EXPIRED" : "VALID"}`);
    }
  }
} catch (e: any) {
  console.log("  pco_tokens table error:", e.message);
}

// 2. Sync logs
console.log("\n=== RECENT SYNC LOGS (last 20) ===");
const logs = await db.select().from(syncLogs).orderBy(desc(syncLogs.completedAt)).limit(20);
if (logs.length === 0) {
  console.log("  No sync logs found — no syncs have been run yet.");
} else {
  for (const l of logs) {
    const status = l.status === "completed" ? "✅" : "❌";
    const err = l.errorMessage ? ` ERROR: ${l.errorMessage.substring(0, 80)}` : "";
    console.log(`  ${status} [${l.syncType}] processed=${l.recordsProcessed} created=${l.recordsCreated} updated=${l.recordsUpdated} | ${l.completedAt?.toISOString()}${err}`);
  }
}

// 3. Table row counts
console.log("\n=== TABLE ROW COUNTS ===");
const countTables = [
  { name: "attendance_monthly", table: attendanceMonthly },
  { name: "giving_monthly", table: givingMonthly },
  { name: "serving_monthly", table: servingMonthly },
  { name: "next_steps_monthly", table: nextStepsMonthly },
  { name: "pco_groups", table: pcoGroups },
  { name: "pco_events", table: pcoEvents },
  { name: "pco_people", table: pcoPeople },
];
for (const { name, table } of countTables) {
  const [row] = await db.select({ cnt: sql<number>`COUNT(*)` }).from(table);
  console.log(`  ${name}: ${row.cnt} rows`);
}

// 4. PCO-sourced rows for 2026
console.log("\n=== PCO-SOURCED ROWS FOR 2026 ===");
const pcoTables = [
  { name: "attendance_monthly", table: attendanceMonthly },
  { name: "giving_monthly", table: givingMonthly },
  { name: "serving_monthly", table: servingMonthly },
  { name: "next_steps_monthly", table: nextStepsMonthly },
];
for (const { name, table } of pcoTables) {
  const [row] = await db.select({ cnt: sql<number>`COUNT(*)` }).from(table).where(sql`source='pco' AND year=2026`);
  console.log(`  ${name} (pco, 2026): ${row.cnt} rows`);
}

process.exit(0);
