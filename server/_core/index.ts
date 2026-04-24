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
  // Reads the rawData JSON blob stored in sync_jobs, writes attendance rows to attendance_weekly
  // using a brand-new DB connection (avoids TiDB idle-drop hang after long PCO fetch),
  // then clears rawData and updates job progress.
  app.post("/api/sync/flush", async (req, res) => {
    const { jobId } = req.body as { jobId?: string };
    if (!jobId) {
      return res.status(400).json({ ok: false, error: "jobId is required" });
    }
    let conn: import("mysql2").Connection | null = null;
    try {
      const mysql2 = await import("mysql2");
      const { drizzle } = await import("drizzle-orm/mysql2");
      const { eq, and, sql } = await import("drizzle-orm");
      const { syncJobs, attendanceWeekly } = await import("../../drizzle/schema");

      // Open a fresh connection — NOT from the shared pool
      conn = mysql2.default.createConnection({
        uri: process.env.DATABASE_URL!,
        connectTimeout: 20000,
      });
      await new Promise<void>((resolve, reject) => {
        conn!.connect((err) => (err ? reject(err) : resolve()));
      });
      const freshDb = drizzle(conn as any);

      // Read rawData from the job row
      const jobRows = await freshDb
        .select({ rawData: syncJobs.rawData })
        .from(syncJobs)
        .where(eq(syncJobs.jobId, jobId))
        .limit(1);

      if (!jobRows.length || !jobRows[0].rawData) {
        return res.json({ ok: true, rowsWritten: 0, message: "No rawData to flush" });
      }

      const blob = JSON.parse(jobRows[0].rawData) as { type: string; rows: any[] };
      if (blob.type !== "attendance_weekly" || !Array.isArray(blob.rows)) {
        return res.status(400).json({ ok: false, error: "Unexpected rawData format" });
      }

      const allRows = blob.rows;
      console.log(`[Flush] Writing ${allRows.length} attendance rows for job ${jobId}...`);

      // Fetch locked rows upfront so we can skip them
      const lockedRows = await freshDb
        .select({ year: attendanceWeekly.year, weekNumber: attendanceWeekly.weekNumber, campus: attendanceWeekly.campus, subgroup: attendanceWeekly.subgroup })
        .from(attendanceWeekly)
        .where(eq(attendanceWeekly.manualLock, true));

      const lockedSet = new Set(
        lockedRows.map((r) => `${r.year}|${r.weekNumber}|${r.campus}|${r.subgroup}`)
      );

      const rowsToWrite = allRows.filter(
        (r) => !lockedSet.has(`${r.year}|${r.weekNumber}|${r.campus}|${r.subgroup}`)
      );

      // Batch upsert in chunks of 50
      const CHUNK = 50;
      let rowsWritten = 0;
      for (let i = 0; i < rowsToWrite.length; i += CHUNK) {
        const chunk = rowsToWrite.slice(i, i + CHUNK);
        if (!chunk.length) continue;
        await freshDb
          .insert(attendanceWeekly)
          .values(chunk.map((r) => ({
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

      // Clear rawData and update progress to 60%
      await freshDb
        .update(syncJobs)
        .set({ rawData: null, progress: 60, message: `Attendance rows saved to database (${rowsWritten} rows)` })
        .where(eq(syncJobs.jobId, jobId));

      console.log(`[Flush] Done — ${rowsWritten} rows written for job ${jobId}`);
      return res.json({ ok: true, rowsWritten });
    } catch (err: any) {
      console.error(`[Flush] Error for job ${jobId}:`, err.message);
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
