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

  describe("attendance subgroup classification", () => {
    // Replicate the classifySubgroup logic from the router
    const PCO_CHECKIN_SUBGROUPS = [
      "Revolution Canton Check-In",
      "Revolution Jasper Check-In",
      "Revolution Online Check-In",
    ];
    const PCO_STUDENTS_SUBGROUPS = [
      "RevStudents | Canton Campus",
      "RevStudents | Jasper Campus",
      "RevStudents | Online Campus",
    ];
    const PCO_YOUNG_ADULTS_SUBGROUPS = ["YA Gathering", "Young Adults"];

    function isKidsSubgroup(subgroup: string): boolean {
      return subgroup === "Kids" || subgroup.startsWith("Kids:") || subgroup.startsWith("Kids ");
    }

    function classifySubgroup(subgroup: string): string | null {
      if (PCO_CHECKIN_SUBGROUPS.includes(subgroup)) return "Adults";
      if (subgroup === "Adults") return "Adults";
      if (isKidsSubgroup(subgroup)) return "Kids";
      if (subgroup === "RevStudents HS" || subgroup === "RevStudents MS" ||
          subgroup === "RevStudents Attendance" || subgroup === "Students" ||
          PCO_STUDENTS_SUBGROUPS.includes(subgroup)) return "Students";
      if (subgroup === "Online") return "Online";
      if (subgroup === "Volunteers") return "Volunteers";
      if (PCO_YOUNG_ADULTS_SUBGROUPS.includes(subgroup)) return "Young Adults";
      if (subgroup === "FTG Adults" || subgroup === "FTG Kids" ||
          subgroup === "RevStudents FTG" || subgroup === "YA FTG" ||
          subgroup === "FTG") return "FTG";
      return null;
    }

    it("should classify PCO check-in subgroups as Adults", () => {
      expect(classifySubgroup("Revolution Canton Check-In")).toBe("Adults");
      expect(classifySubgroup("Revolution Jasper Check-In")).toBe("Adults");
      expect(classifySubgroup("Adults")).toBe("Adults");
    });

    it("should classify kids subgroups correctly", () => {
      expect(classifySubgroup("Kids")).toBe("Kids");
      expect(classifySubgroup("Kids: Canton Babies")).toBe("Kids");
      expect(classifySubgroup("Kids: Jasper Nursery")).toBe("Kids");
      expect(isKidsSubgroup("Kids: Canton Treehouse")).toBe(true);
      expect(isKidsSubgroup("Adults")).toBe(false);
    });

    it("should classify students subgroups correctly", () => {
      expect(classifySubgroup("RevStudents HS")).toBe("Students");
      expect(classifySubgroup("RevStudents MS")).toBe("Students");
      expect(classifySubgroup("Students")).toBe("Students");
    });

    it("should classify FTG subgroups correctly", () => {
      expect(classifySubgroup("FTG Adults")).toBe("FTG");
      expect(classifySubgroup("FTG Kids")).toBe("FTG");
      expect(classifySubgroup("RevStudents FTG")).toBe("FTG");
    });

    it("should return null for unknown subgroups", () => {
      expect(classifySubgroup("RevStudents Salvations")).toBeNull();
      expect(classifySubgroup("Baptisms")).toBeNull();
    });
  });

  describe("kids room breakdown aggregation", () => {
    it("should compute average weekly headcount per room", () => {
      const kidsRows = [
        { subgroup: "Kids: Canton Babies", campus: "Canton", headcount: 50 },
        { subgroup: "Kids: Canton Babies", campus: "Canton", headcount: 60 },
        { subgroup: "Kids: Canton Babies", campus: "Canton", headcount: 55 },
        { subgroup: "Kids: Canton Treehouse", campus: "Canton", headcount: 200 },
        { subgroup: "Kids: Canton Treehouse", campus: "Canton", headcount: 220 },
        { subgroup: "Kids: Jasper Nursery", campus: "Jasper", headcount: 30 },
        { subgroup: "Kids: Jasper Nursery", campus: "Jasper", headcount: 25 },
      ];

      const subgroupMap = new Map<string, { total: number; weeks: number; campus: string }>();
      for (const row of kidsRows) {
        const existing = subgroupMap.get(row.subgroup);
        if (existing) {
          existing.total += row.headcount;
          existing.weeks += 1;
        } else {
          subgroupMap.set(row.subgroup, { total: row.headcount, weeks: 1, campus: row.campus });
        }
      }

      const result = Array.from(subgroupMap.entries()).map(([subgroup, data]) => {
        const parts = subgroup.replace("Kids: ", "").split(" ");
        const roomCampus = parts[0];
        const roomName = parts.slice(1).join(" ");
        return {
          subgroup,
          campus: roomCampus,
          room: roomName,
          avgWeekly: Math.round(data.total / data.weeks),
          totalHeadcount: data.total,
          weekCount: data.weeks,
        };
      });

      const babies = result.find(r => r.room === "Babies");
      expect(babies).toBeDefined();
      expect(babies!.avgWeekly).toBe(55); // (50+60+55)/3 = 55
      expect(babies!.weekCount).toBe(3);
      expect(babies!.campus).toBe("Canton");

      const treehouse = result.find(r => r.room === "Treehouse");
      expect(treehouse).toBeDefined();
      expect(treehouse!.avgWeekly).toBe(210); // (200+220)/2 = 210
      expect(treehouse!.weekCount).toBe(2);

      const nursery = result.find(r => r.room === "Nursery");
      expect(nursery).toBeDefined();
      expect(nursery!.avgWeekly).toBe(28); // (30+25)/2 = 27.5 → 28
      expect(nursery!.campus).toBe("Jasper");
    });

    it("should filter only Kids: prefixed subgroups", () => {
      const rows = [
        { subgroup: "Kids: Canton Babies", campus: "Canton", headcount: 50 },
        { subgroup: "Kids", campus: "Canton", headcount: 500 },
        { subgroup: "Adults", campus: "Canton", headcount: 1200 },
        { subgroup: "Students", campus: "Canton", headcount: 200 },
      ];

      const kidsRoomRows = rows.filter(r => r.subgroup.startsWith("Kids: "));
      expect(kidsRoomRows).toHaveLength(1);
      expect(kidsRoomRows[0].subgroup).toBe("Kids: Canton Babies");
    });

    it("should parse room name correctly from subgroup", () => {
      const subgroup = "Kids: Canton Pre-K";
      const parts = subgroup.replace("Kids: ", "").split(" ");
      const campus = parts[0];
      const room = parts.slice(1).join(" ");
      expect(campus).toBe("Canton");
      expect(room).toBe("Pre-K");
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
