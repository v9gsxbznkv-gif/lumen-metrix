import { getDb } from './server/db.ts';
import { attendanceMonthly, givingMonthly, servingMonthly, nextStepsMonthly } from './drizzle/schema.ts';
import { eq } from 'drizzle-orm';

const db = await getDb();
if (!db) {
  console.log('Database not available');
  process.exit(1);
}

console.log('\n=== 2026 Attendance Data ===');
const attRows = await db.select().from(attendanceMonthly).where(eq(attendanceMonthly.year, 2026));
console.log('Total rows:', attRows.length);
const months = new Set(attRows.map(r => r.month));
console.log('Months with data:', Array.from(months).sort((a, b) => a - b));
attRows.slice(0, 5).forEach(r => console.log('  Month:', r.month, 'Campus:', r.campus, 'Subgroup:', r.subgroup, 'Total:', r.total));

console.log('\n=== 2026 Giving Data ===');
const givRows = await db.select().from(givingMonthly).where(eq(givingMonthly.year, 2026));
console.log('Total rows:', givRows.length);
const givMonths = new Set(givRows.map(r => r.month));
console.log('Months with data:', Array.from(givMonths).sort((a, b) => a - b));

console.log('\n=== 2026 Serving Data ===');
const srvRows = await db.select().from(servingMonthly).where(eq(servingMonthly.year, 2026));
console.log('Total rows:', srvRows.length);
const srvMonths = new Set(srvRows.map(r => r.month));
console.log('Months with data:', Array.from(srvMonths).sort((a, b) => a - b));

console.log('\n=== 2026 Next Steps Data ===');
const nsRows = await db.select().from(nextStepsMonthly).where(eq(nextStepsMonthly.year, 2026));
console.log('Total rows:', nsRows.length);
const nsMonths = new Set(nsRows.map(r => r.month));
console.log('Months with data:', Array.from(nsMonths).sort((a, b) => a - b));
