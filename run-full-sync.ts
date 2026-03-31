/**
 * Full PCO Sync Runner
 * Verifies token, then runs all 5 sync modules and reports results.
 * Run with: pnpm tsx run-full-sync.ts
 */
import { getDb } from "./server/db";
import { syncLogs } from "./drizzle/schema";
import { desc, sql } from "drizzle-orm";
import { createAuthenticatedPcoClient, getTokenInfo } from "./server/pco/client";
import {
  syncAttendance,
  syncGiving,
  syncGroups,
  syncEvents,
  syncPeople,
  logSyncResult,
} from "./server/pco/sync";

async function main() {
  const db = await getDb();
  if (!db) { console.error("DB not available"); process.exit(1); }

  // 1. Verify token
  console.log("\n=== STEP 1: VERIFY PCO TOKEN ===");
  const tokenInfo = await getTokenInfo();
  if (!tokenInfo) {
    console.error("  ❌ No PCO token found in database. Please re-authorize from the Settings page.");
    process.exit(1);
  }
  const exp = new Date(tokenInfo.expiresAt);
  const isExpired = exp < new Date();
  console.log(`  Token found: expires ${exp.toISOString()} — ${isExpired ? "EXPIRED ⚠️  (will attempt refresh)" : "VALID ✅"}`);

  // 2. Build authenticated client (handles token refresh automatically)
  console.log("\n=== STEP 2: BUILDING PCO CLIENT ===");
  let client;
  try {
    client = await createAuthenticatedPcoClient();
    console.log("  ✅ PCO client created successfully");
  } catch (e: any) {
    console.error("  ❌ Failed to create PCO client:", e.message);
    process.exit(1);
  }

  // 3. Run all 5 sync modules
  console.log("\n=== STEP 3: RUNNING ALL 5 SYNC MODULES ===");
  const results = [];

  // Attendance (Check-Ins)
  console.log("\n--- [1/5] Attendance (Check-Ins) ---");
  const attendanceResult = await syncAttendance(client);
  await logSyncResult(attendanceResult);
  results.push(attendanceResult);
  const aStatus = attendanceResult.status === "completed" ? "✅" : "❌";
  console.log(`  ${aStatus} Status: ${attendanceResult.status} | Processed: ${attendanceResult.recordsProcessed} | Created: ${attendanceResult.recordsCreated} | Updated: ${attendanceResult.recordsUpdated} | Duration: ${attendanceResult.durationMs}ms`);
  if (attendanceResult.errorMessage) console.log(`  Error: ${attendanceResult.errorMessage}`);

  // Giving
  console.log("\n--- [2/5] Giving ---");
  const givingResult = await syncGiving(client);
  await logSyncResult(givingResult);
  results.push(givingResult);
  const gStatus = givingResult.status === "completed" ? "✅" : "❌";
  console.log(`  ${gStatus} Status: ${givingResult.status} | Processed: ${givingResult.recordsProcessed} | Created: ${givingResult.recordsCreated} | Updated: ${givingResult.recordsUpdated} | Duration: ${givingResult.durationMs}ms`);
  if (givingResult.errorMessage) console.log(`  Error: ${givingResult.errorMessage}`);

  // Groups
  console.log("\n--- [3/5] Groups ---");
  const groupsResult = await syncGroups(client);
  await logSyncResult(groupsResult);
  results.push(groupsResult);
  const grStatus = groupsResult.status === "completed" ? "✅" : "❌";
  console.log(`  ${grStatus} Status: ${groupsResult.status} | Processed: ${groupsResult.recordsProcessed} | Created: ${groupsResult.recordsCreated} | Updated: ${groupsResult.recordsUpdated} | Duration: ${groupsResult.durationMs}ms`);
  if (groupsResult.errorMessage) console.log(`  Error: ${groupsResult.errorMessage}`);

  // Events (Calendar)
  console.log("\n--- [4/5] Events (Calendar) ---");
  const eventsResult = await syncEvents(client);
  await logSyncResult(eventsResult);
  results.push(eventsResult);
  const evStatus = eventsResult.status === "completed" ? "✅" : "❌";
  console.log(`  ${evStatus} Status: ${eventsResult.status} | Processed: ${eventsResult.recordsProcessed} | Created: ${eventsResult.recordsCreated} | Updated: ${eventsResult.recordsUpdated} | Duration: ${eventsResult.durationMs}ms`);
  if (eventsResult.errorMessage) console.log(`  Error: ${eventsResult.errorMessage}`);

  // People
  console.log("\n--- [5/5] People ---");
  const peopleResult = await syncPeople(client);
  await logSyncResult(peopleResult);
  results.push(peopleResult);
  const pStatus = peopleResult.status === "completed" ? "✅" : "❌";
  console.log(`  ${pStatus} Status: ${peopleResult.status} | Processed: ${peopleResult.recordsProcessed} | Created: ${peopleResult.recordsCreated} | Updated: ${peopleResult.recordsUpdated} | Duration: ${peopleResult.durationMs}ms`);
  if (peopleResult.errorMessage) console.log(`  Error: ${peopleResult.errorMessage}`);

  // 4. Summary
  console.log("\n=== SYNC SUMMARY ===");
  const completed = results.filter(r => r.status === "completed").length;
  const failed = results.filter(r => r.status === "failed").length;
  console.log(`  Completed: ${completed}/5 | Failed: ${failed}/5`);
  console.log("");
  for (const r of results) {
    const s = r.status === "completed" ? "✅" : "❌";
    console.log(`  ${s} ${r.syncType.padEnd(12)} — ${r.recordsProcessed} records in ${r.durationMs}ms`);
  }

  // 5. Post-sync row counts
  console.log("\n=== POST-SYNC ROW COUNTS ===");
  const tables = [
    "attendance_monthly",
    "giving_monthly",
    "serving_monthly",
    "next_steps_monthly",
    "pco_groups",
    "pco_events",
    "pco_people",
  ];
  for (const t of tables) {
    const [row] = await db.execute(sql`SELECT COUNT(*) as cnt FROM ${sql.identifier(t)}`);
    const cnt = (row as any[])[0]?.cnt ?? "?";
    console.log(`  ${t.padEnd(22)}: ${cnt} rows`);
  }

  process.exit(0);
}

main().catch(e => { console.error("Fatal error:", e); process.exit(1); });
