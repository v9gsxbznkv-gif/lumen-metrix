import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ────────────────────────────────────────────────────────────────

type CookieRecord = Record<string, string>;

function createContext(cookies: CookieRecord = {}): {
  ctx: TrpcContext;
  setCookies: Record<string, { value: string; options: Record<string, unknown> }>;
  clearedCookies: string[];
} {
  const setCookies: Record<string, { value: string; options: Record<string, unknown> }> = {};
  const clearedCookies: string[] = [];

  // Build a cookie header string from the cookies record (matches how production code parses)
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ") || undefined;

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: { cookie: cookieHeader },
      cookies,
    } as unknown as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies[name] = { value, options };
      },
      clearCookie: (name: string) => {
        clearedCookies.push(name);
      },
    } as unknown as TrpcContext["res"],
  };

  return { ctx, setCookies, clearedCookies };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("dashboardAuth.check", () => {
  it("returns isAuthenticated: false when no cookie is present", async () => {
    const { ctx } = createContext({});
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboardAuth.check();
    expect(result.isAuthenticated).toBe(false);
  });

  it("returns isAuthenticated: true when cookie is set to 'authenticated'", async () => {
    const { ctx } = createContext({ lumen_dash_auth: "authenticated" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboardAuth.check();
    expect(result.isAuthenticated).toBe(true);
  });

  it("returns isAuthenticated: false when cookie has wrong value", async () => {
    const { ctx } = createContext({ lumen_dash_auth: "wrong-token" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboardAuth.check();
    expect(result.isAuthenticated).toBe(false);
  });
});

describe("dashboardAuth.login", () => {
  it("sets session cookie on correct password", async () => {
    const { ctx, setCookies } = createContext({});
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboardAuth.login({ password: "Test123" });

    expect(result.success).toBe(true);
    expect(setCookies["lumen_dash_auth"]).toBeDefined();
    expect(setCookies["lumen_dash_auth"].value).toBe("authenticated");
    // Cookie should have a 30-day maxAge
    expect(setCookies["lumen_dash_auth"].options.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("throws on incorrect password", async () => {
    const { ctx } = createContext({});
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dashboardAuth.login({ password: "wrongpassword" })
    ).rejects.toThrow("Incorrect password");
  });

  it("throws on empty password", async () => {
    const { ctx } = createContext({});
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dashboardAuth.login({ password: "" })
    ).rejects.toThrow("Incorrect password");
  });

  it("is case-sensitive", async () => {
    const { ctx } = createContext({});
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.dashboardAuth.login({ password: "test123" })
    ).rejects.toThrow("Incorrect password");
  });
});

describe("dashboardAuth.logout", () => {
  it("clears the session cookie", async () => {
    const { ctx, clearedCookies } = createContext({ lumen_dash_auth: "authenticated" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.dashboardAuth.logout();

    expect(result.success).toBe(true);
    expect(clearedCookies).toContain("lumen_dash_auth");
  });
});
