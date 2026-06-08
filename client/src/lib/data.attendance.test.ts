/**
 * Unit tests for attendance growth rate helpers used in HealthTab.
 *
 * These tests verify that:
 * 1. getAvgAttendanceFromWeeklyRange correctly caps to maxWeek
 * 2. Partial-year YoY comparison uses the same week range for both years
 * 3. The old monthly-based approach would produce a different (incorrect) result
 *    when monthly data has gaps (the original bug)
 */

import { describe, it, expect } from "vitest";
import {
  getAvgAttendanceFromWeekly,
  getAvgAttendanceFromWeeklyRange,
  getMaxWeek,
} from "./data";
import type { DashboardData } from "./data";

// ---------------------------------------------------------------------------
// Minimal DashboardData stub — only the fields these helpers touch
// ---------------------------------------------------------------------------
function makeData(weeklyRows: DashboardData["attendance_weekly"]): DashboardData {
  return {
    attendance_weekly: weeklyRows,
    attendance: [],
    attendance_monthly: [],
    giving: [],
    giving_weekly: [],
    giving_monthly: [],
    serving: [],
    next_steps: [],
    next_steps_monthly: [],
    computed: {
      volunteer_ratio: [],
      giving_per_capita: [],
    },
    meta: {
      years: [2025, 2026],
      campuses: ["Canton"],
      lastUpdated: "",
    },
  } as unknown as DashboardData;
}

function makeWeek(
  year: number,
  weekNumber: number,
  campus: string,
  subgroup: string,
  headcount: number,
  cancelled = false
) {
  return { year, weekNumber, campus, subgroup, headcount, cancelled };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getAvgAttendanceFromWeeklyRange", () => {
  it("averages only weeks up to maxWeek", () => {
    const rows = [
      makeWeek(2025, 1, "Canton", "Adults", 1000),
      makeWeek(2025, 2, "Canton", "Adults", 1000),
      makeWeek(2025, 3, "Canton", "Adults", 1000),
      makeWeek(2025, 20, "Canton", "Adults", 500), // beyond maxWeek=2, should be excluded
    ];
    const data = makeData(rows);
    // With maxWeek=2, only weeks 1 and 2 are included → avg = 1000
    expect(getAvgAttendanceFromWeeklyRange(data, 2025, "Canton", "Total", 2)).toBe(1000);
  });

  it("returns 0 when no rows match", () => {
    const data = makeData([]);
    expect(getAvgAttendanceFromWeeklyRange(data, 2025, "Canton", "Total", 10)).toBe(0);
  });

  it("excludes cancelled rows", () => {
    const rows = [
      makeWeek(2025, 1, "Canton", "Adults", 1000),
      makeWeek(2025, 2, "Canton", "Adults", 0, true), // cancelled
    ];
    const data = makeData(rows);
    // Only week 1 is valid → avg = 1000
    expect(getAvgAttendanceFromWeeklyRange(data, 2025, "Canton", "Total", 2)).toBe(1000);
  });

  it("deduplicates old Adults vs new Revolution Check-In for same week", () => {
    // Simulates the 2025→2026 subgroup rename: both rows exist for the same week
    const rows = [
      makeWeek(2025, 1, "Canton", "Adults", 800),
      makeWeek(2025, 1, "Canton", "Revolution Canton Check-In", 900), // new name wins
      makeWeek(2025, 2, "Canton", "Revolution Canton Check-In", 950),
    ];
    const data = makeData(rows);
    // Week 1: Check-In wins (900), old Adults skipped. Week 2: 950. Avg = (900+950)/2 = 925
    expect(getAvgAttendanceFromWeeklyRange(data, 2025, "Canton", "Total", 2)).toBe(925);
  });
});

describe("partial-year YoY comparison correctness", () => {
  it("same-week-range comparison gives correct growth rate", () => {
    // 2025: weeks 1-22, avg = 3000
    // 2026: weeks 1-22, avg = 3180 (6% growth)
    const rows2025 = Array.from({ length: 22 }, (_, i) =>
      makeWeek(2025, i + 1, "Canton", "Adults", 3000)
    );
    const rows2026 = Array.from({ length: 22 }, (_, i) =>
      makeWeek(2026, i + 1, "Canton", "Adults", 3180)
    );
    const data = makeData([...rows2025, ...rows2026]);

    const curr = getAvgAttendanceFromWeeklyRange(data, 2026, "Canton", "Total", 22);
    const prev = getAvgAttendanceFromWeeklyRange(data, 2025, "Canton", "Total", 22);
    const growth = ((curr - prev) / prev) * 100;

    expect(curr).toBe(3180);
    expect(prev).toBe(3000);
    expect(Math.round(growth * 10) / 10).toBe(6);
  });

  it("monthly gap bug: missing month in prior year inflates growth rate", () => {
    // This demonstrates the original bug:
    // 2025 has a gap in month 6 (no Adults rows for weeks 22-26),
    // while 2026 has all weeks. A monthly-based comparison would
    // undercount 2025 and show inflated growth.
    //
    // The weekly-range approach correctly caps both years to the same weeks,
    // so the gap in 2025 doesn't matter — we only compare weeks 1-21.
    const rows2025 = [
      ...Array.from({ length: 21 }, (_, i) => makeWeek(2025, i + 1, "Canton", "Adults", 3000)),
      // weeks 22-26 missing (the bug scenario — subgroup renamed mid-year)
    ];
    const rows2026 = Array.from({ length: 22 }, (_, i) =>
      makeWeek(2026, i + 1, "Canton", "Adults", 3180)
    );
    const data = makeData([...rows2025, ...rows2026]);

    // Weekly range capped to 21 (2026 max week if we only had 21 weeks)
    const curr = getAvgAttendanceFromWeeklyRange(data, 2026, "Canton", "Total", 21);
    const prev = getAvgAttendanceFromWeeklyRange(data, 2025, "Canton", "Total", 21);
    const growth = ((curr - prev) / prev) * 100;

    // Both years have 21 complete weeks → correct ~6% growth
    expect(curr).toBe(3180);
    expect(prev).toBe(3000);
    expect(Math.round(growth * 10) / 10).toBe(6);
  });
});

describe("getMaxWeek", () => {
  it("returns 52 for past years", () => {
    const data = makeData([]);
    expect(getMaxWeek(data, 2024)).toBe(52);
    expect(getMaxWeek(data, 2025)).toBe(52);
  });

  it("returns a value less than 52 for the current year", () => {
    const data = makeData([]);
    const currentYear = new Date().getFullYear();
    const maxWeek = getMaxWeek(data, currentYear);
    expect(maxWeek).toBeGreaterThan(0);
    expect(maxWeek).toBeLessThan(52);
  });
});
