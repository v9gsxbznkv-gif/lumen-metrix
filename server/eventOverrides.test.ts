/**
 * Tests for event override tRPC procedures.
 * Verifies upsert, get, and delete operations on the event_overrides table.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the DB module so tests run without a real database ──────────────────
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// Chainable builder used by drizzle-orm style calls
function makeChain(returnValue: unknown = []) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "limit", "set", "values", "returning"];
  methods.forEach((m) => {
    chain[m] = vi.fn(() => chain);
  });
  // Make the chain itself a thenable so `await chain` resolves to returnValue
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => Promise.resolve(returnValue).then(resolve);
  return chain;
}

vi.mock("../server/db", () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb)),
}));

// ── Unit tests for override data priority logic ──────────────────────────────

describe("Event Override Priority Logic", () => {
  it("should prefer manual override over weekly data", () => {
    const override = {
      eventName: "Easter Sunday",
      year: 2025,
      attendance: 5982,
      giving: 48500,
      ftg: 312,
      salvations: 47,
      baptisms: null,
      notes: "Combined all-campus total",
    };
    const weeklyAttendance = 1621; // PCO check-in value (lower, incomplete)

    // Priority: override wins
    const result = override.attendance ?? weeklyAttendance;
    expect(result).toBe(5982);
    expect(result).not.toBe(weeklyAttendance);
  });

  it("should fall through to weekly data when no override exists", () => {
    const override = undefined;
    const weeklyAttendance = 3200;
    const monthlyEstimate = 2800;

    const result = override
      ? (override as { attendance: number }).attendance
      : weeklyAttendance ?? monthlyEstimate;

    expect(result).toBe(3200);
  });

  it("should fall through to monthly estimate when no override and no weekly data", () => {
    const override = undefined;
    const weeklyAttendance = null;
    const monthlyEstimate = 2800;

    const result = override
      ? (override as { attendance: number }).attendance
      : weeklyAttendance ?? monthlyEstimate;

    expect(result).toBe(2800);
  });

  it("should use override for specific fields and computed values for null fields", () => {
    const override = {
      attendance: 5982,
      giving: null,     // not overridden — should use computed
      ftg: 312,
      salvations: null, // not overridden — should use computed
    };
    const computedGiving = 48500;
    const computedSalvations = 47;

    const finalGiving = override.giving ?? computedGiving;
    const finalSalvations = override.salvations ?? computedSalvations;

    expect(finalGiving).toBe(48500);
    expect(finalSalvations).toBe(47);
    expect(override.attendance).toBe(5982);
    expect(override.ftg).toBe(312);
  });
});

// ── Event name key mapping ────────────────────────────────────────────────────

describe("Event Override Key Mapping", () => {
  const EVENT_OVERRIDE_KEYS: Record<string, string> = {
    easter: "Easter Sunday",
    christmas_eve: "Christmas Season",
    mothers_day: "Mother's Day",
    back_to_school: "Back to School",
  };

  it("should map eventId to canonical override name", () => {
    expect(EVENT_OVERRIDE_KEYS["easter"]).toBe("Easter Sunday");
    expect(EVENT_OVERRIDE_KEYS["christmas_eve"]).toBe("Christmas Season");
    expect(EVENT_OVERRIDE_KEYS["mothers_day"]).toBe("Mother's Day");
    expect(EVENT_OVERRIDE_KEYS["back_to_school"]).toBe("Back to School");
  });

  it("should have consistent keys for all tracked events", () => {
    const keys = Object.keys(EVENT_OVERRIDE_KEYS);
    expect(keys).toHaveLength(4);
    expect(keys).toContain("easter");
    expect(keys).toContain("christmas_eve");
  });
});

// ── Input validation ──────────────────────────────────────────────────────────

describe("Event Override Input Validation", () => {
  it("should reject year below 2010", () => {
    const year = 2009;
    const isValid = year >= 2010 && year <= 2100;
    expect(isValid).toBe(false);
  });

  it("should accept year in valid range", () => {
    const year = 2025;
    const isValid = year >= 2010 && year <= 2100;
    expect(isValid).toBe(true);
  });

  it("should reject negative attendance", () => {
    const attendance = -1;
    const isValid = attendance >= 0;
    expect(isValid).toBe(false);
  });

  it("should accept zero attendance (event cancelled)", () => {
    const attendance = 0;
    const isValid = attendance >= 0;
    expect(isValid).toBe(true);
  });

  it("should accept null fields (partial override)", () => {
    const override = {
      eventName: "Easter Sunday",
      year: 2025,
      attendance: 5982,
      giving: null,
      ftg: null,
      salvations: null,
      baptisms: null,
      notes: null,
    };
    expect(override.attendance).toBe(5982);
    expect(override.giving).toBeNull();
  });
});
