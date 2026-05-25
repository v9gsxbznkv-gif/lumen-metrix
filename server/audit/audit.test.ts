/**
 * Data Audit Router — Vitest Tests
 *
 * Tests the 8 audit procedures:
 * - rawAttendanceWeekly, rawGivingWeekly, rawAttendanceMonthly, rawGivingMonthly, rawGroupsMonthly
 * - syncLogs, healthFlags, crossTabCheck
 *
 * Uses real DB (integration-style) with a signed admin staff cookie.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { SignJWT } from "jose";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STAFF_COOKIE = "lumen_staff_session";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me");
}

async function signAdminCookie(): Promise<string> {
  const token = await new SignJWT({ userId: 1, email: "chad@revolution.church", name: "Chad", role: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000))
    .sign(getSecret());
  return `${STAFF_COOKIE}=${token}`;
}

async function signUserCookie(): Promise<string> {
  const token = await new SignJWT({ userId: 2, email: "viewer@revolution.church", name: "Viewer", role: "user" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000))
    .sign(getSecret());
  return `${STAFF_COOKIE}=${token}`;
}

function createContext(cookie?: string): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: cookie ? { cookie } : {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("audit router — auth gating", () => {
  it("rejects unauthenticated requests (no cookie)", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.audit.rawAttendanceWeekly({ year: 2025 })).rejects.toThrow("Admin access required");
  });

  it("rejects non-admin users", async () => {
    const cookie = await signUserCookie();
    const caller = appRouter.createCaller(createContext(cookie));
    await expect(caller.audit.rawAttendanceWeekly({ year: 2025 })).rejects.toThrow("Admin access required");
  });

  it("rejects requests with invalid/expired token", async () => {
    const caller = appRouter.createCaller(createContext(`${STAFF_COOKIE}=invalid.token.here`));
    await expect(caller.audit.healthFlags({ year: 2025 })).rejects.toThrow("Admin access required");
  });
});

describe("audit.rawAttendanceWeekly", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const cookie = await signAdminCookie();
    caller = appRouter.createCaller(createContext(cookie));
  });

  it("returns an array of attendance records for a given year", async () => {
    const result = await caller.audit.rawAttendanceWeekly({ year: 2025 });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("year", 2025);
      expect(result[0]).toHaveProperty("weekStartDate");
      expect(result[0]).toHaveProperty("campus");
      expect(result[0]).toHaveProperty("headcount");
      expect(result[0]).toHaveProperty("manualLock");
      expect(result[0]).toHaveProperty("cancelled");
    }
  });

  it("filters by campus", async () => {
    const result = await caller.audit.rawAttendanceWeekly({ year: 2025, campus: "Canton" });
    for (const row of result) {
      expect(row.campus).toBe("Canton");
    }
  });

  it("filters by month", async () => {
    const result = await caller.audit.rawAttendanceWeekly({ year: 2025, month: 3 });
    for (const row of result) {
      expect(row.weekStartDate.startsWith("2025-03")).toBe(true);
    }
  });
});

describe("audit.rawGivingWeekly", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const cookie = await signAdminCookie();
    caller = appRouter.createCaller(createContext(cookie));
  });

  it("returns an array of giving records for a given year", async () => {
    const result = await caller.audit.rawGivingWeekly({ year: 2025 });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("year", 2025);
      expect(result[0]).toHaveProperty("total");
      expect(result[0]).toHaveProperty("general");
      expect(result[0]).toHaveProperty("designated");
      expect(result[0]).toHaveProperty("manualLock");
    }
  });

  it("filters by campus", async () => {
    const result = await caller.audit.rawGivingWeekly({ year: 2025, campus: "Jasper" });
    for (const row of result) {
      expect(row.campus).toBe("Jasper");
    }
  });
});

describe("audit.rawAttendanceMonthly", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const cookie = await signAdminCookie();
    caller = appRouter.createCaller(createContext(cookie));
  });

  it("returns monthly attendance aggregates", async () => {
    const result = await caller.audit.rawAttendanceMonthly({ year: 2025 });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("year", 2025);
      expect(result[0]).toHaveProperty("month");
      expect(result[0]).toHaveProperty("campus");
      expect(result[0]).toHaveProperty("total");
      expect(result[0]).toHaveProperty("avgWeekly");
    }
  });
});

describe("audit.rawGivingMonthly", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const cookie = await signAdminCookie();
    caller = appRouter.createCaller(createContext(cookie));
  });

  it("returns monthly giving aggregates", async () => {
    const result = await caller.audit.rawGivingMonthly({ year: 2025 });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("year", 2025);
      expect(result[0]).toHaveProperty("month");
      expect(result[0]).toHaveProperty("campus");
      expect(result[0]).toHaveProperty("total");
    }
  });
});

describe("audit.rawGroupsMonthly", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const cookie = await signAdminCookie();
    caller = appRouter.createCaller(createContext(cookie));
  });

  it("returns monthly groups aggregates", async () => {
    const result = await caller.audit.rawGroupsMonthly({ year: 2025 });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("year", 2025);
      expect(result[0]).toHaveProperty("month");
      expect(result[0]).toHaveProperty("campus");
      expect(result[0]).toHaveProperty("totalGroups");
      expect(result[0]).toHaveProperty("activeGroups");
    }
  });
});

describe("audit.syncLogs", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const cookie = await signAdminCookie();
    caller = appRouter.createCaller(createContext(cookie));
  });

  it("returns sync log entries", async () => {
    const result = await caller.audit.syncLogs({ limit: 10 });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("startedAt");
    }
  });

  it("respects the limit parameter", async () => {
    const result = await caller.audit.syncLogs({ limit: 3 });
    expect(result.length).toBeLessThanOrEqual(3);
  });
});

describe("audit.healthFlags", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const cookie = await signAdminCookie();
    caller = appRouter.createCaller(createContext(cookie));
  });

  it("returns flags array and summary object", async () => {
    const result = await caller.audit.healthFlags({ year: 2025 });
    expect(result).toHaveProperty("flags");
    expect(result).toHaveProperty("summary");
    expect(Array.isArray(result.flags)).toBe(true);
    expect(result.summary).toHaveProperty("errors");
    expect(result.summary).toHaveProperty("warnings");
    expect(result.summary).toHaveProperty("info");
    expect(result.summary).toHaveProperty("total");
    expect(result.summary.total).toBe(result.flags.length);
  });

  it("each flag has severity, category, and message", async () => {
    const result = await caller.audit.healthFlags({ year: 2025 });
    for (const flag of result.flags) {
      expect(["error", "warning", "info"]).toContain(flag.severity);
      expect(flag.category).toBeTruthy();
      expect(flag.message).toBeTruthy();
    }
  });

  it("filters by campus", async () => {
    const result = await caller.audit.healthFlags({ year: 2025, campus: "Canton" });
    // All flags should reference Canton (or be generic)
    for (const flag of result.flags) {
      // Flags should not mention Jasper specifically when filtering to Canton
      expect(flag.message).not.toContain("Jasper");
    }
  });
});

describe("audit.crossTabCheck", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const cookie = await signAdminCookie();
    caller = appRouter.createCaller(createContext(cookie));
  });

  it("returns attendance, giving, and groups comparison for a month", async () => {
    const result = await caller.audit.crossTabCheck({ year: 2025, month: 3, campus: "Canton" });
    // Could be null if no data, but if present should have structure
    if (result) {
      expect(result).toHaveProperty("period");
      expect(result).toHaveProperty("attendance");
      expect(result).toHaveProperty("giving");
      expect(result.attendance).toHaveProperty("weeklyRawSum");
      expect(result.attendance).toHaveProperty("monthlyAggregateTotal");
      expect(result.attendance).toHaveProperty("match");
      expect(result.attendance).toHaveProperty("variance");
      expect(result.giving).toHaveProperty("weeklyRawSum");
      expect(result.giving).toHaveProperty("monthlyAggregateTotal");
      expect(result.giving).toHaveProperty("match");
      expect(result.giving).toHaveProperty("variance");
    }
  });

  it("period string includes month name, year, and campus", async () => {
    const result = await caller.audit.crossTabCheck({ year: 2025, month: 1, campus: "Jasper" });
    if (result) {
      expect(result.period).toContain("January");
      expect(result.period).toContain("2025");
      expect(result.period).toContain("Jasper");
    }
  });
});
