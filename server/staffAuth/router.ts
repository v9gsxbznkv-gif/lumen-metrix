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
import { Resend } from "resend";

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
        return { valid: false, email: null, role: null, error: "Invalid invite link" };
      }
      if (invite.status === "revoked") {
        return { valid: false, email: null, role: null, error: "This invite has been revoked" };
      }
      if (invite.status === "accepted" || invite.usedAt) {
        return { valid: false, email: null, role: null, error: "This invite has already been used" };
      }
      if (new Date() > invite.expiresAt) {
        return { valid: false, email: null, role: null, error: "This invite has expired" };
      }

      return { valid: true, email: invite.email, role: invite.role, error: null };
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

      // Create user with the role specified in the invite
      const passwordHash = hashSync(input.password, 10);
      const assignedRole = (invite.role as "admin" | "staff" | "member") || "staff";
      const [result] = await db.insert(dashboardUsers).values({
        email: invite.email.toLowerCase().trim(),
        name: input.name.trim(),
        passwordHash,
        role: assignedRole,
        status: "active",
        invitedBy: invite.invitedBy,
        lastLoginAt: new Date(),
      }).$returningId();

      // Mark invite as used
      await db.update(dashboardInvites)
        .set({ usedAt: new Date(), status: "accepted" })
        .where(eq(dashboardInvites.id, invite.id));

      // Auto-login after registration
      const token = await signStaffSession(result.id, invite.email, input.name, assignedRole);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(STAFF_COOKIE, token, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      return { success: true, user: { id: result.id, email: invite.email, name: input.name, role: assignedRole } };
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
    .input(z.object({
      email: z.string().email(),
      role: z.enum(["admin", "staff", "member"]).default("staff"),
    }))
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
        role: input.role,
        token,
        invitedBy: session.userId,
        status: "pending",
        expiresAt,
      });

      // Build invite URL using the request origin
      const protocol = ctx.req.headers["x-forwarded-proto"] || ctx.req.protocol || "https";
      const host = ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host || "lumenmetrix.com";
      const inviteUrl = `${protocol}://${host}/invite?token=${token}`;

      // Send invite email via Resend
      const roleName = input.role === "admin" ? "Administrator" : input.role === "staff" ? "Staff" : "Team Member";
      try {
        const resend = new Resend(ENV.resendApiKey);
        await resend.emails.send({
          from: "Lumen Metrix <noreply@lumenmetrix.com>",
          to: email,
          subject: `You're invited to Lumen Metrix`,
          html: `
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
                <p style="color: #888; font-size: 13px; margin: 0;">This invite expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.</p>
              </div>
              <p style="text-align: center; color: #aaa; font-size: 12px; margin-top: 24px;">&copy; ${new Date().getFullYear()} Lumen Metrix. All rights reserved.</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error("[Invite] Failed to send email via Resend:", emailErr);
        // Don't fail the invite creation — URL is still valid
      }

      return { success: true, inviteUrl, email, role: input.role, expiresIn: "7 days" };
    }),

  // Revoke a pending invite (admin only)
  revokeInvite: publicProcedure
    .input(z.object({ inviteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await getStaffUser(ctx.req.headers.cookie);
      if (!session || session.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(dashboardInvites)
        .set({ status: "revoked" })
        .where(eq(dashboardInvites.id, input.inviteId));

      return { success: true };
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

  // Toggle user role (admin only)
  toggleRole: publicProcedure
    .input(z.object({ userId: z.number(), role: z.enum(["admin", "staff", "member"]) }))
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
      role: inv.role,
      status: inv.status,
      used: !!inv.usedAt,
      expired: new Date() > inv.expiresAt && inv.status === "pending",
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
    }));
  }),
});
