import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { pcoRouter } from "./pco/router";
import { reportsRouter } from "./reports/router";
import { weeklyReportRouter } from "./weeklyReport/router";
import { groupsRouter } from "./groups/router";
import { annualReportRouter } from "./annualReport/router";
import { dataViewsRouter } from "./dataViews/router";
import { demographicsRouter } from "./demographics/router";
import { z } from "zod";

// Cookie name for the simple dashboard password session
const DASH_COOKIE = "lumen_dash_auth";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Simple password gate — no username, just a shared password
  dashboardAuth: router({
    // Check if the visitor already has a valid password session
    check: publicProcedure.query(({ ctx }) => {
      const cookieHeader = ctx.req.headers.cookie;
      const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {};
      const token = cookies[DASH_COOKIE];
      const isAuthenticated = token === "authenticated";
      return { isAuthenticated };
    }),

    // Verify password and set a session cookie
    login: publicProcedure
      .input(z.object({ password: z.string() }))
      .mutation(({ ctx, input }) => {
        if (input.password !== ENV.dashboardPassword) {
          throw new Error("Incorrect password");
        }
        const cookieOptions = getSessionCookieOptions(ctx.req);
        // 30-day session
        ctx.res.cookie(DASH_COOKIE, "authenticated", {
          ...cookieOptions,
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });
        return { success: true } as const;
      }),

    // Clear the password session cookie
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(DASH_COOKIE, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Planning Center Online integration
  pco: pcoRouter,

  // Reports — saved reports, scheduling, and delivery
  reports: reportsRouter,

  // Weekly Report — weekly snapshot with comparisons and auto-generation
  weeklyReport: weeklyReportRouter,

  // Groups — active groups, members, leaders, attendance, participation rate
  groups: groupsRouter,

  // Annual Report — comprehensive annual data aggregation with YoY comparison
  annualReport: annualReportRouter,

  // Data Views — unified weekly/monthly/yearly aggregation from weekly tables
  dataViews: dataViewsRouter,

  // Demographics — member address sync, geocoding, and map data
  demographics: demographicsRouter,
});

export type AppRouter = typeof appRouter;
