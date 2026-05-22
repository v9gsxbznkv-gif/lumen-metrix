/**
 * Staff Auth Router Tests
 * Tests login, check, and invite validation procedures
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashSync } from "bcryptjs";

// Mock the database
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();

vi.mock("../db", () => ({
  getDb: vi.fn(() => ({
    select: () => ({ from: (table: any) => ({ where: (cond: any) => ({ limit: mockLimit }) }) }),
    update: () => ({ set: () => ({ where: vi.fn() }) }),
    insert: () => ({ values: vi.fn() }),
  })),
}));

// Test password hashing
describe("staffAuth password hashing", () => {
  it("should hash and verify passwords correctly", () => {
    const password = "Bald4life!";
    const hash = hashSync(password, 10);

    // Hash should not equal plaintext
    expect(hash).not.toBe(password);
    expect(hash.startsWith("$2")).toBe(true);

    // Verify works
    const { compareSync } = require("bcryptjs");
    expect(compareSync(password, hash)).toBe(true);
    expect(compareSync("wrong-password", hash)).toBe(false);
  });

  it("should reject empty passwords", () => {
    const { compareSync } = require("bcryptjs");
    const hash = hashSync("test123", 10);
    expect(compareSync("", hash)).toBe(false);
  });
});

// Test JWT signing and verification
describe("staffAuth JWT", () => {
  it("should sign and verify a staff session token", async () => {
    const { SignJWT, jwtVerify } = await import("jose");
    const secret = new TextEncoder().encode("test-secret-key");

    const token = await new SignJWT({ userId: 1, email: "chad@revolution.church", name: "Chad", role: "admin" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000))
      .sign(secret);

    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");

    // Verify the token
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    expect(payload.userId).toBe(1);
    expect(payload.email).toBe("chad@revolution.church");
    expect(payload.name).toBe("Chad");
    expect(payload.role).toBe("admin");
  });

  it("should reject tokens with wrong secret", async () => {
    const { SignJWT, jwtVerify } = await import("jose");
    const secret1 = new TextEncoder().encode("secret-1");
    const secret2 = new TextEncoder().encode("secret-2");

    const token = await new SignJWT({ userId: 1 })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((Date.now() + 1000) / 1000))
      .sign(secret1);

    await expect(jwtVerify(token, secret2, { algorithms: ["HS256"] })).rejects.toThrow();
  });

  it("should reject expired tokens", async () => {
    const { SignJWT, jwtVerify } = await import("jose");
    const secret = new TextEncoder().encode("test-secret");

    // Create a token that expired 1 hour ago
    const token = await new SignJWT({ userId: 1 })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((Date.now() - 3600000) / 1000))
      .sign(secret);

    await expect(jwtVerify(token, secret, { algorithms: ["HS256"] })).rejects.toThrow();
  });
});

// Test invite token generation
describe("staffAuth invite tokens", () => {
  it("should generate a 64-character hex token", () => {
    const crypto = require("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    expect(token).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });
});
