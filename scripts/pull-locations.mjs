/**
 * Pull PCO location hierarchy for Canton check-in event
 * to determine room-to-category mappings
 */
import { createAuthenticatedPcoClient } from "../server/pco/client.ts";

async function main() {
  const client = await createAuthenticatedPcoClient();
  if (!client) {
    console.error("No PCO token available");
    process.exit(1);
  }

  // Canton check-in event ID = 15287 (from weeklySync.ts)
  // Let's get all locations for the check-in events
  const events = await client.paginateAll("/check-ins/v2/events");
  
  console.log("=== ALL CHECK-IN EVENTS ===");
  for (const event of events.data) {
    const attrs = event.attributes || {};
    console.log(`Event: ${attrs.name} (ID: ${event.id})`);
  }

  // Get locations for each main event
  const mainEvents = events.data.filter(e => {
    const name = e.attributes?.name || "";
    return name.includes("Revolution Canton") || name.includes("Revolution Jasper");
  });

  for (const event of mainEvents) {
    const eventName = event.attributes?.name;
    console.log(`\n=== LOCATIONS FOR: ${eventName} (ID: ${event.id}) ===`);
    
    try {
      const locations = await client.paginateAll(
        `/check-ins/v2/events/${event.id}/locations`,
        { per_page: 100, include: "parent" }
      );

      // Build parent map
      const parentNames = new Map();
      if (locations.included) {
        for (const inc of locations.included) {
          if (inc.type === "Location" && inc.attributes?.name) {
            parentNames.set(inc.id, inc.attributes.name);
          }
        }
      }

      for (const loc of locations.data) {
        const attrs = loc.attributes || {};
        const parentId = loc.relationships?.parent?.data?.id;
        const parentName = parentId ? parentNames.get(parentId) : "(top-level)";
        console.log(`  ${parentName || "(unknown parent)"} > ${attrs.name} (ID: ${loc.id}, position: ${attrs.position})`);
      }
    } catch (err) {
      console.error(`  Error fetching locations: ${err.message}`);
    }
  }
}

main().catch(console.error);
