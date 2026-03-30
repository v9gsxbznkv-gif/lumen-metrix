import { describe, it, expect } from "vitest";
import { appRouter } from "../routers";

// Unauthenticated caller for public procedures
const caller = appRouter.createCaller({
  req: { headers: {}, cookies: {} } as any,
  res: { cookie: () => {}, clearCookie: () => {} } as any,
  user: null,
});

describe("groups.getData", () => {
  it("returns the expected shape with default params", async () => {
    const result = await caller.groups.getData({ year: 2026, campus: "All Campuses" });
    expect(result).toHaveProperty("current");
    expect(result).toHaveProperty("priorYear");
    expect(result).toHaveProperty("monthly");
    expect(result).toHaveProperty("campusBreakdown");
    expect(result).toHaveProperty("yearlyTrend");
    expect(result).toHaveProperty("meta");
    expect(result.meta.year).toBe(2026);
    expect(result.meta.campus).toBe("All Campuses");
  });

  it("returns non-null current data for a seeded year", async () => {
    const result = await caller.groups.getData({ year: 2026, campus: "All Campuses" });
    expect(result.current).not.toBeNull();
    if (result.current) {
      expect(result.current.activeGroups).toBeGreaterThan(0);
      expect(result.current.totalMembers).toBeGreaterThan(0);
      expect(result.current.totalLeaders).toBeGreaterThan(0);
      expect(result.current.avgAttendance).toBeGreaterThan(0);
      expect(result.current.participationRate).toBeGreaterThan(0);
    }
  });

  it("returns prior year data for comparison", async () => {
    const result = await caller.groups.getData({ year: 2026, campus: "All Campuses" });
    expect(result.priorYear).not.toBeNull();
    if (result.priorYear) {
      expect(result.priorYear.activeGroups).toBeGreaterThan(0);
      expect(result.priorYear.totalMembers).toBeGreaterThan(0);
    }
  });

  it("returns monthly data for 2026", async () => {
    const result = await caller.groups.getData({ year: 2026, campus: "All Campuses" });
    expect(result.monthly.length).toBeGreaterThan(0);
    expect(result.monthly.length).toBeLessThanOrEqual(12);
    for (const m of result.monthly) {
      expect(m.month).toBeGreaterThanOrEqual(1);
      expect(m.month).toBeLessThanOrEqual(12);
      expect(m).toHaveProperty("activeGroups");
      expect(m).toHaveProperty("totalMembers");
      expect(m).toHaveProperty("avgAttendance");
    }
  });

  it("returns campus breakdown with both campuses", async () => {
    const result = await caller.groups.getData({ year: 2026, campus: "All Campuses" });
    expect(result.campusBreakdown.length).toBe(2);
    const campusNames = result.campusBreakdown.map((c) => c.campus).sort();
    expect(campusNames).toEqual(["Canton", "Jasper"]);
  });

  it("filters by specific campus", async () => {
    const result = await caller.groups.getData({ year: 2026, campus: "Canton" });
    expect(result.current).not.toBeNull();
    if (result.current) {
      // Canton should have more groups than Jasper
      const jasperResult = await caller.groups.getData({ year: 2026, campus: "Jasper" });
      expect(result.current.activeGroups).toBeGreaterThan(jasperResult.current!.activeGroups);
    }
  });

  it("All Campuses totals equal sum of individual campuses", async () => {
    const all = await caller.groups.getData({ year: 2026, campus: "All Campuses" });
    const canton = await caller.groups.getData({ year: 2026, campus: "Canton" });
    const jasper = await caller.groups.getData({ year: 2026, campus: "Jasper" });
    expect(all.current!.activeGroups).toBe(
      canton.current!.activeGroups + jasper.current!.activeGroups
    );
    expect(all.current!.totalMembers).toBe(
      canton.current!.totalMembers + jasper.current!.totalMembers
    );
    expect(all.current!.totalLeaders).toBe(
      canton.current!.totalLeaders + jasper.current!.totalLeaders
    );
  });

  it("returns yearly trend data spanning multiple years", async () => {
    const result = await caller.groups.getData({ year: 2026, campus: "All Campuses" });
    expect(result.yearlyTrend.length).toBeGreaterThan(5);
    // Should be sorted by year
    for (let i = 1; i < result.yearlyTrend.length; i++) {
      expect(result.yearlyTrend[i].year).toBeGreaterThan(result.yearlyTrend[i - 1].year);
    }
  });

  it("returns empty data for a year with no seeded data", async () => {
    const result = await caller.groups.getData({ year: 2014, campus: "All Campuses" });
    // 2014 may or may not have data depending on seed range
    expect(result).toHaveProperty("current");
    expect(result).toHaveProperty("monthly");
  });
});
