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
  double,
  uniqueIndex,
  date,
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
  weeklySyncDay: int("weeklySyncDay").default(2).notNull(), // 0=Sunday, 1=Monday, ..., 2=Tuesday, ..., 6=Saturday
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
}, (table) => ([
  uniqueIndex("att_monthly_ymcs").on(table.year, table.month, table.campus, table.subgroup),
]));

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
}, (table) => ([
  uniqueIndex("giv_monthly_ymcs").on(table.year, table.month, table.campus, table.subgroup),
]));

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
}, (t) => ([
  uniqueIndex("next_steps_monthly_unique_idx").on(t.year, t.month, t.campus, t.metric),
]));

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
// Groups — annual aggregates by year/campus
// ============================================================
export const groupsAnnual = mysqlTable("groups_annual", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  activeGroups: int("activeGroups").default(0).notNull(),
  totalMembers: int("totalMembers").default(0).notNull(),
  totalLeaders: int("totalLeaders").default(0).notNull(),
  avgAttendance: int("avgAttendance").default(0).notNull(), // avg weekly group attendance
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
});

export type GroupsAnnualRow = typeof groupsAnnual.$inferSelect;
export type InsertGroupsAnnual = typeof groupsAnnual.$inferInsert;

// ============================================================
// Groups Monthly — monthly breakdowns
// ============================================================
export const groupsMonthly = mysqlTable("groups_monthly", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  totalGroups: int("totalGroups").default(0).notNull(),
  activeGroups: int("activeGroups").default(0).notNull(),
  totalMembers: int("totalMembers").default(0).notNull(),
  totalLeaders: int("totalLeaders").default(0).notNull(),
  avgAttendance: int("avgAttendance").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
});

export type GroupsMonthlyRow = typeof groupsMonthly.$inferSelect;
export type InsertGroupsMonthly = typeof groupsMonthly.$inferInsert;

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
  // Address fields (synced from PCO People /addresses sub-resource)
  street: varchar("street", { length: 255 }),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  zip: varchar("zip", { length: 20 }),
  // Geocoded coordinates (from Google Maps Geocoding API)
  latitude: double("latitude"),
  longitude: double("longitude"),
  geocodedAt: timestamp("geocodedAt"),
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

// ============================================================
// Weekly Report Config — auto-generation schedule
// ============================================================
export const weeklyReportConfig = mysqlTable("weekly_report_config", {
  id: int("id").autoincrement().primaryKey(),
  dayOfWeek: int("dayOfWeek").notNull().default(1), // 0=Sun, 1=Mon, ..., 6=Sat
  hour: int("hour").notNull().default(8), // 0-23 in Eastern Time
  minute: int("minute").notNull().default(0), // 0-59
  enabled: boolean("enabled").default(false).notNull(),
  deliveryEmail: varchar("deliveryEmail", { length: 255 }),
  lastGeneratedAt: timestamp("lastGeneratedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WeeklyReportConfig = typeof weeklyReportConfig.$inferSelect;
export type InsertWeeklyReportConfig = typeof weeklyReportConfig.$inferInsert;

// ============================================================
// Attendance Weekly — per-Sunday headcounts from PCO check-ins
// ============================================================
export const attendanceWeekly = mysqlTable("attendance_weekly", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  weekNumber: int("weekNumber").notNull(),        // ISO week number (1-53)
  weekStartDate: varchar("weekStartDate", { length: 10 }).notNull(), // 'YYYY-MM-DD' of the Sunday
  campus: varchar("campus", { length: 64 }).notNull(),
  subgroup: varchar("subgroup", { length: 128 }).notNull(), // PCO event name (e.g. 'Revolution Canton Check-In')
  headcount: int("headcount").default(0).notNull(),
  regularCount: int("regularCount").default(0).notNull(),
  guestCount: int("guestCount").default(0).notNull(),
  volunteerCount: int("volunteerCount").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("pco").notNull(),
  manualLock: boolean("manualLock").default(false).notNull(), // true = skip during auto-sync
  cancelled: boolean("cancelled").default(false).notNull(), // true = week was cancelled (excluded from averages/growth)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // Prevent duplicate rows per week/campus/subgroup — enforces upsert semantics
  uniqWeekCampusSubgroup: uniqueIndex("idx_aw_unique").on(t.year, t.weekNumber, t.campus, t.subgroup),
}));

export type AttendanceWeeklyRow = typeof attendanceWeekly.$inferSelect;
export type InsertAttendanceWeekly = typeof attendanceWeekly.$inferInsert;

// ============================================================
// Giving Weekly — per-week donation totals from PCO giving
// ============================================================
export const givingWeekly = mysqlTable("giving_weekly", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  weekNumber: int("weekNumber").notNull(),        // ISO week number (1-53)
  weekStartDate: varchar("weekStartDate", { length: 10 }).notNull(), // 'YYYY-MM-DD' of the Sunday
  campus: varchar("campus", { length: 64 }).notNull(),
  total: decimal("total", { precision: 12, scale: 2 }).default("0").notNull(),
  general: decimal("general", { precision: 12, scale: 2 }).default("0").notNull(),
  designated: decimal("designated", { precision: 12, scale: 2 }).default("0").notNull(),
  donationCount: int("donationCount").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("pco").notNull(),
  manualLock: boolean("manualLock").default(false).notNull(), // true = skip during auto-sync
  cancelled: boolean("cancelled").default(false).notNull(), // true = week was cancelled (excluded from averages/growth)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("giving_weekly_year_week_campus_idx").on(table.year, table.weekNumber, table.campus),
]));

