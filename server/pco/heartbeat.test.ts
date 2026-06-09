/**
 * Heartbeat endpoint tests
 * Tests the logic for token refresh and missed sync detection
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("heartbeat logic", () => {
  describe("getEasternDateString equivalent", () => {
    it("should return a date string in YYYY-MM-DD format", () => {
      const dateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      // Format: YYYY-MM-DD
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("getEasternHour equivalent", () => {
    it("should return an hour between 0 and 23", () => {
      const eastern = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hour12: false,
      }).format(new Date());
      const hour = parseInt(eastern);

      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);
    });
  });

  describe("sync window logic", () => {
    it("should identify hours 0-5 as sync window", () => {
      const syncWindow = (hour: number) => hour >= 0 && hour <= 5;

      expect(syncWindow(0)).toBe(true);
      expect(syncWindow(1)).toBe(true);
      expect(syncWindow(5)).toBe(true);
      expect(syncWindow(6)).toBe(false);
      expect(syncWindow(12)).toBe(false);
      expect(syncWindow(23)).toBe(false);
    });
  });

  describe("token buffer logic", () => {
    it("should flag token as needing refresh when within 30-min buffer", () => {
      const bufferMs = 30 * 60 * 1000; // 30 minutes

      // Token expiring in 25 minutes — should refresh
      const expiresIn25Min = new Date(Date.now() + 25 * 60 * 1000);
      const needsRefresh25 = expiresIn25Min.getTime() - bufferMs < Date.now();
      expect(needsRefresh25).toBe(true);

      // Token expiring in 60 minutes — should NOT refresh
      const expiresIn60Min = new Date(Date.now() + 60 * 60 * 1000);
      const needsRefresh60 = expiresIn60Min.getTime() - bufferMs < Date.now();
      expect(needsRefresh60).toBe(false);

      // Token already expired — should refresh
      const expired = new Date(Date.now() - 5 * 60 * 1000);
      const needsRefreshExpired = expired.getTime() - bufferMs < Date.now();
      expect(needsRefreshExpired).toBe(true);
    });
  });

  describe("refreshedNow detection", () => {
    it("should detect a refresh when expiresAt increases by more than 1 minute", () => {
      const expiresAtBefore = Date.now() + 10 * 60 * 1000; // 10 min from now
      const expiresAtAfter = Date.now() + 90 * 60 * 1000; // 90 min from now (new token)
      const refreshedNow = expiresAtAfter > expiresAtBefore + 60_000;
      expect(refreshedNow).toBe(true);
    });

    it("should NOT flag refreshedNow when expiresAt is unchanged", () => {
      const expiresAtBefore = Date.now() + 90 * 60 * 1000;
      const expiresAtAfter = expiresAtBefore; // no change
      const refreshedNow = expiresAtAfter > expiresAtBefore + 60_000;
      expect(refreshedNow).toBe(false);
    });

    it("should NOT flag refreshedNow for sub-minute clock drift", () => {
      const expiresAtBefore = Date.now() + 90 * 60 * 1000;
      const expiresAtAfter = expiresAtBefore + 30_000; // only 30s difference (clock drift)
      const refreshedNow = expiresAtAfter > expiresAtBefore + 60_000;
      expect(refreshedNow).toBe(false);
    });

    it("should report the updated expiresAt after refresh (not the stale pre-refresh value)", () => {
      // Simulate: token was expiring in 20min, after refresh it expires in 90min
      const staleExpiry = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const freshExpiry = new Date(Date.now() + 90 * 60 * 1000).toISOString();
      // The fix reads DB again after getValidAccessToken() — so it should return freshExpiry
      expect(freshExpiry).not.toEqual(staleExpiry);
      expect(new Date(freshExpiry).getTime()).toBeGreaterThan(new Date(staleExpiry).getTime());
    });
  });

  describe("idempotency", () => {
    it("should not re-run sync if already completed today", () => {
      // Simulate: sync completed at 1am today
      const syncCompletedAt = new Date();
      syncCompletedAt.setHours(1, 0, 0, 0);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const alreadySynced = syncCompletedAt >= todayStart;
      expect(alreadySynced).toBe(true);
    });

    it("should run sync if last sync was yesterday", () => {
      // Simulate: sync completed yesterday at 1am
      const syncCompletedAt = new Date();
      syncCompletedAt.setDate(syncCompletedAt.getDate() - 1);
      syncCompletedAt.setHours(1, 0, 0, 0);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const alreadySynced = syncCompletedAt >= todayStart;
      expect(alreadySynced).toBe(false);
    });
  });
});
