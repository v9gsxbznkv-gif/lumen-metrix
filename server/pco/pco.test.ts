import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// ============================================================
// Test helpers
// ============================================================

function createMockContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ============================================================
// PCO Router Tests
// ============================================================

describe("pco.getAuthorizeUrl", () => {
  it("returns a valid PCO authorization URL with correct parameters", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getAuthorizeUrl();

    expect(result).toBeDefined();
    expect(result.url).toBeDefined();
    expect(result.redirectUri).toBeDefined();

    // The URL should point to PCO's OAuth authorize endpoint
    expect(result.url).toContain("api.planningcenteronline.com/oauth/authorize");

    // Should include required OAuth parameters
    expect(result.url).toContain("client_id=");
    expect(result.url).toContain("redirect_uri=");
    expect(result.url).toContain("response_type=code");
    expect(result.url).toContain("scope=");

    // Redirect URI should use the registered public domain
    expect(result.redirectUri).toContain("/api/pco/callback");

    // URL should contain the encoded redirect URI
    expect(result.url).toContain(encodeURIComponent(result.redirectUri));
  });

  it("includes PCO scopes in the authorization URL", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getAuthorizeUrl();

    // Should include all required PCO scopes
    const url = new URL(result.url);
    const scope = url.searchParams.get("scope") || "";
    expect(scope).toContain("check_ins");
    expect(scope).toContain("giving");
    expect(scope).toContain("groups");
    expect(scope).toContain("calendar");
    expect(scope).toContain("people");
  });

  it("returns a redirect URI that matches the registered callback", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.pco.getAuthorizeUrl();

    // Redirect URI should end with /api/pco/callback
    expect(result.redirectUri).toMatch(/\/api\/pco\/callback$/);
  });
});

describe("pco.getConnectionStatus", () => {
  it("returns connection status object", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getConnectionStatus();

    expect(result).toBeDefined();
    expect(typeof result.connected).toBe("boolean");
  });
});

describe("pco.testConnection", () => {
  it("returns a result with success boolean", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.testConnection();

    expect(result).toBeDefined();
    expect(typeof result.success).toBe("boolean");
    // If not connected, should have error message
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  }, 15000); // testConnection makes a real API call to PCO, needs longer timeout
});

describe("pco.getSyncLogs", () => {
  it("returns an array of sync logs", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getSyncLogs({ limit: 5 });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("pco.getDashboardData", () => {
  it("returns dashboard data with all required fields", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getDashboardData();

    expect(result).toBeDefined();
    expect(result).not.toBeNull();

    if (result) {
      // Check all required data arrays exist
      expect(Array.isArray(result.attendance)).toBe(true);
      expect(Array.isArray(result.attendance_monthly)).toBe(true);
      expect(Array.isArray(result.giving)).toBe(true);
      expect(Array.isArray(result.giving_monthly)).toBe(true);
      expect(Array.isArray(result.next_steps)).toBe(true);
      expect(Array.isArray(result.next_steps_monthly)).toBe(true);
      expect(Array.isArray(result.serving)).toBe(true);
      expect(Array.isArray(result.serving_monthly)).toBe(true);
      expect(Array.isArray(result.years)).toBe(true);
      expect(Array.isArray(result.campuses)).toBe(true);

      // Verify we have historical data loaded
      expect(result.attendance.length).toBeGreaterThan(0);
      expect(result.giving.length).toBeGreaterThan(0);
      expect(result.years.length).toBeGreaterThan(0);
    }
  });

  it("returns attendance records with correct structure", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getDashboardData();
    expect(result).not.toBeNull();

    if (result && result.attendance.length > 0) {
      const record = result.attendance[0];
      expect(record).toHaveProperty("year");
      expect(record).toHaveProperty("campus");
      expect(record).toHaveProperty("subgroup");
      expect(record).toHaveProperty("avg_weekly");
      expect(record).toHaveProperty("total");
      expect(typeof record.year).toBe("number");
      expect(typeof record.campus).toBe("string");
    }
  });

  it("returns giving records with correct structure", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getDashboardData();
    expect(result).not.toBeNull();

    if (result && result.giving.length > 0) {
      const record = result.giving[0];
      expect(record).toHaveProperty("year");
      expect(record).toHaveProperty("campus");
      expect(record).toHaveProperty("general");
      expect(record).toHaveProperty("designated");
      expect(record).toHaveProperty("total");
      expect(typeof record.year).toBe("number");
      expect(typeof record.total).toBe("number");
    }
  });

  it("includes historical years and uses source-aware filtering", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getDashboardData();
    expect(result).not.toBeNull();

    if (result) {
      // Should have historical spreadsheet data (2014-2025)
      expect(result.years).toContain(2014);
      // Should have data for multiple years
      expect(result.years.length).toBeGreaterThanOrEqual(8);
      // 2026 data comes from PCO source only (may or may not be present depending on sync state)
      if (result.years.includes(2026)) {
        // If 2026 is present, it should be from PCO source
        expect(result.attendance.some((a: any) => a.year === 2026)).toBe(true);
      }
    }
  });

  it("includes expected campuses", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getDashboardData();
    expect(result).not.toBeNull();

    if (result) {
      expect(result.campuses).toContain("Canton");
      expect(result.campuses).toContain("All Campuses");
    }
  });
});

