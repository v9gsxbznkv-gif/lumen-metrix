import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Start the nightly auto-sync scheduler (midnight Eastern)
  try {
    const { startAutoSyncScheduler } = await import("../pco/scheduler");
    startAutoSyncScheduler();
  } catch (err) {
    console.warn("[Server] Could not start auto-sync scheduler:", err);
  }
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // PCO OAuth callback (authorization code exchange)
  app.get("/api/pco/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code) {
        return res.status(400).send("Missing authorization code from Planning Center.");
      }

      // Use the fixed registered redirect URI from environment
      const { ENV } = await import("../_core/env");
      const redirectUri = ENV.pcoRedirectUri;

      // Dynamic import to avoid circular deps
      const { exchangeCodeForTokens, storeTokens, PcoClient } = await import("../pco/client");
      const tokens = await exchangeCodeForTokens(code, redirectUri);

      // Fetch org info
      let orgName: string | undefined;
      let orgId: string | undefined;
      try {
        const client = new PcoClient(tokens.accessToken);
        const validation = await client.validateConnection();
        orgName = validation.orgName;
      } catch {}

      await storeTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        scope: tokens.scope,
        organizationName: orgName,
        organizationId: orgId,
      });

      // Redirect back to settings page with success indicator
      res.redirect(`/?tab=settings&pco=connected`);
    } catch (err: any) {
      console.error("[PCO OAuth Callback] Error:", err.message);
      res.redirect(`/?tab=settings&pco=error&message=${encodeURIComponent(err.message)}`);
    }
  });
  // POST /api/sync/flush — Phase 2 of two-phase sync architecture.
  // Uses a brand-new DB connection for ALL post-PCO-fetch DB work:
  //   1. Write attendance rows from rawData blob → attendance_weekly
  //   2. Aggregate giving_weekly → giving_monthly
  //   3. Insert sync log entries
  //   4. Mark job as completed (progress 100%)
  // This avoids the TiDB idle-drop hang that kills the shared pool after a long PCO fetch.
  app.post("/api/sync/flush", async (req, res) => {
    const { jobId } = req.body as { jobId?: string };
    if (!jobId) {
      return res.status(400).json({ ok: false, error: "jobId is required" });
    }
    let conn: import("mysql2").Connection | null = null;
    const flushStart = Date.now();
    try {
      const mysql2 = await import("mysql2");
      const { drizzle } = await import("drizzle-orm/mysql2");
      const { eq, gte, lte, sql } = await import("drizzle-orm");
      const { syncJobs, attendanceWeekly, givingWeekly, givingMonthly, syncLogs } = await import("../../drizzle/schema");

      // Open a fresh connection — NOT from the shared pool
      conn = mysql2.default.createConnection({
        uri: process.env.DATABASE_URL!,
        connectTimeout: 20000,
      });
      await new Promise<void>((resolve, reject) => {
        conn!.connect((err) => (err ? reject(err) : resolve()));
      });
      const freshDb = drizzle(conn as any);

      // ── Step 1: Read rawData blob ──────────────────────────────────────────
      const jobRows = await freshDb
        .select({ rawData: syncJobs.rawData })
        .from(syncJobs)
        .where(eq(syncJobs.jobId, jobId))
        .limit(1);

      if (!jobRows.length) {
        return res.status(404).json({ ok: false, error: "Job not found" });
      }

      let rowsWritten = 0;
      const rawData = jobRows[0].rawData;

      if (rawData) {
        const blob = JSON.parse(rawData) as { type: string; rows: any[] };
        if (blob.type === "attendance_weekly" && Array.isArray(blob.rows)) {
          const allRows = blob.rows;
          console.log(`[Flush] Writing ${allRows.length} attendance rows for job ${jobId}...`);

          // ── Step 2: Write attendance_weekly rows ───────────────────────────
          // Fetch locked rows upfront so we can skip them
          const lockedRows = await freshDb
            .select({ year: attendanceWeekly.year, weekNumber: attendanceWeekly.weekNumber, campus: attendanceWeekly.campus, subgroup: attendanceWeekly.subgroup })
            .from(attendanceWeekly)
            .where(eq(attendanceWeekly.manualLock, true));

          const lockedSet = new Set(
            lockedRows.map((r) => `${r.year}|${r.weekNumber}|${r.campus}|${r.subgroup}`)
          );

          const rowsToWrite = allRows.filter(
            (r: any) => !lockedSet.has(`${r.year}|${r.weekNumber}|${r.campus}|${r.subgroup}`)
          );

          const CHUNK = 50;
          for (let i = 0; i < rowsToWrite.length; i += CHUNK) {
            const chunk = rowsToWrite.slice(i, i + CHUNK);
            if (!chunk.length) continue;
            await freshDb
              .insert(attendanceWeekly)
              .values(chunk.map((r: any) => ({
                year: r.year,
                weekNumber: r.weekNumber,
                weekStartDate: r.weekStartDate,
                campus: r.campus,
                subgroup: r.subgroup,
                headcount: r.headcount,
                regularCount: r.regularCount ?? 0,
                guestCount: r.guestCount ?? 0,
                volunteerCount: r.volunteerCount ?? 0,
                source: "pco",
              })))
              .onDuplicateKeyUpdate({
                set: {
                  headcount: sql`VALUES(headcount)`,
                  regularCount: sql`VALUES(regularCount)`,
                  guestCount: sql`VALUES(guestCount)`,
                  volunteerCount: sql`VALUES(volunteerCount)`,
                  source: sql`VALUES(source)`,
                },
              });
            rowsWritten += chunk.length;
          }
          console.log(`[Flush] Attendance write done: ${rowsWritten} rows`);
        }
      }

      // Update progress to 70% — attendance written
      await freshDb
        .update(syncJobs)
        .set({ rawData: null, progress: 70, message: `Attendance saved (${rowsWritten} rows). Aggregating giving...` })
        .where(eq(syncJobs.jobId, jobId));

      // ── Step 3: Aggregate giving_weekly → giving_monthly ──────────────────
      // Read ALL giving_weekly rows (not date-filtered — we want to keep all months current)
      const weeklyGivingRows = await freshDb.select().from(givingWeekly);
      console.log(`[Flush] Aggregating ${weeklyGivingRows.length} giving_weekly rows → giving_monthly...`);

      const monthlyMap = new Map<string, { year: number; month: number; campus: string; general: number; designated: number }>();
      for (const row of weeklyGivingRows) {
        const date = new Date(row.weekStartDate);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const campus = row.campus;
        const key = `${year}-${month}-${campus}`;
        const total = parseFloat(row.total || "0");
        const general = parseFloat(row.general || "0");
        const designated = parseFloat(row.designated || "0");
        const existing = monthlyMap.get(key);
        if (existing) {
          existing.general += general;
          existing.designated += designated;
        } else {
          monthlyMap.set(key, { year, month, campus, general, designated });
        }
      }

      const givingBatch: { year: number; month: number; campus: string; subgroup: string; total: string; source: string }[] = [];
      for (const [, agg] of Array.from(monthlyMap.entries())) {
        givingBatch.push({ year: agg.year, month: agg.month, campus: agg.campus, subgroup: "Tithes and Offerings", total: String(agg.general.toFixed(2)), source: "aggregated" });
        if (agg.designated > 0) {
          givingBatch.push({ year: agg.year, month: agg.month, campus: agg.campus, subgroup: "Designated", total: String(agg.designated.toFixed(2)), source: "aggregated" });
        }
      }

      if (givingBatch.length > 0) {
        const GCHUNK = 50;
        for (let i = 0; i < givingBatch.length; i += GCHUNK) {
          const chunk = givingBatch.slice(i, i + GCHUNK);
          if (!chunk.length) continue;
          await freshDb
            .insert(givingMonthly)
            .values(chunk)
            .onDuplicateKeyUpdate({
              set: {
                total: sql`VALUES(total)`,
                source: sql`VALUES(source)`,
              },
            });
        }
        console.log(`[Flush] Giving aggregation done: ${givingBatch.length} monthly rows`);
      }

      // Update progress to 90%
      await freshDb
        .update(syncJobs)
        .set({ progress: 90, message: "Writing sync log..." })
        .where(eq(syncJobs.jobId, jobId));

      // ── Step 4: Insert sync log entries ───────────────────────────────────
      const flushDuration = Date.now() - flushStart;
      await freshDb.insert(syncLogs).values([
        {
          syncType: "weekly_attendance",
          status: "completed",
          recordsProcessed: rowsWritten,
          recordsCreated: rowsWritten,
          recordsUpdated: 0,
          startedAt: new Date(Date.now() - flushDuration),
          completedAt: new Date(),
          durationMs: flushDuration,
        },
        {
          syncType: "weekly_giving",
          status: "completed",
          recordsProcessed: givingBatch.length,
          recordsCreated: givingBatch.length,
          recordsUpdated: 0,
          startedAt: new Date(Date.now() - flushDuration),
          completedAt: new Date(),
          durationMs: flushDuration,
        },
      ]);

      // ── Step 5: Mark job completed at 100% ────────────────────────────────
      const totalRecords = rowsWritten + givingBatch.length;
      await freshDb
        .update(syncJobs)
        .set({
          status: "completed",
          progress: 100,
          message: `Sync complete — ${totalRecords} records processed`,
          recordsProcessed: totalRecords,
          completedAt: new Date(),
        })
        .where(eq(syncJobs.jobId, jobId));

      console.log(`[Flush] Job ${jobId} fully complete: ${rowsWritten} attendance + ${givingBatch.length} giving rows`);
      return res.json({ ok: true, rowsWritten, givingRows: givingBatch.length });
    } catch (err: any) {
      console.error(`[Flush] Error for job ${jobId}:`, err.message);
      // Try to mark job as failed on the fresh connection
      try {
        if (conn) {
          const { drizzle } = await import("drizzle-orm/mysql2");
          const { eq } = await import("drizzle-orm");
          const { syncJobs } = await import("../../drizzle/schema");
          const freshDb = drizzle(conn as any);
          await freshDb.update(syncJobs).set({ status: "failed", message: `Flush failed: ${err.message}`, completedAt: new Date() }).where(eq(syncJobs.jobId, jobId));
        }
      } catch {}
      return res.status(500).json({ ok: false, error: err.message });
    } finally {
      if (conn) {
        conn.end();
      }
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
