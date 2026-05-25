/**
 * PCO Groups Attendance Sync
 * Pulls real attendance data from the PCO Groups API and populates groups_monthly.
 *
 * PCO Groups API structure:
 *   /groups/v2/campuses → Canton Campus (2448), Jasper Campus (12352)
 *   /groups/v2/campuses/{id}/groups → groups belonging to that campus
 *   /groups/v2/groups/{id}/events → group meeting events
 *   /groups/v2/groups/{id}/events/{event_id}/attendances → who attended
 *   /groups/v2/groups/{id}/memberships → members of the group
 *
 * Strategy:
 *   1. Get groups per campus via the campus endpoint
 *   2. For each group, get events in the target month range
 *   3. For each event, count attendances where attended=true
 *   4. Aggregate into groups_monthly: activeGroups, totalMembers, avgAttendance
 */
import { eq, and, sql } from "drizzle-orm";
import { PcoClient } from "./client";
import { groupsMonthly } from "../../drizzle/schema";
import { getDb } from "../db";
import type { SyncResult } from "./sync";

// Campus mapping from PCO Groups API
const CAMPUS_MAP: Record<string, string> = {
  "2448": "Canton",
  "12352": "Jasper",
};

interface GroupAttendanceData {
  groupId: string;
  groupName: string;
  campus: string;
  eventsInMonth: number;
  totalAttended: number;
  memberCount: number;
  leaderCount: number;
}

/**
 * Sync groups attendance data for a specific month range.
 * Pulls from PCO Groups API and writes to groups_monthly.
 */
