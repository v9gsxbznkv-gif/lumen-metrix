import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// ─── Test helpers ───────────────────────────────────────────────────────────

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("weeklyReport.getData", () => {
  it("returns current period and comparison data for 2026", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weeklyReport.getData({
      year: 2026,
      comparisons: ["previousWeek"],
    });

    expect(result).toBeDefined();
    expect(result.meta).toBeDefined();
    expect(result.meta.year).toBe(2026);
    expect(result.meta.latestMonth).toBeGreaterThanOrEqual(1);

    // Current period should exist
    expect(result.current).toBeDefined();
    if (result.current) {
      expect(result.current.campuses).toBeInstanceOf(Array);
      expect(result.current.totals).toBeDefined();
      expect(result.current.totals.campus).toBe("All Campuses");
      expect(result.current.totals.attendance).toBeGreaterThan(0);
    }
  });

  it("returns sameWeekLastYear comparison", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weeklyReport.getData({
      year: 2026,
      comparisons: ["sameWeekLastYear"],
    });

    expect(result.comparisons).toBeDefined();
    expect(result.comparisons.sameWeekLastYear).toBeDefined();
    if (result.comparisons.sameWeekLastYear) {
      expect(result.comparisons.sameWeekLastYear.year).toBe(2025);
      expect(result.comparisons.sameWeekLastYear.totals).toBeDefined();
    }
  });

  it("returns samePeriodLastYear comparison with currentYTD", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weeklyReport.getData({
      year: 2026,
      comparisons: ["samePeriodLastYear"],
    });

    expect(result.comparisons).toBeDefined();
    expect(result.comparisons.samePeriodLastYear).toBeDefined();
    // Should also include currentYTD for comparison display
    expect((result.comparisons as any).currentYTD).toBeDefined();
  });

  it("returns multiple comparisons at once", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weeklyReport.getData({
      year: 2026,
      comparisons: ["previousWeek", "sameWeekLastYear", "samePeriodLastYear"],
    });

    expect(result.comparisons.previousWeek).toBeDefined();
    expect(result.comparisons.sameWeekLastYear).toBeDefined();
    expect(result.comparisons.samePeriodLastYear).toBeDefined();
  });

  it("campus metrics have all required fields", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weeklyReport.getData({
      year: 2026,
      comparisons: [],
    });

    if (result.current && result.current.campuses.length > 0) {
      const campus = result.current.campuses[0];
      expect(campus).toHaveProperty("campus");
      expect(campus).toHaveProperty("attendance");
      expect(campus).toHaveProperty("giving");
      expect(campus).toHaveProperty("volunteers");
      expect(campus).toHaveProperty("ftg");
      expect(campus).toHaveProperty("salvations");
      expect(campus).toHaveProperty("baptisms");
      // All should be numbers
      expect(typeof campus.attendance).toBe("number");
      expect(typeof campus.giving).toBe("number");
      expect(typeof campus.volunteers).toBe("number");
    }
  });

  it("totals equal sum of campus values", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weeklyReport.getData({
      year: 2026,
      comparisons: [],
    });

    if (result.current && result.current.campuses.length > 1) {
      const campusSum = result.current.campuses.reduce((s, c) => s + c.attendance, 0);
      expect(result.current.totals.attendance).toBe(campusSum);

      const givingSum = result.current.campuses.reduce((s, c) => s + c.giving, 0);
      // totals.giving includes designated giving ("All Campuses" row) which is not
      // assigned to any specific campus, so totals >= sum of campus values
      expect(result.current.totals.giving).toBeGreaterThanOrEqual(givingSum);
    }
  });

  it("selects a complete week with ≥2 campuses, not a partial week", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weeklyReport.getData({
      year: 2026,
      comparisons: [],
    });

    // The selected week must have at least 2 campuses (Canton + Jasper at minimum)
    if (result.current && result.current.source === "weekly") {
      expect(result.current.campuses.length).toBeGreaterThanOrEqual(2);
      // Total attendance should be substantial (not a partial week with only volunteers)
      expect(result.current.totals.attendance).toBeGreaterThan(100);
      // Week number should NOT be a future/partial week with no real data
      // Week 16 has 19 rows and full data; week 17 only has 3 rows (partial)
      expect(result.meta.latestWeek).toBeLessThanOrEqual(17);
    }
  });
});

describe("weeklyReport.getSchedule", () => {
  it("returns default schedule when none is configured", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.weeklyReport.getSchedule();

    expect(result).toBeDefined();
    expect(result).toHaveProperty("dayOfWeek");
    expect(result).toHaveProperty("hour");
    expect(result).toHaveProperty("minute");
    expect(result).toHaveProperty("enabled");
    expect(typeof result.dayOfWeek).toBe("number");
    expect(typeof result.hour).toBe("number");
  });
});

describe("weeklyReport.saveSchedule", () => {
  it("saves schedule configuration for authenticated users", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.weeklyReport.saveSchedule({
      dayOfWeek: 1,
      hour: 8,
      minute: 0,
      enabled: true,
    });

    expect(result).toEqual({ success: true });

    // Verify it was saved
    const schedule = await caller.weeklyReport.getSchedule();
    expect(schedule.dayOfWeek).toBe(1);
    expect(schedule.hour).toBe(8);
    expect(schedule.minute).toBe(0);
    expect(schedule.enabled).toBe(true);
  });

  it("updates existing schedule", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    // Save initial
    await caller.weeklyReport.saveSchedule({
      dayOfWeek: 1,
      hour: 8,
      minute: 0,
      enabled: true,
    });

    // Update
    await caller.weeklyReport.saveSchedule({
      dayOfWeek: 5,
      hour: 14,
      minute: 30,
      enabled: false,
    });

    const schedule = await caller.weeklyReport.getSchedule();
    expect(schedule.dayOfWeek).toBe(5);
    expect(schedule.hour).toBe(14);
    expect(schedule.minute).toBe(30);
    expect(schedule.enabled).toBe(false);
  });
});
