/**
 * Re-runs only the Giving sync for 2026 (Jan 1 – today)
 * Run after clearing 2026 spreadsheet giving rows.
 */
import { createAuthenticatedPcoClient } from "./server/pco/client";
import { syncGiving, logSyncResult } from "./server/pco/sync";
import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("\n=== PCO Giving Sync — 2026 only ===");

  let client;
  try {
    client = await createAuthenticatedPcoClient();
    console.log("  ✅ PCO client ready");
  } catch (e: any) {
    console.error("  ❌ Failed to build PCO client:", e.message);
    process.exit(1);
  }

  const result = await syncGiving(client, "2026-01-01");
  await logSyncResult(result);

  const icon = result.status === "completed" ? "✅" : "❌";
  console.log(`\n${icon} Giving sync ${result.status}`);
  console.log(`   Processed : ${result.recordsProcessed}`);
  console.log(`   Created   : ${result.recordsCreated}`);
  console.log(`   Updated   : ${result.recordsUpdated}`);
  console.log(`   Duration  : ${result.durationMs}ms`);
  if (result.errorMessage) console.log(`   Error     : ${result.errorMessage}`);

  // Verify rows landed
  const db = await getDb();
  if (db) {
    const [rows] = await db.execute(
      sql`SELECT year, month, campus, subgroup, source, total FROM giving_monthly WHERE year = 2026 ORDER BY month, campus`
    );
    console.log("\n=== giving_monthly rows for 2026 ===");
    console.table(rows);
  }

  process.exit(0);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
