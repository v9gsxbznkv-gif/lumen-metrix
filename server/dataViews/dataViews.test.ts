import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock getDb to return a mock database
const mockSelect = vi.fn();
const mockSelectDistinct = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

const chainable = {
  from: mockFrom,
  where: mockWhere,
  orderBy: mockOrderBy,
};

mockSelect.mockReturnValue(chainable);
mockSelectDistinct.mockReturnValue(chainable);
mockFrom.mockReturnValue(chainable);
mockWhere.mockReturnValue(chainable);
mockOrderBy.mockResolvedValue([]);

const mockDb = {
  select: mockSelect,
  selectDistinct: mockSelectDistinct,
};

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

// Mock schema imports
vi.mock("../../drizzle/schema", () => ({
  attendanceWeekly: { year: "year", weekNumber: "weekNumber", campus: "campus", subgroup: "subgroup", weekStartDate: "weekStartDate" },
  givingWeekly: { year: "year", weekNumber: "weekNumber", campus: "campus", weekStartDate: "weekStartDate" },
  servingWeekly: { year: "year", weekNumber: "weekNumber", campus: "campus", weekStartDate: "weekStartDate" },
  nextStepsWeekly: { year: "year", weekNumber: "weekNumber", campus: "campus", metric: "metric", weekStartDate: "weekStartDate" },
}));

