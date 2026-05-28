/**
 * Volunteer Roster Sync
 * Pulls all teams from PCO Services, then fetches unique people assigned to each team.
 * Stores the unique count per campus in the volunteer_roster table.
 *
 * This gives us "Total Active Team Members" — everyone on the bench,
 * regardless of whether they were scheduled this specific week.
 */
import { eq, sql } from "drizzle-orm";
import { PcoClient } from "./client";
import { getDb } from "../db";
import { volunteerRoster } from "../../drizzle/schema";
import type { SyncResult } from "./sync";

/**
 * Map a PCO team name to a campus.
 * Teams in PCO Services are nested under service types which are campus-specific,
 * but team names themselves may also contain campus hints.
 */
function mapTeamToCampus(teamName: string, serviceTypeName: string): string {
  const combined = `${serviceTypeName} ${teamName}`.toLowerCase();
  if (combined.includes("canton")) return "Canton";
  if (combined.includes("jasper")) return "Jasper";
  return "Other";
}

/**
 * Sync the volunteer roster from PCO Services.
 * Fetches all service types → teams → team people (person_team_position_assignments).
 * Counts unique person IDs per campus.
 */
export async function syncVolunteerRoster(
  client: PcoClient
): Promise<SyncResult> {
  const start = Date.now();
  let recordsProcessed = 0;
  let recordsCreated = 0;
  let recordsUpdated = 0;

  try {
    // Step 1: Fetch all service types
    console.log(`[Roster Sync] Fetching service types...`);
    let serviceTypes: any[] = [];
    try {
      const stResult = await Promise.race([
        client.paginateAll("/services/v2/service_types", {}, 10),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout fetching service_types after 30s")), 30_000)
        ),
      ]);
      serviceTypes = stResult.data;
      console.log(`[Roster Sync] Found ${serviceTypes.length} service types`);
    } catch (err: any) {
      if (err.response?.status === 403 || err.response?.status === 401) {
        console.warn(`[Roster Sync] PCO Services not authorized.`);
        return {
          syncType: "volunteer_roster",
          status: "completed",
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          durationMs: Date.now() - start,
          errorMessage: "PCO Services scope not authorized.",
        };
      }
      throw err;
    }

    // Step 2: For each service type, fetch teams, then fetch people for each team
    // Track unique person IDs per campus
    const campusPersonIds = new Map<string, Set<string>>();
    const campusTeamCount = new Map<string, number>();

    for (const st of serviceTypes) {
      const stName = st.attributes?.name || "Unknown";
      const stId = st.id;

      // Fetch teams for this service type
      let teams: any[] = [];
      try {
        const teamsResult = await Promise.race([
          client.paginateAll(`/services/v2/service_types/${stId}/teams`, {}, 10),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout fetching teams for ${stName} after 30s`)), 30_000)
          ),
        ]);
        teams = teamsResult.data;
      } catch (err: any) {
        console.warn(`[Roster Sync] Skipping service type "${stName}": ${err.message}`);
        continue;
      }

      if (teams.length === 0) continue;
      console.log(`[Roster Sync] Service type "${stName}": ${teams.length} teams`);

      for (const team of teams) {
        const teamName = team.attributes?.name || "Unknown";
        const teamId = team.id;
        const campus = mapTeamToCampus(teamName, stName);

        // Skip teams that don't map to a known campus
        if (campus === "Other") continue;

        // Track team count per campus
        campusTeamCount.set(campus, (campusTeamCount.get(campus) || 0) + 1);

        // Fetch people assigned to this team
        // Use /teams/{id}/people which returns person resources
        try {
          const peopleResult = await Promise.race([
            client.paginateAll(
              `/services/v2/teams/${teamId}/people`,
              { per_page: 100 },
              20 // max 20 pages = 2000 people per team
            ),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout fetching people for team ${teamName} after 60s`)), 60_000)
            ),
          ]);

          const people = peopleResult.data;
          if (!campusPersonIds.has(campus)) {
            campusPersonIds.set(campus, new Set());
          }
          const personSet = campusPersonIds.get(campus)!;

          for (const person of people) {
            if (person.id) {
              personSet.add(String(person.id));
            }
          }

          recordsProcessed += people.length;
        } catch (err: any) {
          console.warn(`[Roster Sync] Failed to fetch people for team "${teamName}" (${campus}): ${err.message}`);
          continue;
        }
      }
    }

    // Step 3: Write results to volunteer_roster table
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    for (const [campus, personIds] of Array.from(campusPersonIds)) {
      const uniqueCount = personIds.size;
      const teamCount = campusTeamCount.get(campus) || 0;

      console.log(`[Roster Sync] ${campus}: ${uniqueCount} unique volunteers across ${teamCount} teams`);

      // Upsert: update if campus exists, insert if not
      const existing = await db
        .select()
        .from(volunteerRoster)
        .where(eq(volunteerRoster.campus, campus))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(volunteerRoster)
          .set({
            uniqueVolunteers: uniqueCount,
            totalTeams: teamCount,
            syncedAt: new Date(),
          })
          .where(eq(volunteerRoster.campus, campus));
        recordsUpdated++;
      } else {
        await db.insert(volunteerRoster).values({
          campus,
          uniqueVolunteers: uniqueCount,
          totalTeams: teamCount,
        });
        recordsCreated++;
      }
    }

    const totalUnique = Array.from(campusPersonIds.values()).reduce((s, set) => s + set.size, 0);
    console.log(`[Roster Sync] Done: ${totalUnique} total unique volunteers across all campuses`);

    return {
      syncType: "volunteer_roster",
      status: "completed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    console.error(`[Roster Sync] Error:`, err.message);
    return {
      syncType: "volunteer_roster",
      status: "failed",
      recordsProcessed,
      recordsCreated,
      recordsUpdated,
      durationMs: Date.now() - start,
      errorMessage: err.message,
    };
  }
}
