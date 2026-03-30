import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  decimal,
  boolean,
  json,
  bigint,
} from "drizzle-orm/mysql-core";

// ============================================================
// Core user table (from template)
// ============================================================
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// PCO Settings — stores API credentials per church
// ============================================================
export const pcoSettings = mysqlTable("pco_settings", {
  id: int("id").autoincrement().primaryKey(),
  appId: varchar("appId", { length: 255 }).notNull(),
  secret: varchar("secret", { length: 255 }).notNull(),
  churchName: varchar("churchName", { length: 255 }),
  isActive: boolean("isActive").default(true).notNull(),
  lastValidated: timestamp("lastValidated"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PcoSettings = typeof pcoSettings.$inferSelect;
export type InsertPcoSettings = typeof pcoSettings.$inferInsert;

// ============================================================
// Sync Logs — tracks each sync operation
// ============================================================
export const syncLogs = mysqlTable("sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  syncType: varchar("syncType", { length: 64 }).notNull(), // 'attendance', 'giving', 'groups', 'events', 'people', 'full'
  status: varchar("status", { length: 32 }).notNull(), // 'running', 'completed', 'failed'
  recordsProcessed: int("recordsProcessed").default(0),
  recordsCreated: int("recordsCreated").default(0),
  recordsUpdated: int("recordsUpdated").default(0),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  durationMs: int("durationMs"),
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;

// ============================================================
// Attendance — annual aggregates by year/campus/subgroup
// ============================================================
export const attendance = mysqlTable("attendance", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  subgroup: varchar("subgroup", { length: 64 }).notNull(), // 'Adults', 'Kids', 'Students', 'Young Adults', 'Total'
  avgWeekly: int("avgWeekly").default(0).notNull(),
  total: int("total").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(), // 'spreadsheet' or 'pco'
});

export type AttendanceRow = typeof attendance.$inferSelect;
export type InsertAttendance = typeof attendance.$inferInsert;

// ============================================================
// Attendance Monthly — monthly breakdowns
// ============================================================
export const attendanceMonthly = mysqlTable("attendance_monthly", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  subgroup: varchar("subgroup", { length: 64 }).notNull(),
  total: int("total").default(0).notNull(),
  avgWeekly: int("avgWeekly").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
});

export type AttendanceMonthlyRow = typeof attendanceMonthly.$inferSelect;
export type InsertAttendanceMonthly = typeof attendanceMonthly.$inferInsert;

// ============================================================
// Giving — annual aggregates by year/campus
// ============================================================
export const giving = mysqlTable("giving", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  general: decimal("general", { precision: 12, scale: 2 }).default("0").notNull(),
  designated: decimal("designated", { precision: 12, scale: 2 }).default("0").notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).default("0").notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
});

export type GivingRow = typeof giving.$inferSelect;
export type InsertGiving = typeof giving.$inferInsert;

// ============================================================
// Giving Monthly — monthly breakdowns
// ============================================================
export const givingMonthly = mysqlTable("giving_monthly", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  subgroup: varchar("subgroup", { length: 64 }).notNull(), // 'Tithes and Offerings', 'Designated', etc.
  total: decimal("total", { precision: 12, scale: 2 }).default("0").notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
});

export type GivingMonthlyRow = typeof givingMonthly.$inferSelect;
export type InsertGivingMonthly = typeof givingMonthly.$inferInsert;

// ============================================================
// Next Steps — annual aggregates (FTG, Salvations, Baptisms, Stewardship)
// ============================================================
export const nextSteps = mysqlTable("next_steps", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  metric: varchar("metric", { length: 64 }).notNull(), // 'FTG', 'Salvations', 'Baptisms', 'Stewardship'
  total: int("total").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
});

export type NextStepsRow = typeof nextSteps.$inferSelect;
export type InsertNextSteps = typeof nextSteps.$inferInsert;

// ============================================================
// Next Steps Monthly
// ============================================================
export const nextStepsMonthly = mysqlTable("next_steps_monthly", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  metric: varchar("metric", { length: 64 }).notNull(),
  count: int("count").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
});

export type NextStepsMonthlyRow = typeof nextStepsMonthly.$inferSelect;
export type InsertNextStepsMonthly = typeof nextStepsMonthly.$inferInsert;

// ============================================================
// Serving — annual aggregates
// ============================================================
export const serving = mysqlTable("serving", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  total: int("total").default(0).notNull(),
  avgWeekly: int("avgWeekly").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
});

