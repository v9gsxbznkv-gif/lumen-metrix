import { describe, expect, it } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

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

describe("pco.getDashboardData serving data", () => {
  it("returns serving data with avg_weekly populated", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.pco.getDashboardData();

    expect(result).toBeDefined();
    expect(result.serving).toBeDefined();
    expect(result.serving.length).toBeGreaterThan(0);

    console.log("=== All serving data ===");
    result.serving.forEach((s) => {
      console.log(`Year: ${s.year}, Campus: ${s.campus}, avg_weekly: ${s.avg_weekly}, total: ${s.total}`);
    });

    // Check 2026 serving data specifically
    const serving2026 = result.serving.filter((s) => s.year === 2026);
    console.log("\n=== 2026 serving data ===");
    serving2026.forEach((s) => {
      console.log(`Campus: ${s.campus}, avg_weekly: ${s.avg_weekly}, total: ${s.total}`);
    });

    expect(serving2026.length).toBeGreaterThan(0);
    
    // All 2026 serving records should have avg_weekly defined
    serving2026.forEach((s) => {
      expect(s.avg_weekly).toBeDefined();
      expect(typeof s.avg_weekly).toBe("number");
    });
  });

  it("computes volunteer_ratio correctly from serving and attendance data", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.pco.getDashboardData();

    // Manually compute volunteer_ratio like the frontend does
    const attendance = result.attendance;
    const serving = result.serving;

    const vr: any[] = [];
    const individualCampuses = ["Canton", "Jasper"];

    // Compute ratio for each individual campus
    for (const s of serving) {
      if (!individualCampuses.includes(s.campus)) continue;
      const att = attendance.find(
        (a) => a.year === s.year && a.campus === s.campus && a.subgroup === "Total"
      );
      if (!att || att.avg_weekly === 0 || s.avg_weekly === 0) continue;

      const ratio = att.avg_weekly / s.avg_weekly;
      const pct = s.avg_weekly / att.avg_weekly;

      vr.push({
        year: s.year,
        campus: s.campus,
        avg_volunteers: s.avg_weekly,
        avg_attendance: att.avg_weekly,
        ratio: Math.round(ratio * 10) / 10,
        pct: Math.round(pct * 1000) / 1000,
      });
    }

    console.log("\n=== Computed volunteer_ratio ===");
    vr.forEach((v) => {
      console.log(`Year: ${v.year}, Campus: ${v.campus}, pct: ${v.pct}, avg_volunteers: ${v.avg_volunteers}, avg_attendance: ${v.avg_attendance}`);
    });

    // Should have at least 2026 Canton and Jasper
    const canton2026 = vr.find((v) => v.year === 2026 && v.campus === "Canton");
    const jasper2026 = vr.find((v) => v.year === 2026 && v.campus === "Jasper");

    console.log("\n=== 2026 ratios ===");
    if (canton2026) console.log("Canton 2026:", canton2026);
    if (jasper2026) console.log("Jasper 2026:", jasper2026);

    expect(canton2026).toBeDefined();
    expect(jasper2026).toBeDefined();
    if (canton2026) expect(canton2026.pct).toBeGreaterThan(0);
    if (jasper2026) expect(jasper2026.pct).toBeGreaterThan(0);
  });
});
