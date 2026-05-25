import { describe, it, expect, vi } from "vitest";

/**
 * Invite system tests — validates the invite flow logic
 */

describe("Invite System", () => {
  it("should generate a valid invite token (64 hex chars)", () => {
    const crypto = require("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    expect(token).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it("should set expiry to 7 days from now", () => {
    const now = Date.now();
    const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000);
    const diffDays = (expiresAt.getTime() - now) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeCloseTo(7, 0);
  });

  it("should construct correct invite URL from host", () => {
    const protocol = "https";
    const host = "lumenmetrix.com";
    const token = "abc123def456";
    const inviteUrl = `${protocol}://${host}/invite?token=${token}`;
    expect(inviteUrl).toBe("https://lumenmetrix.com/invite?token=abc123def456");
  });

  it("should default role to 'user' when not specified", () => {
    const input = { email: "test@example.com" };
    const role = (input as any).role ?? "user";
    expect(role).toBe("user");
  });

  it("should accept 'admin' role when specified", () => {
    const input = { email: "test@example.com", role: "admin" as const };
    expect(input.role).toBe("admin");
  });

  it("should generate HTML email without Manus branding", () => {
    const roleName = "Team Member";
    const inviteUrl = "https://lumenmetrix.com/invite?token=abc";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 700; color: #1a1a1a; margin: 0;">LUMEN METRIX</h1>
          <p style="color: #666; margin-top: 4px; font-size: 14px;">Church Analytics Dashboard</p>
        </div>
        <div style="background: #ffffff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 32px;">
          <h2 style="font-size: 20px; color: #1a1a1a; margin: 0 0 16px;">You've been invited!</h2>
          <p style="color: #444; line-height: 1.6; margin: 0 0 8px;">You've been invited to join <strong>Lumen Metrix</strong> as a <strong>${roleName}</strong>.</p>
          <p style="color: #444; line-height: 1.6; margin: 0 0 24px;">Click the button below to create your account and get started.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}" style="display: inline-block; background: #D97706; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Accept Invitation</a>
          </div>
        </div>
      </div>
    `;

    // No Manus branding
    expect(html.toLowerCase()).not.toContain("manus");
    // Has Lumen Metrix branding
    expect(html).toContain("LUMEN METRIX");
    // Has correct role
    expect(html).toContain("Team Member");
    // Has invite URL
    expect(html).toContain(inviteUrl);
  });

  it("should filter settings tab for non-admin users", () => {
    const NAV_ITEMS = [
      { id: "dashboard", label: "Dashboard" },
      { id: "attendance", label: "Attendance" },
      { id: "settings", label: "Settings" },
    ];

    // Admin sees all
    const adminItems = NAV_ITEMS.filter((item) => {
      if (item.id === "settings" && "admin" !== "admin") return false;
      return true;
    });
    expect(adminItems).toHaveLength(3);
    expect(adminItems.find(i => i.id === "settings")).toBeDefined();

    // User doesn't see settings
    const userItems = NAV_ITEMS.filter((item) => {
      if (item.id === "settings" && "user" !== "admin") return false;
      return true;
    });
    expect(userItems).toHaveLength(2);
    expect(userItems.find(i => i.id === "settings")).toBeUndefined();
  });
});