export type ServingRow = typeof serving.$inferSelect;
export type InsertServing = typeof serving.$inferInsert;

// ============================================================
// Serving Monthly
// ============================================================
export const servingMonthly = mysqlTable("serving_monthly", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  total: int("total").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
});

export type ServingMonthlyRow = typeof servingMonthly.$inferSelect;
export type InsertServingMonthly = typeof servingMonthly.$inferInsert;

// ============================================================
// PCO Groups — synced from Planning Center Groups API
// ============================================================
export const pcoGroups = mysqlTable("pco_groups", {
  id: int("id").autoincrement().primaryKey(),
  pcoId: varchar("pcoId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  groupType: varchar("groupType", { length: 128 }),
  membersCount: int("membersCount").default(0),
  schedule: varchar("schedule", { length: 255 }),
  campus: varchar("campus", { length: 64 }),
  isArchived: boolean("isArchived").default(false).notNull(),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PcoGroup = typeof pcoGroups.$inferSelect;
export type InsertPcoGroup = typeof pcoGroups.$inferInsert;

// ============================================================
// PCO Events — synced from Planning Center Calendar API
// ============================================================
export const pcoEvents = mysqlTable("pco_events", {
  id: int("id").autoincrement().primaryKey(),
  pcoId: varchar("pcoId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  location: varchar("location", { length: 255 }),
  campus: varchar("campus", { length: 64 }),
  eventType: varchar("eventType", { length: 128 }),
  registrationCount: int("registrationCount").default(0),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PcoEvent = typeof pcoEvents.$inferSelect;
export type InsertPcoEvent = typeof pcoEvents.$inferInsert;

// ============================================================
// PCO People — synced from Planning Center People API
// ============================================================
export const pcoPeople = mysqlTable("pco_people", {
  id: int("id").autoincrement().primaryKey(),
  pcoId: varchar("pcoId", { length: 64 }).notNull().unique(),
  firstName: varchar("firstName", { length: 128 }),
  lastName: varchar("lastName", { length: 128 }),
  email: varchar("email", { length: 320 }),
  campus: varchar("campus", { length: 64 }),
  membershipType: varchar("membershipType", { length: 64 }), // 'member', 'regular_attender', 'visitor', etc.
  status: varchar("status", { length: 64 }),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PcoPerson = typeof pcoPeople.$inferSelect;
export type InsertPcoPerson = typeof pcoPeople.$inferInsert;

// ============================================================
// PCO OAuth Tokens — stores access + refresh tokens
// ============================================================
export const pcoTokens = mysqlTable("pco_tokens", {
  id: int("id").autoincrement().primaryKey(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken").notNull(),
  tokenType: varchar("tokenType", { length: 64 }).default("Bearer").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  scope: text("scope"),
  organizationName: varchar("organizationName", { length: 255 }),
  organizationId: varchar("organizationId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PcoToken = typeof pcoTokens.$inferSelect;
export type InsertPcoToken = typeof pcoTokens.$inferInsert;

// ============================================================
// Saved Reports — persisted report configurations
// ============================================================
export const savedReports = mysqlTable("saved_reports", {
  id: int("id").autoincrement().primaryKey(),
  reportId: varchar("reportId", { length: 64 }).notNull().unique(), // client-generated ID
  name: varchar("name", { length: 255 }).notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  yearStart: int("yearStart").notNull(),
  yearEnd: int("yearEnd").notNull(),
  sections: json("sections").notNull(), // JSON array of ReportSection
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SavedReport = typeof savedReports.$inferSelect;
export type InsertSavedReport = typeof savedReports.$inferInsert;

// ============================================================
// Report Schedules — recurring delivery configuration
// ============================================================
export const reportSchedules = mysqlTable("report_schedules", {
  id: int("id").autoincrement().primaryKey(),
  reportId: varchar("reportId", { length: 64 }).notNull().unique(), // FK to saved_reports.reportId
  frequency: varchar("frequency", { length: 32 }).notNull(), // 'weekly', 'monthly', 'quarterly'
  dayOfWeek: int("dayOfWeek"), // 0-6 for weekly
  dayOfMonth: int("dayOfMonth"), // 1-28 for monthly/quarterly
  email: varchar("email", { length: 320 }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  lastSentAt: timestamp("lastSentAt"),
  nextRunAt: timestamp("nextRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ReportSchedule = typeof reportSchedules.$inferSelect;
export type InsertReportSchedule = typeof reportSchedules.$inferInsert;
