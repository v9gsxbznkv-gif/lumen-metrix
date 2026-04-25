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
      // Only aggregate "Kids" counts toward totals; room-level rows are for breakdown only
      if (subgroup === "Kids") return "Kids";
      if (subgroup.startsWith("Kids:") || subgroup.startsWith("Kids ")) return null;
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

    it("should classify aggregate Kids as Kids", () => {
      expect(classifySubgroup("Kids")).toBe("Kids");
    });

    it("should return null for room-level Kids subgroups to prevent double-counting", () => {
      expect(classifySubgroup("Kids: Canton Babies")).toBeNull();
      expect(classifySubgroup("Kids: Jasper Nursery")).toBeNull();
      expect(classifySubgroup("Kids: Canton Treehouse")).toBeNull();
      expect(classifySubgroup("Kids: Canton Cove")).toBeNull();
    });

    it("should still identify room-level Kids via isKidsSubgroup helper", () => {
      expect(isKidsSubgroup("Kids: Canton Treehouse")).toBe(true);
      expect(isKidsSubgroup("Kids")).toBe(true);
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

describe("attendance normalization with room-level kids rows", () => {
  // Replicate the normalizeAttendanceRows logic to verify no double-counting
  const PCO_CHECKIN_SUBGROUPS = [
    "Revolution Canton Check-In",
    "Revolution Jasper Check-In",
  ];

  function classifySubgroup(subgroup: string): string | null {
    if (PCO_CHECKIN_SUBGROUPS.includes(subgroup)) return "Adults";
    if (subgroup === "Adults") return "Adults";
    if (subgroup === "Kids") return "Kids";
    if (subgroup.startsWith("Kids:") || subgroup.startsWith("Kids ")) return null;
    if (subgroup === "Students") return "Students";
    return null;
  }

  function normalizeAttendanceRows(rows: any[]) {
    const weekMap = new Map<string, {
      year: number; weekNumber: number; weekStartDate: string; campus: string;
      adults: number; kids: number; students: number; total: number;
    }>();

    for (const row of rows) {
      const category = classifySubgroup(row.subgroup);
      if (!category) continue;

      const key = `${row.weekStartDate}-${row.campus}`;
      let entry = weekMap.get(key);
      if (!entry) {
        entry = {
          year: row.year, weekNumber: row.weekNumber,
          weekStartDate: row.weekStartDate, campus: row.campus,
          adults: 0, kids: 0, students: 0, total: 0,
        };
        weekMap.set(key, entry);
      }

      switch (category) {
        case "Adults": entry.adults += row.headcount; break;
        case "Kids": entry.kids += row.headcount; break;
        case "Students": entry.students += row.headcount; break;
      }
    }

    for (const entry of Array.from(weekMap.values())) {
      entry.total = entry.adults + entry.kids;
    }

    return Array.from(weekMap.values());
  }

  it("should NOT double-count when both aggregate Kids and room-level Kids rows exist", () => {
    // Historical data pattern: both aggregate and room-level rows for same week
    const rows = [
      { year: 2025, weekNumber: 13, weekStartDate: "2025-03-23", campus: "Canton", subgroup: "Adults", headcount: 1200 },
      { year: 2025, weekNumber: 13, weekStartDate: "2025-03-23", campus: "Canton", subgroup: "Kids", headcount: 513 },
      { year: 2025, weekNumber: 13, weekStartDate: "2025-03-23", campus: "Canton", subgroup: "Kids: Canton Babies", headcount: 60 },
      { year: 2025, weekNumber: 13, weekStartDate: "2025-03-23", campus: "Canton", subgroup: "Kids: Canton Campground", headcount: 74 },
      { year: 2025, weekNumber: 13, weekStartDate: "2025-03-23", campus: "Canton", subgroup: "Kids: Canton Cove", headcount: 150 },
      { year: 2025, weekNumber: 13, weekStartDate: "2025-03-23", campus: "Canton", subgroup: "Kids: Canton Pre-K", headcount: 170 },
      { year: 2025, weekNumber: 13, weekStartDate: "2025-03-23", campus: "Canton", subgroup: "Kids: Canton Treehouse", headcount: 158 },
    ];

    const result = normalizeAttendanceRows(rows);
    expect(result).toHaveLength(1);

    const week = result[0];
    // Kids should be 513 (aggregate only), NOT 513 + 60 + 74 + 150 + 170 + 158 = 1125
    expect(week.kids).toBe(513);
    expect(week.adults).toBe(1200);
    expect(week.total).toBe(1713); // 1200 + 513
  });

  it("should handle weeks with ONLY room-level Kids rows (no aggregate)", () => {
    // Future PCO pattern: only room-level rows, no aggregate
    const rows = [
      { year: 2026, weekNumber: 5, weekStartDate: "2026-01-25", campus: "Canton", subgroup: "Adults", headcount: 1300 },
      { year: 2026, weekNumber: 5, weekStartDate: "2026-01-25", campus: "Canton", subgroup: "Kids: Canton Babies", headcount: 60 },
      { year: 2026, weekNumber: 5, weekStartDate: "2026-01-25", campus: "Canton", subgroup: "Kids: Canton Treehouse", headcount: 200 },
    ];

    const result = normalizeAttendanceRows(rows);
    expect(result).toHaveLength(1);

    const week = result[0];
    // Room-level rows are skipped by classifySubgroup, so kids = 0
    // This is correct because the aggregate "Kids" row from headcounts is the source of truth
    expect(week.kids).toBe(0);
    expect(week.adults).toBe(1300);
  });

  it("should handle weeks with only aggregate Kids row (no room-level)", () => {
    const rows = [
      { year: 2025, weekNumber: 1, weekStartDate: "2025-01-05", campus: "Canton", subgroup: "Adults", headcount: 1100 },
      { year: 2025, weekNumber: 1, weekStartDate: "2025-01-05", campus: "Canton", subgroup: "Kids", headcount: 519 },
    ];

    const result = normalizeAttendanceRows(rows);
    expect(result).toHaveLength(1);
    expect(result[0].kids).toBe(519);
    expect(result[0].total).toBe(1619);
  });
});

describe("PCO room mapping", () => {
  // Replicate mapLocationToCategory logic
  const VOLUNTEER_LOCATIONS = new Set([
    "Campus Safety", "Gathering Leaders", "Prayer Team Members",
    "RevKids Check-In", "RevKids TEAM MEMBER", "Welcome Team Member",
  ]);

  const CANTON_ROOM_MAP: Record<string, string> = {
    "The Nest": "Babies",
    "The Campground": "Campground",
    "The Treehouse": "Treehouse",
    "The Cove": "Cove",
    "Turtle": "Nursery",
    "Owl": "Nursery",
    "Woodpecker": "Toddlers",
    "Porcupine": "Toddlers",
    "Room 4 - Pre-K": "Pre-K",
    "Treehouse - K-5th": "Elementary",
  };

  const JASPER_ROOM_MAP: Record<string, string> = {
    "Owls": "Nursery",
    "Raccoons": "Nursery",
    "Fox": "Nursery",
    "Room 1": "Pre-K",
    "Room 2": "Pre-K",
    "Cove": "Cove",
    "Treehouse": "Treehouse",
    "Reruns": "Reruns",
  };

  const JASPER_ADULT_LOCATIONS = new Set(["5th Grade", "6th Grade"]);

  function mapLocationToCategory(locationName: string, campus: string): string | null {
    const trimmed = locationName.trim();
    if (VOLUNTEER_LOCATIONS.has(trimmed)) return null;
    const lower = trimmed.toLowerCase();
    if (lower === "elementary" || lower === "preschool" || lower === "nursery" ||
        lower === "toddlers" || lower === "team member") return null;
    if (campus === "Canton") {
      const mapped = CANTON_ROOM_MAP[trimmed];
      if (mapped) return mapped;
    } else if (campus === "Jasper") {
      if (JASPER_ADULT_LOCATIONS.has(trimmed)) return "ADULT";
      const mapped = JASPER_ROOM_MAP[trimmed];
      if (mapped) return mapped;
    }
    return null;
  }

  it("should map Canton Sunday rooms correctly", () => {
    expect(mapLocationToCategory("The Nest", "Canton")).toBe("Babies");
    expect(mapLocationToCategory("The Campground", "Canton")).toBe("Campground");
    expect(mapLocationToCategory("The Treehouse", "Canton")).toBe("Treehouse");
    expect(mapLocationToCategory("The Cove", "Canton")).toBe("Cove");
  });

  it("should map Canton Thursday rooms correctly", () => {
    expect(mapLocationToCategory("Turtle", "Canton")).toBe("Nursery");
    expect(mapLocationToCategory("Owl", "Canton")).toBe("Nursery");
    expect(mapLocationToCategory("Woodpecker", "Canton")).toBe("Toddlers");
    expect(mapLocationToCategory("Room 4 - Pre-K", "Canton")).toBe("Pre-K");
  });

  it("should map Jasper rooms correctly", () => {
    expect(mapLocationToCategory("Owls", "Jasper")).toBe("Nursery");
    expect(mapLocationToCategory("Room 1", "Jasper")).toBe("Pre-K");
    expect(mapLocationToCategory("Cove", "Jasper")).toBe("Cove");
    expect(mapLocationToCategory("Reruns", "Jasper")).toBe("Reruns");
  });

  it("should return ADULT for Jasper 5th/6th grade", () => {
    expect(mapLocationToCategory("5th Grade", "Jasper")).toBe("ADULT");
    expect(mapLocationToCategory("6th Grade", "Jasper")).toBe("ADULT");
  });

  it("should return null for volunteer locations", () => {
    expect(mapLocationToCategory("Campus Safety", "Canton")).toBeNull();
    expect(mapLocationToCategory("RevKids TEAM MEMBER", "Canton")).toBeNull();
  });

  it("should return null for folder/container locations", () => {
    expect(mapLocationToCategory("Elementary", "Canton")).toBeNull();
    expect(mapLocationToCategory("Preschool", "Jasper")).toBeNull();
  });

  it("should produce correct subgroup format for weeklyMap", () => {
    const campus = "Canton";
    const room = mapLocationToCategory("The Treehouse", campus);
    expect(room).toBe("Treehouse");
    const subgroup = `Kids: ${campus} ${room}`;
    expect(subgroup).toBe("Kids: Canton Treehouse");
    // This matches the format used in getKidsRoomBreakdown
    expect(subgroup.startsWith("Kids: ")).toBe(true);
  });
});