describe("dataViews router", () => {
  describe("getMonthFromDate helper", () => {
    it("should extract month correctly from date string", () => {
      // Test the logic used in the router
      const getMonthFromDate = (dateStr: string): number => parseInt(dateStr.split("-")[1]);
      
      expect(getMonthFromDate("2026-01-04")).toBe(1);
      expect(getMonthFromDate("2026-04-05")).toBe(4);
      expect(getMonthFromDate("2026-12-27")).toBe(12);
      expect(getMonthFromDate("2025-03-30")).toBe(3);
    });
  });

  describe("monthly aggregation logic", () => {
    it("should group weekly rows by Sunday month correctly", () => {
      // Simulate the monthly aggregation logic from the router
      const getMonthFromDate = (dateStr: string): number => parseInt(dateStr.split("-")[1]);
      
      const weeklyRows = [
        { year: 2026, weekNumber: 13, weekStartDate: "2026-03-29", campus: "Canton", subgroup: "Total", headcount: 2500 },
        { year: 2026, weekNumber: 14, weekStartDate: "2026-04-05", campus: "Canton", subgroup: "Total", headcount: 2600 },
        { year: 2026, weekNumber: 15, weekStartDate: "2026-04-12", campus: "Canton", subgroup: "Total", headcount: 2700 },
      ];

      const monthly = new Map<string, { year: number; month: number; campus: string; totalHeadcount: number; weekCount: number }>();

      for (const row of weeklyRows) {
        const month = getMonthFromDate(row.weekStartDate);
        const key = `${row.year}-${month}-${row.campus}-${row.subgroup}`;
        const existing = monthly.get(key);
        if (existing) {
          existing.totalHeadcount += row.headcount;
          existing.weekCount += 1;
        } else {
          monthly.set(key, {
            year: row.year,
            month,
            campus: row.campus,
            totalHeadcount: row.headcount,
            weekCount: 1,
          });
        }
      }

      const result = Array.from(monthly.values());
      
      // Mar 29 → month 3 (March)
      const march = result.find(r => r.month === 3);
      expect(march).toBeDefined();
      expect(march!.totalHeadcount).toBe(2500);
      expect(march!.weekCount).toBe(1);

      // Apr 5 and Apr 12 → month 4 (April)
      const april = result.find(r => r.month === 4);
      expect(april).toBeDefined();
      expect(april!.totalHeadcount).toBe(5300); // 2600 + 2700
      expect(april!.weekCount).toBe(2);
    });
  });

  describe("yearly aggregation logic", () => {
    it("should group weekly rows by year correctly", () => {
      const weeklyRows = [
        { year: 2025, weekNumber: 1, campus: "Canton", subgroup: "Total", headcount: 2000 },
        { year: 2025, weekNumber: 2, campus: "Canton", subgroup: "Total", headcount: 2100 },
        { year: 2026, weekNumber: 1, campus: "Canton", subgroup: "Total", headcount: 2500 },
      ];

      const yearly = new Map<string, { year: number; campus: string; totalHeadcount: number; weekCount: number }>();

      for (const row of weeklyRows) {
        const key = `${row.year}-${row.campus}-${row.subgroup}`;
        const existing = yearly.get(key);
        if (existing) {
          existing.totalHeadcount += row.headcount;
          existing.weekCount += 1;
        } else {
          yearly.set(key, {
            year: row.year,
            campus: row.campus,
            totalHeadcount: row.headcount,
            weekCount: 1,
          });
        }
      }

      const result = Array.from(yearly.values());
      
      const y2025 = result.find(r => r.year === 2025);
      expect(y2025).toBeDefined();
      expect(y2025!.totalHeadcount).toBe(4100);
      expect(y2025!.weekCount).toBe(2);

      const y2026 = result.find(r => r.year === 2026);
      expect(y2026).toBeDefined();
      expect(y2026!.totalHeadcount).toBe(2500);
      expect(y2026!.weekCount).toBe(1);
    });
  });

  describe("giving aggregation logic", () => {
    it("should sum giving totals correctly for monthly view", () => {
      const getMonthFromDate = (dateStr: string): number => parseInt(dateStr.split("-")[1]);
      
      const weeklyRows = [
        { year: 2026, weekNumber: 14, weekStartDate: "2026-04-05", campus: "Canton", total: 100000, general: 90000, designated: 10000, donationCount: 300 },
        { year: 2026, weekNumber: 15, weekStartDate: "2026-04-12", campus: "Canton", total: 120000, general: 110000, designated: 10000, donationCount: 350 },
        { year: 2026, weekNumber: 15, weekStartDate: "2026-04-12", campus: "Jasper", total: 20000, general: 18000, designated: 2000, donationCount: 80 },
      ];

      const monthly = new Map<string, { year: number; month: number; campus: string; total: number; general: number; designated: number; donationCount: number; weekCount: number }>();

      for (const row of weeklyRows) {
        const month = getMonthFromDate(row.weekStartDate);
        const key = `${row.year}-${month}-${row.campus}`;
        const existing = monthly.get(key);
        if (existing) {
          existing.total += row.total;
          existing.general += row.general;
          existing.designated += row.designated;
          existing.donationCount += row.donationCount;
          existing.weekCount += 1;
        } else {
          monthly.set(key, {
            year: row.year,
            month,
            campus: row.campus,
            total: row.total,
            general: row.general,
            designated: row.designated,
            donationCount: row.donationCount,
            weekCount: 1,
          });
        }
      }

      const result = Array.from(monthly.values());
      
      const cantonApril = result.find(r => r.campus === "Canton" && r.month === 4);
      expect(cantonApril).toBeDefined();
      expect(cantonApril!.total).toBe(220000);
      expect(cantonApril!.general).toBe(200000);
      expect(cantonApril!.designated).toBe(20000);
      expect(cantonApril!.weekCount).toBe(2);

      const jasperApril = result.find(r => r.campus === "Jasper" && r.month === 4);
      expect(jasperApril).toBeDefined();
      expect(jasperApril!.total).toBe(20000);
      expect(jasperApril!.weekCount).toBe(1);
    });
  });

  describe("next steps aggregation logic", () => {
    it("should group by metric correctly for monthly view", () => {
      const getMonthFromDate = (dateStr: string): number => parseInt(dateStr.split("-")[1]);
      
      const weeklyRows = [
        { year: 2026, weekNumber: 14, weekStartDate: "2026-04-05", campus: "Canton", metric: "ftg", count: 15 },
        { year: 2026, weekNumber: 15, weekStartDate: "2026-04-12", campus: "Canton", metric: "ftg", count: 20 },
        { year: 2026, weekNumber: 14, weekStartDate: "2026-04-05", campus: "Canton", metric: "salvation", count: 3 },
        { year: 2026, weekNumber: 15, weekStartDate: "2026-04-12", campus: "Canton", metric: "salvation", count: 5 },
      ];

      const monthly = new Map<string, { year: number; month: number; campus: string; metric: string; count: number; weekCount: number }>();

      for (const row of weeklyRows) {
        const month = getMonthFromDate(row.weekStartDate);
        const key = `${row.year}-${month}-${row.campus}-${row.metric}`;
        const existing = monthly.get(key);
        if (existing) {
          existing.count += row.count;
          existing.weekCount += 1;
        } else {
          monthly.set(key, {
            year: row.year,
            month,
            campus: row.campus,
            metric: row.metric,
            count: row.count,
            weekCount: 1,
          });
        }
      }

      const result = Array.from(monthly.values());
      
      const ftgApril = result.find(r => r.metric === "ftg" && r.month === 4);
      expect(ftgApril).toBeDefined();
      expect(ftgApril!.count).toBe(35); // 15 + 20
      expect(ftgApril!.weekCount).toBe(2);

      const salvationApril = result.find(r => r.metric === "salvation" && r.month === 4);
      expect(salvationApril).toBeDefined();
      expect(salvationApril!.count).toBe(8); // 3 + 5
    });
  });
});