export type GivingWeeklyRow = typeof givingWeekly.$inferSelect;
export type InsertGivingWeekly = typeof givingWeekly.$inferInsert;
// ============================================================
// Sync Jobs — persistent background job tracking (survives Cloud Run restarts)
// ============================================================
export const syncJobs = mysqlTable("sync_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 128 }).notNull().unique(),
  syncType: varchar("syncType", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).default("running").notNull(), // running | completed | failed
  progress: int("progress").default(0).notNull(),          // 0-100
  message: varchar("message", { length: 512 }).default("").notNull(),
  recordsProcessed: int("recordsProcessed").default(0).notNull(),
  results: text("results"),                                 // JSON array of SyncResult
  rawData: text("rawData"),                                  // JSON blob: PCO fetch results pending DB write
  error: varchar("error", { length: 1024 }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});
export type SyncJobRow = typeof syncJobs.$inferSelect;
export type InsertSyncJob = typeof syncJobs.$inferInsert;

// ============================================================
// Event Overrides — user-entered exact numbers for specific events
// Takes priority over PCO weekly data and monthly estimates.
// eventName must match the canonical event keys used in EventsPage:
//   'Easter', 'Mother\'s Day', 'Back to School', 'Christmas Season'
// ============================================================
export const eventOverrides = mysqlTable("event_overrides", {
  id: int("id").autoincrement().primaryKey(),
  eventName: varchar("eventName", { length: 128 }).notNull(),  // e.g. 'Easter'
  year: int("year").notNull(),
  attendance: int("attendance"),         // null = not overridden
  giving: decimal("giving", { precision: 12, scale: 2 }),
  ftg: int("ftg"),                       // first-time guests
  salvations: int("salvations"),
  baptisms: int("baptisms"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EventOverrideRow = typeof eventOverrides.$inferSelect;
export type InsertEventOverride = typeof eventOverrides.$inferInsert;

// ============================================================
// Serving Weekly — per-Sunday volunteer/team member counts
// ============================================================
export const servingWeekly = mysqlTable("serving_weekly", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  weekNumber: int("weekNumber").notNull(),
  weekStartDate: varchar("weekStartDate", { length: 10 }).notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  total: int("total").default(0).notNull(),
  scheduled: int("scheduled").default(0).notNull(),
  confirmed: int("confirmed").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ([
  uniqueIndex("serving_weekly_year_week_campus_idx").on(t.year, t.weekNumber, t.campus),
]));

export type ServingWeeklyRow = typeof servingWeekly.$inferSelect;
export type InsertServingWeekly = typeof servingWeekly.$inferInsert;

// ============================================================
// Next Steps Weekly — per-Sunday FTG, salvations, baptisms, stewardship
// ============================================================
export const nextStepsWeekly = mysqlTable("next_steps_weekly", {
  id: int("id").autoincrement().primaryKey(),
  year: int("year").notNull(),
  weekNumber: int("weekNumber").notNull(),
  weekStartDate: varchar("weekStartDate", { length: 10 }).notNull(),
  campus: varchar("campus", { length: 64 }).notNull(),
  metric: varchar("metric", { length: 64 }).notNull(), // 'FTG', 'Salvations', 'Baptisms', 'Stewardship'
  count: int("count").default(0).notNull(),
  source: varchar("source", { length: 32 }).default("spreadsheet").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ([
  uniqueIndex("next_steps_weekly_unique_idx").on(t.year, t.weekNumber, t.campus, t.metric),
]));

export type NextStepsWeeklyRow = typeof nextStepsWeekly.$inferSelect;
export type InsertNextStepsWeekly = typeof nextStepsWeekly.$inferInsert;


// ============================================================
// Dashboard Users — individual staff accounts with email+password
// ============================================================
export const dashboardUsers = mysqlTable("dashboard_users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "staff", "member"]).default("staff").notNull(),
  status: mysqlEnum("status", ["active", "disabled"]).default("active").notNull(),
  invitedBy: int("invitedBy"),
  lastLoginAt: timestamp("lastLoginAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DashboardUser = typeof dashboardUsers.$inferSelect;
export type InsertDashboardUser = typeof dashboardUsers.$inferInsert;

// ============================================================
// Dashboard Invites — pending invitations sent by admin
// ============================================================
export const dashboardInvites = mysqlTable("dashboard_invites", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["admin", "staff", "member"]).default("staff").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  invitedBy: int("invitedBy").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "revoked"]).default("pending").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DashboardInvite = typeof dashboardInvites.$inferSelect;
export type InsertDashboardInvite = typeof dashboardInvites.$inferInsert;

// ============================================================
// Volunteer Roster — unique active team members from PCO Services
// Updated during nightly sync by pulling all teams and counting distinct people
// ============================================================
export const volunteerRoster = mysqlTable("volunteer_roster", {
  id: int("id").autoincrement().primaryKey(),
  campus: varchar("campus", { length: 64 }).notNull(),
  uniqueVolunteers: int("uniqueVolunteers").default(0).notNull(),
  totalTeams: int("totalTeams").default(0).notNull(),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
}, (t) => ([
  uniqueIndex("volunteer_roster_campus_idx").on(t.campus),
]));

export type VolunteerRosterRow = typeof volunteerRoster.$inferSelect;
export type InsertVolunteerRoster = typeof volunteerRoster.$inferInsert;

// ============================================================
// Calendar: Campuses
// ============================================================
export const calendarCampuses = mysqlTable("calendar_campuses", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).default("#6B7280").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CalendarCampus = typeof calendarCampuses.$inferSelect;

// ============================================================
// Calendar: Ministries
// ============================================================
export const calendarMinistries = mysqlTable("calendar_ministries", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).default("#6B7280").notNull(),
  icon: varchar("icon", { length: 50 }).default("calendar").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CalendarMinistry = typeof calendarMinistries.$inferSelect;

// ============================================================
// Calendar: Staff Members
// ============================================================
export const calendarStaffMembers = mysqlTable("calendar_staff_members", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  email: varchar("email", { length: 320 }),
  campusId: int("campusId").references(() => calendarCampuses.id),
  role: varchar("role", { length: 100 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CalendarStaffMember = typeof calendarStaffMembers.$inferSelect;

// ============================================================
// Calendar: Events
// ============================================================
export const calendarEvents = mysqlTable("calendar_events", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  campusId: int("campusId").references(() => calendarCampuses.id).notNull(),
  ministryId: int("ministryId").references(() => calendarMinistries.id).notNull(),
  location: varchar("location", { length: 255 }),
  capacity: int("capacity"),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  isAllDay: boolean("isAllDay").default(false).notNull(),
  status: mysqlEnum("status", ["draft", "pending_approval", "approved", "rejected", "locked"]).default("draft").notNull(),
  approvedAt: timestamp("approvedAt"),
  rejectionReason: text("rejectionReason"),
  recurrenceGroupId: int("recurrenceGroupId"),
  color: varchar("color", { length: 7 }),
  attendeeNotes: text("attendeeNotes"),
  googleEventId: varchar("googleEventId", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = typeof calendarEvents.$inferInsert;

// ============================================================
// Calendar: Conflicts
// ============================================================
export const calendarConflicts = mysqlTable("calendar_conflicts", {
  id: int("id").autoincrement().primaryKey(),
  eventAId: int("eventAId").references(() => calendarEvents.id).notNull(),
  eventBId: int("eventBId").references(() => calendarEvents.id),
  conflictType: mysqlEnum("conflictType", ["same_ministry_same_date", "ministry_overload", "staff_coverage", "room_overlap", "school_holiday"]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).notNull(),
  resolved: boolean("resolved").default(false).notNull(),
  resolvedBy: int("resolvedBy").references(() => calendarStaffMembers.id),
  resolvedAt: timestamp("resolvedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CalendarConflict = typeof calendarConflicts.$inferSelect;

// ============================================================
// Calendar: Approval History
// ============================================================
export const calendarApprovalHistory = mysqlTable("calendar_approval_history", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").references(() => calendarEvents.id).notNull(),
  action: mysqlEnum("action", ["submitted", "approved", "rejected", "changes_requested", "comment", "moved", "locked", "unlocked"]).notNull(),
  actorId: int("actorId").references(() => calendarStaffMembers.id),
  actorName: varchar("actorName", { length: 150 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CalendarApprovalHistoryRow = typeof calendarApprovalHistory.$inferSelect;

// ============================================================
// Calendar: Blackout Dates
// ============================================================
export const calendarBlackoutDates = mysqlTable("calendar_blackout_dates", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  campusId: int("campusId").references(() => calendarCampuses.id),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
  createdBy: varchar("createdBy", { length: 150 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CalendarBlackoutDate = typeof calendarBlackoutDates.$inferSelect;
export type InsertCalendarBlackoutDate = typeof calendarBlackoutDates.$inferInsert;

// ============================================================
// Google Calendar Sync Log
// ============================================================
export const googleCalendarSyncLog = mysqlTable("google_calendar_sync_log", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  googleEventId: varchar("googleEventId", { length: 256 }),
  calendarId: varchar("calendarId", { length: 256 }),
  action: mysqlEnum("action", ["created", "updated", "deleted", "failed"]).notNull(),
  errorMessage: text("errorMessage"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
});
export type GoogleCalendarSyncLog = typeof googleCalendarSyncLog.$inferSelect;
export type InsertGoogleCalendarSyncLog = typeof googleCalendarSyncLog.$inferInsert;

// ============================================================
// Calendar: Staff Time Off
// ============================================================
export const calendarStaffTimeOff = mysqlTable("calendar_staff_time_off", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staffId")
    .references(() => calendarStaffMembers.id)
    .notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "denied"]).default("pending").notNull(),
  approvedBy: int("approvedBy").references(() => calendarStaffMembers.id),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CalendarStaffTimeOff = typeof calendarStaffTimeOff.$inferSelect;
export type InsertCalendarStaffTimeOff = typeof calendarStaffTimeOff.$inferInsert;

// ============================================================
// Calendar: Coverage Rules
// ============================================================
export const calendarCoverageRules = mysqlTable("calendar_coverage_rules", {
  id: int("id").autoincrement().primaryKey(),
  campusId: int("campusId")
    .references(() => calendarCampuses.id)
    .notNull(),
  ministryId: int("ministryId").references(() => calendarMinistries.id),
  dayOfWeek: int("dayOfWeek"),
  startTime: varchar("startTime", { length: 10 }),
  endTime: varchar("endTime", { length: 10 }),
  minStaff: int("minStaff").default(1).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CalendarCoverageRule = typeof calendarCoverageRules.$inferSelect;
export type InsertCalendarCoverageRule = typeof calendarCoverageRules.$inferInsert;
