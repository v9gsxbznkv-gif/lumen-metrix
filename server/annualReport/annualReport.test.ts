/**
 * Annual Report Router — Vitest tests
 * Tests the getData procedure returns the correct structure.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "../routers";

const ctx = {
  user: null,
  req: { headers: {}, cookies: {} } as any,
  res: { cookie: () => {}, clearCookie: () => {} } as any,
};
const caller = appRouter.createCaller(ctx);

describe("annualReport.getData", () => {
  it("returns structured annual report data for 2024", async () => {
    const result = await caller.annualReport.getData({ year: 2024 });

    // Should return non-null data
    expect(result).not.toBeNull();
    if (!result) return;

    // Meta
    expect(result.meta.year).toBe(2024);
    expect(result.meta.priorYear).toBe(2023);

    // Attendance section
    expect(result.attendance).toBeDefined();
    expect(result.attendance.current).toHaveProperty("avgWeekly");
    expect(result.attendance.current).toHaveProperty("total");
    expect(result.attendance.current).toHaveProperty("canton");
    expect(result.attendance.current).toHaveProperty("jasper");
    expect(result.attendance.current).toHaveProperty("online");
    expect(result.attendance.monthly).toHaveLength(12);
    expect(result.attendance.monthlyPrior).toHaveLength(12);
    expect(result.attendance.yoy).toHaveProperty("avgWeekly");
    expect(result.attendance.yoy).toHaveProperty("total");

    // Giving section
    expect(result.giving).toBeDefined();
    expect(result.giving.current).toHaveProperty("total");
    expect(result.giving.current).toHaveProperty("general");
    expect(result.giving.current).toHaveProperty("designated");
    expect(result.giving.current).toHaveProperty("perCapita");
    expect(result.giving.monthly).toHaveLength(12);
    expect(result.giving.monthlyPrior).toHaveLength(12);

    // Volunteers section
    expect(result.volunteers).toBeDefined();
    expect(result.volunteers.current).toHaveProperty("avgWeekly");
    expect(result.volunteers.current).toHaveProperty("ratio");
    expect(result.volunteers.monthly).toHaveLength(12);

    // Next Steps section
    expect(result.nextSteps).toBeDefined();
    expect(result.nextSteps.ftg).toHaveProperty("current");
    expect(result.nextSteps.ftg).toHaveProperty("prior");
    expect(result.nextSteps.ftg).toHaveProperty("rate");
    expect(result.nextSteps.ftg.monthly).toHaveLength(12);
    expect(result.nextSteps.salvations).toHaveProperty("current");
    expect(result.nextSteps.salvations.monthly).toHaveLength(12);
    expect(result.nextSteps.baptisms).toHaveProperty("current");
    expect(result.nextSteps.baptisms.monthly).toHaveLength(12);

    // Groups section
    expect(result.groups).toBeDefined();
    expect(result.groups.current).toHaveProperty("activeGroups");
    expect(result.groups.current).toHaveProperty("totalMembers");
    expect(result.groups.current).toHaveProperty("totalLeaders");
    expect(result.groups.current).toHaveProperty("avgAttendance");

    // Events section
    expect(result.events).toBeDefined();
    expect(result.events.current).toBeInstanceOf(Array);
    expect(result.events.current.length).toBeGreaterThan(0);
    result.events.current.forEach((evt) => {
      expect(evt).toHaveProperty("name");
      expect(evt).toHaveProperty("attendance");
      expect(evt).toHaveProperty("source");
      expect(["override", "weekly", "estimate"]).toContain(evt.source);
    });

    // Health metrics section
    expect(result.health).toBeDefined();
    expect(result.health).toBeInstanceOf(Array);
    expect(result.health.length).toBe(5);
    result.health.forEach((h) => {
      expect(h).toHaveProperty("name");
      expect(h).toHaveProperty("value");
      expect(h).toHaveProperty("status");
      expect(["healthy", "warning", "critical"]).toContain(h.status);
    });
  });

  it("returns 12 monthly rows for all monthly arrays", async () => {
    const result = await caller.annualReport.getData({ year: 2025 });
    if (!result) return;

    expect(result.attendance.monthly).toHaveLength(12);
    expect(result.giving.monthly).toHaveLength(12);
    expect(result.volunteers.monthly).toHaveLength(12);
    expect(result.nextSteps.ftg.monthly).toHaveLength(12);
    expect(result.nextSteps.salvations.monthly).toHaveLength(12);
    expect(result.nextSteps.baptisms.monthly).toHaveLength(12);
  });

  it("monthly rows have correct structure", async () => {
    const result = await caller.annualReport.getData({ year: 2024 });
    if (!result) return;

    result.attendance.monthly.forEach((m, i) => {
      expect(m.month).toBe(i + 1);
      expect(typeof m.canton).toBe("number");
      expect(typeof m.jasper).toBe("number");
      expect(typeof m.online).toBe("number");
      expect(typeof m.total).toBe("number");
    });
  });

  it("YoY comparison has correct fields", async () => {
    const result = await caller.annualReport.getData({ year: 2024 });
    if (!result) return;

    const yoy = result.attendance.yoy.avgWeekly;
    expect(yoy).toHaveProperty("current");
    expect(yoy).toHaveProperty("prior");
    expect(yoy).toHaveProperty("change");
    expect(yoy).toHaveProperty("changePct");
    expect(typeof yoy.changePct).toBe("number");
  });

  it("handles edge year (2014) without crashing", async () => {
    const result = await caller.annualReport.getData({ year: 2014 });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.meta.year).toBe(2014);
    expect(result.meta.priorYear).toBe(2013);
  });
});