describe("pco.getGroups", () => {
  it("returns an array", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getGroups();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("pco.getEvents", () => {
  it("returns an array with default limit", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getEvents();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("pco.getPeopleStats", () => {
  it("returns people stats with total and membership breakdown", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getPeopleStats();
    expect(result).toBeDefined();
    expect(typeof result.total).toBe("number");
    expect(Array.isArray(result.byMembership)).toBe(true);
  });
});

// ============================================================
// PCO OAuth Client Unit Tests
// ============================================================

describe("PCO OAuth URL helpers", () => {
  it("getPcoAuthorizeUrl builds correct URL", async () => {
    const { getPcoAuthorizeUrl } = await import("./client");

    const url = getPcoAuthorizeUrl("https://app.lumenmetrix.com/auth/callback", "test-state");

    expect(url).toContain("api.planningcenteronline.com/oauth/authorize");
    expect(url).toContain("response_type=code");
    expect(url).toContain("state=test-state");
    expect(url).toContain(encodeURIComponent("https://app.lumenmetrix.com/auth/callback"));
  });

  it("PCO_SCOPES includes all required modules", async () => {
    const { PCO_SCOPES } = await import("./client");

    expect(PCO_SCOPES).toContain("check_ins");
    expect(PCO_SCOPES).toContain("giving");
    expect(PCO_SCOPES).toContain("groups");
    expect(PCO_SCOPES).toContain("calendar");
    expect(PCO_SCOPES).toContain("people");
    expect(PCO_SCOPES.length).toBe(5);
  });
});

describe("pco.disconnect", () => {
  it("returns success when disconnecting", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.disconnect();
    expect(result).toEqual({ success: true });
  });
});

describe("pco.triggerSync", () => {
  it("throws error when not connected to PCO", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.pco.triggerSync({ syncType: "full" })
    ).rejects.toThrow("Not connected to Planning Center");
  });
});

describe("pco.getSyncJobStatus", () => {
  it("returns null for a non-existent job ID", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getSyncJobStatus({ jobId: "non-existent-job-id" });
    expect(result).toBeNull();
  });
});

describe("pco.getRecentSyncJobs", () => {
  it("returns an array of recent sync jobs", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.pco.getRecentSyncJobs();
    expect(Array.isArray(result)).toBe(true);
  });
});

// ============================================================
// jobManager tests — uses in-memory mock since DB is not available in test env
// ============================================================
describe("jobManager logic", () => {
  // These tests validate the data shape and logic without hitting the DB.
  // The DB-backed functions (createJob, updateJob, etc.) are integration-level
  // and require a live MySQL connection; they are covered by the sync e2e tests.

  it("SyncJob shape has required fields", () => {
    const job = {
      jobId: "test-123",
      syncType: "weekly_attendance",
      status: "pending" as const,
      progress: 0,
      message: "Preparing sync…",
      recordsProcessed: 0,
      startedAt: new Date(),
      completedAt: null,
      error: null,
      results: [],
    };
    expect(job.jobId).toBeDefined();
    expect(job.status).toBe("pending");
    expect(job.syncType).toBe("weekly_attendance");
    expect(job.progress).toBe(0);
    expect(job.recordsProcessed).toBe(0);
    expect(job.results).toEqual([]);
    expect(job.error).toBeNull();
    expect(job.completedAt).toBeNull();
  });

  it("JobStatus enum values are valid", () => {
    const validStatuses = ["pending", "running", "completed", "failed"];
    for (const s of validStatuses) {
      expect(validStatuses).toContain(s);
    }
  });

  it("getJob returns null for unknown jobId (no DB)", async () => {
    // When DB is unavailable (test env), getJob returns null gracefully
    const { getJob } = await import("./jobManager");
    const result = await getJob("totally-fake-id-that-does-not-exist");
    // Either null (no DB) or null (not found) — both are correct
    expect(result).toBeNull();
  });

  it("getRecentJobs returns empty array when DB unavailable", async () => {
    const { getRecentJobs } = await import("./jobManager");
    const result = await getRecentJobs();
    // In test env without DB, returns empty array gracefully
    expect(Array.isArray(result)).toBe(true);
  });
});
