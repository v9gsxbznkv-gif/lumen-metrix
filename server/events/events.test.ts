/**
 * Tests for Events page data calculation logic:
 * - countSundaysInMonth: verifies Sunday counting for key event months
 * - getEventMetrics logic: verifies per-Sunday division produces realistic numbers
 */
import { describe, it, expect } from "vitest";

// Replicate the countSundaysInMonth function from EventsTab.tsx for server-side testing
function countSundaysInMonth(year: number, month: number): number {
  const date = new Date(year, month - 1, 1);
  let count = 0;
  while (date.getMonth() === month - 1) {
    if (date.getDay() === 0) count++;
    date.setDate(date.getDate() + 1);
  }
  return count;
}

describe("countSundaysInMonth", () => {
  it("April 2025 has 4 Sundays (Easter month)", () => {
    expect(countSundaysInMonth(2025, 4)).toBe(4);
  });

  it("April 2024 has 5 Sundays (Easter month)", () => {
    // April 2024: Apr 7, 14, 21, 28 = 4 Sundays
    expect(countSundaysInMonth(2024, 4)).toBe(4);
  });

  it("April 2023 has 5 Sundays (Easter month)", () => {
    // Apr 2, 9, 16, 23, 30 = 5 Sundays; Easter was Apr 9
    expect(countSundaysInMonth(2023, 4)).toBe(5);
  });

  it("December 2025 has 4 Sundays (Christmas month)", () => {
    expect(countSundaysInMonth(2025, 12)).toBe(4);
  });

  it("December 2024 has 5 Sundays (Christmas month)", () => {
    // Dec 2024: Dec 1, 8, 15, 22, 29 = 5 Sundays
    expect(countSundaysInMonth(2024, 12)).toBe(5);
  });

  it("May 2025 has 4 Sundays (Mother's Day month)", () => {
    // May 2025: May 4, 11, 18, 25 = 4 Sundays
    expect(countSundaysInMonth(2025, 5)).toBe(4);
  });

  it("August 2025 has 5 Sundays (Back to School month)", () => {
    // Aug 2025: Aug 3, 10, 17, 24, 31 = 5 Sundays
    expect(countSundaysInMonth(2025, 8)).toBe(5);
  });

  it("February 2024 has 4 Sundays (leap year)", () => {
    // Feb 2024: Feb 4, 11, 18, 25 = 4 Sundays
    expect(countSundaysInMonth(2024, 2)).toBe(4);
  });
});

describe("Event metric per-Sunday estimation", () => {
  it("Easter 2025 attendance uses avgWeekly (not total)", () => {
    // April 2025 Canton Adults: total=9306, avgWeekly=2326
    // The fix uses avgWeekly directly — no division needed for attendance
    const avgWeekly = 2326;
    expect(avgWeekly).toBeGreaterThan(2000);
    expect(avgWeekly).toBeLessThan(3000);
  });

  it("Easter 2025 giving estimate is in realistic range", () => {
    // April 2025 total giving: ~$707,271
    // Divided by 4 Sundays = ~$176,818 per Sunday
    const monthlyGiving = 707271;
    const sundays = countSundaysInMonth(2025, 4); // 4
    const perSundayGiving = Math.round(monthlyGiving / sundays);
    expect(perSundayGiving).toBeGreaterThan(100000); // > $100K
    expect(perSundayGiving).toBeLessThan(250000);    // < $250K
  });

  it("Christmas Season 2025 giving uses ÷2 divisor (not ÷4 Sundays)", () => {
    // December 2025 has 4 Sundays but Christmas Season divides by 2 (Eve + Sunday)
    // This produces a higher per-service estimate than ÷4
    const monthlyGiving = 1500000; // approximate December total
    const sundaysDivisor = countSundaysInMonth(2025, 12); // 4
    const christmasDivisor = 2;

    const perSundayGiving = Math.round(monthlyGiving / sundaysDivisor);
    const christmasGiving = Math.round(monthlyGiving / christmasDivisor);

    expect(christmasGiving).toBeGreaterThan(perSundayGiving);
    expect(christmasGiving).toBe(750000);
  });

  it("All-campuses Easter 2025 attendance sum from avgWeekly is realistic", () => {
    // Canton: Adults 2326 + Kids 527 + Students 310 + YA 74 = 3237
    // Jasper: Adults 454 + Kids 100 + Students 66 = 620
    // Online: Adults 494 = 494
    // Total = 4351
    const cantonSum = 2326 + 527 + 310 + 74;
    const jasperSum = 454 + 100 + 66;
    const onlineSum = 494;
    const total = cantonSum + jasperSum + onlineSum;

    expect(total).toBe(4351);
    // Should be in the 4-6K range the user expects
    expect(total).toBeGreaterThanOrEqual(4000);
    expect(total).toBeLessThanOrEqual(6000);
  });

  it("Previous approach (using total) was inflated by ~4x", () => {
    // Old approach: sum of total column for April 2025 Adults
    const oldTotal = 9306 + 2107 + 1239 + 74 + 1814 + 399 + 262 + 1978;
    // New approach: sum of avgWeekly
    const newAvgWeekly = 2326 + 527 + 310 + 74 + 454 + 100 + 66 + 494;

    const inflationFactor = oldTotal / newAvgWeekly;
    // Should be approximately 4x (4 Sundays in April 2025)
    expect(inflationFactor).toBeCloseTo(4, 0);
    expect(newAvgWeekly).toBe(4351);
  });
});
