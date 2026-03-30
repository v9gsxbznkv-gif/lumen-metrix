/**
 * Reports Router — tRPC procedures for saved reports, scheduling, and delivery
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { savedReports, reportSchedules } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";
import { invokeLLM } from "../_core/llm";

// ─── Zod schemas ────────────────────────────────────────────────────────────

const reportSectionSchema = z.object({
  id: z.string(),
  type: z.enum(["attendance", "giving", "nextsteps", "health", "comparison"]),
  label: z.string(),
  enabled: z.boolean(),
});

const scheduleConfigSchema = z.object({
  frequency: z.enum(["weekly", "monthly", "quarterly"]),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(28).optional(),
  email: z.string().email(),
  enabled: z.boolean(),
});

const reportConfigSchema = z.object({
  reportId: z.string(),
  name: z.string().min(1).max(255),
  campus: z.string(),
  yearStart: z.number(),
  yearEnd: z.number(),
  sections: z.array(reportSectionSchema),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeNextRunAt(
  frequency: string,
  dayOfWeek?: number,
  dayOfMonth?: number
): Date {
  const now = new Date();
  const next = new Date(now);

  if (frequency === "weekly") {
    const targetDay = dayOfWeek ?? 1; // default Monday
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    next.setDate(now.getDate() + daysUntil);
    next.setHours(8, 0, 0, 0); // 8 AM
  } else if (frequency === "monthly") {
    const targetDay = dayOfMonth ?? 1;
    next.setMonth(now.getMonth() + 1);
    next.setDate(Math.min(targetDay, 28));
    next.setHours(8, 0, 0, 0);
  } else if (frequency === "quarterly") {
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const nextQuarterMonth = (currentQuarter + 1) * 3;
    next.setMonth(nextQuarterMonth);
    next.setDate(Math.min(dayOfMonth ?? 1, 28));
    next.setHours(8, 0, 0, 0);
  }

  return next;
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const reportsRouter = router({
  // List all saved reports with their schedules
  list: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const reports = await db.select().from(savedReports).orderBy(savedReports.createdAt);
    const schedules = await db.select().from(reportSchedules);

    return reports.map((r) => ({
      ...r,
      sections: r.sections as Array<{
        id: string;
        type: string;
        label: string;
        enabled: boolean;
      }>,
      schedule: schedules.find((s) => s.reportId === r.reportId) ?? null,
    }));
  }),

  // Save (create or update) a report
  save: publicProcedure.input(reportConfigSchema).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const existing = await db
      .select()
      .from(savedReports)
      .where(eq(savedReports.reportId, input.reportId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(savedReports)
        .set({
          name: input.name,
          campus: input.campus,
          yearStart: input.yearStart,
          yearEnd: input.yearEnd,
          sections: input.sections,
        })
        .where(eq(savedReports.reportId, input.reportId));
    } else {
      await db.insert(savedReports).values({
        reportId: input.reportId,
        name: input.name,
        campus: input.campus,
        yearStart: input.yearStart,
        yearEnd: input.yearEnd,
        sections: input.sections,
      });
    }

    return { success: true };
  }),

  // Delete a report and its schedule
  delete: publicProcedure
    .input(z.object({ reportId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(reportSchedules).where(eq(reportSchedules.reportId, input.reportId));
      await db.delete(savedReports).where(eq(savedReports.reportId, input.reportId));
      return { success: true };
    }),

  // Save or update a schedule for a report
  saveSchedule: publicProcedure
    .input(
      z.object({
        reportId: z.string(),
        schedule: scheduleConfigSchema,
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const nextRunAt = input.schedule.enabled
        ? computeNextRunAt(
            input.schedule.frequency,
            input.schedule.dayOfWeek,
            input.schedule.dayOfMonth
          )
        : null;

      const existing = await db
        .select()
        .from(reportSchedules)
        .where(eq(reportSchedules.reportId, input.reportId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(reportSchedules)
          .set({
            frequency: input.schedule.frequency,
            dayOfWeek: input.schedule.dayOfWeek ?? null,
            dayOfMonth: input.schedule.dayOfMonth ?? null,
            email: input.schedule.email,
            enabled: input.schedule.enabled,
            nextRunAt,
          })
          .where(eq(reportSchedules.reportId, input.reportId));
      } else {
        await db.insert(reportSchedules).values({
          reportId: input.reportId,
          frequency: input.schedule.frequency,
          dayOfWeek: input.schedule.dayOfWeek ?? null,
          dayOfMonth: input.schedule.dayOfMonth ?? null,
          email: input.schedule.email,
          enabled: input.schedule.enabled,
          nextRunAt,
        });
      }

      return { success: true, nextRunAt };
    }),

  // Delete a schedule
  deleteSchedule: publicProcedure
    .input(z.object({ reportId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(reportSchedules).where(eq(reportSchedules.reportId, input.reportId));
      return { success: true };
    }),

  // Send a report via notification (email delivery)
  sendReport: publicProcedure
    .input(
      z.object({
        reportId: z.string(),
        reportName: z.string(),
        email: z.string().email(),
        reportSummary: z.string(), // Pre-rendered text summary from frontend
      })
    )
    .mutation(async ({ input }) => {
      // Use AI to generate an executive summary
      let aiSummary = "";
      try {
        const llmResult = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are a church executive report assistant. Given the following report data summary, write a concise 3-5 paragraph executive summary highlighting key insights, trends, and areas needing attention. Use a professional but warm tone appropriate for church leadership. Do not use markdown formatting.",
            },
            {
              role: "user",
              content: `Report: ${input.reportName}\n\nData:\n${input.reportSummary}`,
            },
          ],
        });
        aiSummary =
          typeof llmResult.choices?.[0]?.message?.content === "string"
            ? llmResult.choices[0].message.content
            : "";
      } catch (err) {
        console.warn("[Reports] AI summary generation failed:", err);
        aiSummary = input.reportSummary;
      }

      // Send via owner notification
      const title = `📊 Report: ${input.reportName}`;
      const content = aiSummary
        ? `Delivery to: ${input.email}\n\n${aiSummary}\n\n---\nRaw Data:\n${input.reportSummary}`
        : `Delivery to: ${input.email}\n\n${input.reportSummary}`;

      const sent = await notifyOwner({ title, content });

      return { success: sent, aiSummary };
    }),
});
