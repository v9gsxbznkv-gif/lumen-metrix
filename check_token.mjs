import { config } from "dotenv";
config();
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SELECT accessToken, refreshToken, expiresAt FROM pco_tokens ORDER BY id DESC LIMIT 1");
if (rows.length) {
  console.log("Token expires at:", rows[0].expiresAt);
  console.log("Now:", new Date());
  console.log("Expired:", new Date(rows[0].expiresAt) < new Date());
  console.log("Has refresh token:", rows[0].refreshToken ? "yes" : "no");
  console.log("Refresh token length:", rows[0].refreshToken?.length);
}
await conn.end();
