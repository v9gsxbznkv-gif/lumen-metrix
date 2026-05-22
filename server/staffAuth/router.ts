/**
 * Staff Authentication Router
 * Handles email+password login, invite flow, and user management
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../_core/env";
import { SignJWT, jwtVerify } from "jose";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import { dashboardUsers, dashboardInvites } from "../../drizzle/schema";
import { hashSync, compareSync } from "bcryptjs";
import crypto from "crypto";

// Cookie name for staff sessions
const STAFF_COOKIE = "lumen_staff_session";

// JWT secret for staff sessions (reuse the existing JWT_SECRET)
function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret || "dev-secret-change-me");
}

// Sign a JWT for a staff user
async function signStaffSession(userId: number, email: string, name: string, role: string) {
  return new SignJWT({ userId, email, name, role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000))
    .sign(getSecret());
}

// Verify a staff JWT
async function verifyStaffSession(token: string | undefined | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const { userId, email, name, role } = payload as Record<string, unknown>;
    if (!userId || !email) return null;
    return { userId: userId as number, email: email as string, name: name as string, role: role as string };
  } catch {
    return null;
  }
}

// Helper to get current staff user from request cookies
async function getStaffUser(cookieHeader: string | undefined) {
  if (!cookieHeader) return null;
  const { parse } = await import("cookie");
  const cookies = parse(cookieHeader);
  const token = cookies[STAFF_COOKIE];
  return verifyStaffSession(token);
}

export const staffAuthRouter = router({
  // Check if the visitor has a valid staff session
  check: publicProcedure.query(async ({ ctx }) => {
    const session = await getStaffUser(ctx.req.headers.cookie);
    if (!session) return { isAuthenticated: false, user: null };

    // Verify user still exists and is active
    const db = await getDb();
    if (!db) return { isAuthenticated: false, user: null };

    const [user] = await db.select().from(dashboardUsers)
      .where(eq(dashboardUsers.id, session.userId)).limit(1);

    if (!user || user.status !== "active") {
      return { isAuthenticated: false, user: null };
    }

    return {
      isAuthenticated: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }),

  // Login with email + password
  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [user] = await db.select().from(dashboardUsers)
        .where(eq(dashboardUsers.email, input.email.toLowerCase().trim())).limit(1);

      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      if (user.status === "disabled") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your account has been disabled. Contact an administrator." });
      }

      const valid = compareSync(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      // Update last login
      await db.update(dashboardUsers)
        .set({ lastLoginAt: new Date() })
        .where(eq(dashboardUsers.id, user.id));

      // Sign JWT and set cookie
      const token = await signStaffSession(user.id, user.email, user.name, user.role);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(STAFF_COOKIE, token, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      return { success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
    }),

  // Logout — clear staff session cookie
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(STAFF_COOKIE, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),

  // Validate an invite token (for the registration page)
  validateInvite: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [invite] = await db.select().from(dashboardInvites)
        .where(eq(dashboardInvites.token, input.token)).limit(1);

      if (!invite) {
        return { valid: false, email: null, error: "Invalid invite link" };
      }
      if (invite.usedAt) {
        return { valid: false, email: null, error: "This invite has already been used" };
      }
      if (new Date() > invite.expiresAt) {
        return { valid: false, email: null, error: "This invite has expired" };
      }

      return { valid: true, email: invite.email, error: null };
    }),

  // Register — accept invite and create account
  register: publicProcedure
    .input(z.object({
      token: z.string(),
      name: z.string().min(1, "Name is required"),
      password: z.string().min(6, "Password must be at least 6 characters"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Validate invite
      const [invite] = await db.select().from(dashboardInvites)
        .where(eq(dashboardInvites.token, input.token)).limit(1);

      if (!invite || invite.usedAt || new Date() > invite.expiresAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired invite" });
      }

      // Check if email already registered
      const [existing] = await db.select().from(dashboardUsers)
        .where(eq(dashboardUsers.email, invite.email.toLowerCase().trim())).limit(1);

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists" });
      }

      // Create user
      const passwordHash = hashSync(input.password, 10);
      const [result] = await db.insert(dashboardUsers).values({
        email: invite.email.toLowerCase().trim(),
        name: input.name.trim(),
        passwordHash,
        role: "user",
        status: "active",
        invitedBy: invite.invitedBy,
        lastLoginAt: new Date(),
      }).$returningId();

      // Mark invite as used
      await db.update(dashboardInvites)
        .set({ usedAt: new Date() })
        .where(eq(dashboardInvites.id, invite.id));

      // Auto-login after registration
      const token = await signStaffSession(result.id, invite.email, input.name, "user");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(STAFF_COOKIE, token, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return { success: true, user: { id: result.id, email: invite.email, name: input.name, role: "user" } };
    }),

  // ===== Admin-only procedures =====

  // List all users (admin only)
  listUsers: publicProcedure.query(async ({ ctx }) => {
    const session = await getStaffUser(ctx.req.headers.cookie);
    if (!session || session.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const allUsers = await db.select({
      id: dashboardUsers.id,
      email: dashboardUsers.email,
      name: dashboardUsers.name,
      role: dashboardUsers.role,
      status: dashboardUsers.status,
      lastLoginAt: dashboardUsers.lastLoginAt,
      createdAt: dashboardUsers.createdAt,
    }).from(dashboardUsers).orderBy(desc(dashboardUsers.createdAt));

    return allUsers;
  }),

  // Invite a new user (admin only)
  invite: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getStaffUser(ctx.req.headers.cookie);
      if (!session || session.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const email = input.email.toLowerCase().trim();

      // Check if already registered
      const [existing] = await db.select().from(dashboardUsers)
        .where(eq(dashboardUsers.email, email)).limit(1);

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists" });
      }

      // Generate invite token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(dashboardInvites).values({
        email,
        token,
        invitedBy: session.userId,
        expiresAt,
      });

      // Build invite URL using the request origin
      const protocol = ctx.req.headers["x-forwarded-proto"] || ctx.req.protocol || "https";
      const host = ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host || "lumenmetrix.com";
      const inviteUrl = `${protocol}://${host}/invite?token=${token}`;

      return { success: true, inviteUrl, email, expiresIn: "7 days" };
    }),

  // Disable/enable a user (admin only)
  toggleUserStatus: publicProcedure
    .input(z.object({ userId: z.number(), status: z.enum(["active", "disabled"]) }))
    .mutation(async ({ ctx, input }) => {
      const session = await getStaffUser(ctx.req.headers.cookie);
      if (!session || session.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      // Can't disable yourself
      if (input.userId === session.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot disable your own account" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(dashboardUsers)
        .set({ status: input.status })
        .where(eq(dashboardUsers.id, input.userId));

      return { success: true };
    }),

  // Toggle user role between admin/user (admin only)
  toggleRole: publicProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ ctx, input }) => {
      const session = await getStaffUser(ctx.req.headers.cookie);
      if (!session || session.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      if (input.userId === session.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(dashboardUsers)
        .set({ role: input.role })
        .where(eq(dashboardUsers.id, input.userId));

      return { success: true };
    }),

  // Delete a user (admin only)
  deleteUser: publicProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getStaffUser(ctx.req.headers.cookie);
      if (!session || session.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      if (input.userId === session.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.delete(dashboardUsers).where(eq(dashboardUsers.id, input.userId));

      return { success: true };
    }),

  // List pending invites (admin only)
  listInvites: publicProcedure.query(async ({ ctx }) => {
    const session = await getStaffUser(ctx.req.headers.cookie);
    if (!session || session.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const invites = await db.select().from(dashboardInvites)
      .orderBy(desc(dashboardInvites.createdAt));

    return invites.map(inv => ({
      id: inv.id,
      email: inv.email,
      used: !!inv.usedAt,
      expired: new Date() > inv.expiresAt,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
    }));
  }),
});
