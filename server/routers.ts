import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { pcoRouter } from "./pco/router";
import { reportsRouter } from "./reports/router";
import { weeklyReportRouter } from "./weeklyReport/router";
import { groupsRouter } from "./groups/router";
import { annualReportRouter } from "./annualReport/router";
import { dataViewsRouter } from "./dataViews/router";
import { demographicsRouter } from "./demographics/router";
import { staffAuthRouter } from "./staffAuth/router";
import { auditRouter } from "./audit/router";

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

  // Staff authentication — individual email+password accounts
  staffAuth: staffAuthRouter,

  // Data Audit — raw records, health flags, cross-tab consistency (admin-only)
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