export async function syncGroupsAttendance(
  client: PcoClient,
  year: number,
  month: number,
  onProgress?: (msg: string) => void
): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  const log = (msg: string) => {
    console.log(`[Groups Sync] ${msg}`);
    onProgress?.(msg);
  };

  try {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Calculate date range for the month
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    log(`Syncing groups for ${year}-${String(month).padStart(2, "0")} (${startDate} to ${endDate})`);

    const results: GroupAttendanceData[] = [];

    // Process each campus
    for (const [campusId, campusName] of Object.entries(CAMPUS_MAP)) {
      log(`Processing campus: ${campusName} (ID: ${campusId})`);

      // Get all groups for this campus
      const groupsResult = await client.paginateAll(
        `/groups/v2/campuses/${campusId}/groups`,
        { per_page: 100 }
      );
      const groups = groupsResult.data as any[];
      log(`  Found ${groups.length} groups for ${campusName}`);

      for (const group of groups) {
        const groupId = String(group.id);
        const groupName = group.attributes?.name || "Unknown";
        recordsProcessed++;

        // Get events for this group in the target month
        let events: any[] = [];
        try {
          const eventsResult = await client.paginateAll(
            `/groups/v2/groups/${groupId}/events`,
            {
              "where[starts_at][gte]": startDate,
              "where[starts_at][lt]": endDate,
              per_page: 100,
            }
          );
          events = (eventsResult.data as any[]).filter(
            (e) => !e.attributes?.canceled
          );
        } catch (err: any) {
          // Some groups may not have events access
          if (err.response?.status !== 404) {
            log(`  Warning: Failed to get events for group ${groupName}: ${err.message}`);
          }
          continue;
        }

        if (events.length === 0) continue;

        // Count attendance for each event
        let totalAttended = 0;
        for (const event of events) {
          try {
            const attResult = await client.paginateAll(
              `/groups/v2/groups/${groupId}/events/${event.id}/attendances`,
              { per_page: 100 }
            );
            const attended = (attResult.data as any[]).filter(
              (a) => a.attributes?.attended === true
            ).length;
            totalAttended += attended;
          } catch (err: any) {
            // Skip events where we can't get attendance
            continue;
          }
        }

        // Get member count and leader count
        let memberCount = 0;
        let leaderCount = 0;
        try {
          const membersResult = await client.paginateAll(
            `/groups/v2/groups/${groupId}/memberships`,
            { per_page: 100 }
          );
          const memberships = membersResult.data as any[];
          memberCount = memberships.length;
          leaderCount = memberships.filter(
            (m) => m.attributes?.role === "leader"
          ).length;
        } catch (err: any) {
          // Fall back to 0
        }

        results.push({
          groupId,
          groupName,
          campus: campusName,
          eventsInMonth: events.length,
          totalAttended,
          memberCount,
          leaderCount,
        });
      }
    }

    // Aggregate by campus
    for (const [campusId, campusName] of Object.entries(CAMPUS_MAP)) {
      // totalGroups = ALL groups under this campus (regardless of events/attendance)
      const allCampusGroups = (await client.paginateAll(
        `/groups/v2/campuses/${campusId}/groups`,
        { per_page: 100 }
      )).data as any[];
      const totalGroups = allCampusGroups.length;

      const campusGroups = results.filter((r) => r.campus === campusName);
      const activeGroups = campusGroups.filter((g) => g.eventsInMonth > 0).length;
      const totalMembers = campusGroups.reduce((sum, g) => sum + g.memberCount, 0);
      const totalLeaders = campusGroups.reduce((sum, g) => sum + g.leaderCount, 0);
      const totalAttendance = campusGroups.reduce((sum, g) => sum + g.totalAttended, 0);
      const totalEvents = campusGroups.reduce((sum, g) => sum + g.eventsInMonth, 0);
      const avgAttendance = totalEvents > 0 ? Math.round(totalAttendance / totalEvents * activeGroups) : 0;
      // avgAttendance = average per-event attendance * number of active groups
      // This gives "total people attending groups on an average week"
      const avgPerEvent = totalEvents > 0 ? Math.round(totalAttendance / totalEvents) : 0;
      // Actually, avgAttendance in the schema means "average weekly total attendance across all groups"
      // = totalAttendance / number of weeks in month
      const weeksInMonth = Math.ceil(totalEvents / Math.max(activeGroups, 1));
      const weeklyAvg = weeksInMonth > 0 ? Math.round(totalAttendance / weeksInMonth) : 0;

      log(`  ${campusName}: ${activeGroups} active groups, ${totalMembers} members, ${totalLeaders} leaders, ${weeklyAvg} avg weekly attendance`);

      // Upsert into groups_monthly
      const existing = await db
        .select()
        .from(groupsMonthly)
        .where(
          and(
            eq(groupsMonthly.year, year),
            eq(groupsMonthly.month, month),
            eq(groupsMonthly.campus, campusName)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(groupsMonthly)
          .set({
            totalGroups,
            activeGroups,
            totalMembers,
            totalLeaders,
            avgAttendance: weeklyAvg,
            source: "pco",
          })
          .where(eq(groupsMonthly.id, existing[0].id));
        recordsUpdated++;
      } else {
        await db.insert(groupsMonthly).values({
          year,
          month,
          campus: campusName,
          totalGroups,
          activeGroups,
          totalMembers,
          totalLeaders,
          avgAttendance: weeklyAvg,
          source: "pco",
        });
        recordsCreated++;
      }
    }

    log(`Groups sync complete: ${recordsProcessed} groups processed, ${recordsCreated} created, ${recordsUpdated} updated`);

    return {
      syncType: "groups_attendance",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (error: any) {
    console.error("[Groups Sync] Failed:", error.message);
    return {
      syncType: "groups_attendance",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      errorMessage: error.message,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Sync groups attendance for the full year to date.
 * Processes each month from January to the current month.
 */
export async function syncGroupsFullYear(
  client: PcoClient,
  year?: number,
  onProgress?: (msg: string) => void
): Promise<SyncResult[]> {
  const targetYear = year || new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-indexed
  const maxMonth = targetYear === new Date().getFullYear() ? currentMonth : 12;

  const results: SyncResult[] = [];
  for (let month = 1; month <= maxMonth; month++) {
    const result = await syncGroupsAttendance(client, targetYear, month, onProgress);
    results.push(result);
    if (result.status === "failed") {
      console.error(`[Groups Sync] Month ${month} failed, stopping: ${result.errorMessage}`);
      break;
    }
  }

  return results;
}
