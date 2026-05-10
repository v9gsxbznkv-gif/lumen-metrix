/**
 * Test script: Hit PCO API directly for a few people and see raw address responses.
 * Run with: node test-pco-addresses.mjs
 */
import 'dotenv/config';

// Get a valid access token from the database
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("No DATABASE_URL found");
  process.exit(1);
}

import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  // Get the current access token
  const [tokens] = await conn.execute(
    "SELECT `accessToken` FROM pco_tokens ORDER BY id DESC LIMIT 1"
  );
  
  if (!tokens.length) {
    console.error("No PCO token found");
    process.exit(1);
  }
  
  const accessToken = tokens[0].accessToken;
  console.log("Got access token:", accessToken.substring(0, 20) + "...");
  
  // Get a few people IDs to test
  const [people] = await conn.execute(
    "SELECT pcoId, firstName, lastName, street, city, zip FROM pco_people WHERE status = 'active' AND street = 'NULL' LIMIT 5"
  );
  
  console.log("\n=== Testing PCO Address API for 5 people ===\n");
  
  for (const person of people) {
    console.log(`\n--- ${person.firstName} ${person.lastName} (PCO ID: ${person.pcoId}) ---`);
    console.log(`  DB: street="${person.street}", city="${person.city}", zip="${person.zip}"`);
    
    // Hit PCO API directly
    const url = `https://api.planningcenteronline.com/people/v2/people/${person.pcoId}/addresses`;
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });
    
    if (!resp.ok) {
      console.log(`  API Error: ${resp.status} ${resp.statusText}`);
      continue;
    }
    
    const json = await resp.json();
    console.log(`  API Response (${json.data?.length || 0} addresses):`);
    
    if (json.data && json.data.length > 0) {
      for (const addr of json.data) {
        console.log(`    Address ID: ${addr.id}`);
        console.log(`    Attributes:`, JSON.stringify(addr.attributes, null, 4));
      }
    } else {
      console.log("    No addresses returned from PCO");
    }
    
    // Also try fetching the person directly with ?include=addresses
    const personUrl = `https://api.planningcenteronline.com/people/v2/people/${person.pcoId}?include=addresses`;
    const personResp = await fetch(personUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    });
    
    if (personResp.ok) {
      const personJson = await personResp.json();
      const included = personJson.included || [];
      console.log(`  Person include=addresses (${included.length} included):`);
      for (const inc of included) {
        console.log(`    Included:`, JSON.stringify(inc.attributes, null, 4));
      }
    }
    
    // Small delay
    await new Promise(r => setTimeout(r, 200));
  }
  
  await conn.end();
}

main().catch(console.error);
