/**
 * Runs only the remaining PCO sync modules: Events + People
 * (Attendance, Giving, Groups already completed in the previous run)
 */
import { getDb } from "./server/db";
import { pcoGroups, pcoEvents, pcoPeople, givingMonthly, attendanceMonthly } from "./drizzle/schema";
import { sql } from "drizzle-orm";
import { createAuthenticatedPcoClient } from "./server/pco/client";
import { syncEvents, syncPeople, logSyncResult } from "./server/pco/sync";

async function main() {
  const db = await getDb();
  if (!db) { console.error("DB not available"); process.exit(1); }

  console.log("\n=== BUILDING PCO CLIENT ===");
  let client;
  try {
    client = await createAuthenticatedPcoClient();
    console.log("  ✅ PCO client ready");
  } catch (e: any) {
    console.error("  ❌ Failed:", e.message);
    process.exit(1);
  }

  // Events (Calendar) — now filtered to 2026 only
  console.log("\n--- [4/5] Events (Calendar, 2026 only) ---");
  const eventsResult = await syncEvents(client);
  await logSyncResult(eventsResult);
  const evStatus = eventsResult.status === "completed" ? "✅" : "❌";
  console.log(`  ${evStatus} ${eventsResult.status} | Processed: ${eventsResult.recordsProcessed} | Created: ${eventsResult.recordsCreated} | Updated: ${eventsResult.recordsUpdated} | ${eventsResult.durationMs}ms`);
  if (eventsResult.errorMessage) console.log(`  Error: ${eventsResult.errorMessage}`);

  // People
  console.log("\n--- [5/5] People ---");
  const peopleResult = await syncPeople(client);
  await logSyncResult(peopleResult);
  const pStatus = peopleResult.status === "completed" ? "✅" : "❌";
  console.log(`  ${pStatus} ${peopleResult.status} | Processed: ${peopleResult.recordsProcessed} | Created: ${peopleResult.recordsCreated} | Updated: ${peopleResult.recordsUpdated} | ${peopleResult.durationMs}ms`);
  if (peopleResult.errorMessage) console.log(`  Error: ${peopleResult.errorMessage}`);

  // Final row counts
  console.log("\n=== FINAL DATABASE ROW COUNTS ===");
  const tables = [
    { name: "attendance_monthly (pco, 2026)", q: sql`SELECT COUNT(*) as cnt FROM attendance_monthly WHERE source='pco' AND year=2026` },
    { name: "giving_monthly (pco, 2026)",     q: sql`SELECT COUNT(*) as cnt FROM giving_monthly WHERE source='pco' AND year=2026` },
    { name: "pco_groups",                     q: sql`SELECT COUNT(*) as cnt FROM pco_groups` },
    { name: "pco_events",                     q: sql`SELECT COUNT(*) as cnt FROM pco_events` },
    { name: "pco_people",                     q: sql`SELECT COUNT(*) as cnt FROM pco_people` },
  ];
  for (const { name, q } of tables) {
    const [rows] = await db.execute(q);
    const cnt = (rows as any[])[0]?.cnt ?? "?";
    console.log(`  ${name.padEnd(38)}: ${cnt} rows`);
  }

  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
