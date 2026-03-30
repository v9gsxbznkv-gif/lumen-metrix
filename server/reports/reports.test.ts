import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// Mock getDb to return a mock database
const mockInsertValues = vi.fn().mockResolvedValue(undefined);
const mockSelectFrom = vi.fn();
const mockUpdateSet = vi.fn();
const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);

// Default: empty results
mockSelectFrom.mockReturnValue({
  orderBy: vi.fn().mockResolvedValue([]),
  where: vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue([]),
  }),
});

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: () => ({
      from: mockSelectFrom,
    }),
    insert: () => ({
      values: mockInsertValues,
    }),
    update: () => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: () => ({
      where: mockDeleteWhere,
    }),
  }),
}));

vi.mock("../_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "AI summary of the report." } }],
  }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("reports router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock behavior
    mockSelectFrom.mockReturnValue({
      orderBy: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    caller = appRouter.createCaller(createTestContext());
  });

  describe("reports.list", () => {
    it("returns an empty list when no reports exist", async () => {
      const result = await caller.reports.list();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe("reports.save", () => {
    it("saves a new report config", async () => {
      const input = {
        reportId: "report_123",
        name: "Test Report",
        campus: "All Campuses",
        yearStart: 2020,
        yearEnd: 2026,
        sections: [
          { id: "att_overview", type: "attendance" as const, label: "Attendance Overview", enabled: true },
        ],
      };
      const result = await caller.reports.save(input);
      expect(result).toEqual({ success: true });
      expect(mockInsertValues).toHaveBeenCalled();
    });

    it("rejects invalid report name (empty)", async () => {
      await expect(
        caller.reports.save({
          reportId: "report_123",
          name: "",
          campus: "All Campuses",
          yearStart: 2020,
          yearEnd: 2026,
          sections: [],
        })
      ).rejects.toThrow();
    });
  });

  describe("reports.delete", () => {
    it("deletes a report and its schedule", async () => {
      const result = await caller.reports.delete({ reportId: "report_123" });
      expect(result).toEqual({ success: true });
      // Should delete from both tables
      expect(mockDeleteWhere).toHaveBeenCalledTimes(2);
    });
  });

  describe("reports.saveSchedule", () => {
    it("saves a weekly schedule with a next run date", async () => {
      const result = await caller.reports.saveSchedule({
        reportId: "report_123",
        schedule: {
          frequency: "weekly",
          dayOfWeek: 1,
          email: "pastor@church.com",
          enabled: true,
        },
      });
      expect(result.success).toBe(true);
      expect(result.nextRunAt).toBeDefined();
      expect(result.nextRunAt).not.toBeNull();
    });

    it("saves a monthly schedule", async () => {
      const result = await caller.reports.saveSchedule({
        reportId: "report_123",
        schedule: {
          frequency: "monthly",
          dayOfMonth: 15,
          email: "pastor@church.com",
          enabled: true,
        },
      });
      expect(result.success).toBe(true);
      expect(result.nextRunAt).toBeDefined();
    });

    it("saves a quarterly schedule", async () => {
      const result = await caller.reports.saveSchedule({
        reportId: "report_123",
        schedule: {
          frequency: "quarterly",
          dayOfMonth: 1,
          email: "pastor@church.com",
          enabled: true,
        },
      });
      expect(result.success).toBe(true);
    });

    it("returns null nextRunAt when schedule is disabled", async () => {
      const result = await caller.reports.saveSchedule({
        reportId: "report_123",
        schedule: {
          frequency: "weekly",
          dayOfWeek: 1,
          email: "pastor@church.com",
          enabled: false,
        },
      });
      expect(result.success).toBe(true);
      expect(result.nextRunAt).toBeNull();
    });

    it("rejects invalid email", async () => {
      await expect(
        caller.reports.saveSchedule({
          reportId: "report_123",
          schedule: {
            frequency: "weekly",
            dayOfWeek: 1,
            email: "not-an-email",
            enabled: true,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("reports.deleteSchedule", () => {
    it("deletes a schedule", async () => {
      const result = await caller.reports.deleteSchedule({ reportId: "report_123" });
      expect(result).toEqual({ success: true });
    });
  });

  describe("reports.sendReport", () => {
    it("sends a report with AI summary via notification", async () => {
      const result = await caller.reports.sendReport({
        reportId: "report_123",
        reportName: "Test Report",
        email: "pastor@church.com",
        reportSummary: "Attendance: 3968, Giving: $2.3M",
      });
      expect(result.success).toBe(true);
      expect(result.aiSummary).toBe("AI summary of the report.");
    });
  });
});
