import { getDb } from './server/db.ts';
import { attendanceMonthly, givingMonthly, servingMonthly, nextStepsMonthly } from './drizzle/schema.ts';
import { and, eq } from 'drizzle-orm';

const db = await getDb();

console.log('\n=== April 2026 Attendance Data ===');
const attRows = await db.select().from(attendanceMonthly).where(and(eq(attendanceMonthly.year, 2026), eq(attendanceMonthly.month, 4)));
console.log('Total rows:', attRows.length);
attRows.forEach(r => console.log('  Campus:', r.campus, 'Subgroup:', r.subgroup, 'Total:', r.total));

console.log('\n=== April 2026 Giving Data ===');
const givRows = await db.select().from(givingMonthly).where(and(eq(givingMonthly.year, 2026), eq(givingMonthly.month, 4)));
console.log('Total rows:', givRows.length);

console.log('\n=== April 2026 Serving Data ===');
const srvRows = await db.select().from(servingMonthly).where(and(eq(servingMonthly.year, 2026), eq(servingMonthly.month, 4)));
console.log('Total rows:', srvRows.length);

console.log('\n=== April 2026 Next Steps Data ===');
const nsRows = await db.select().from(nextStepsMonthly).where(and(eq(nextStepsMonthly.year, 2026), eq(nextStepsMonthly.month, 4)));
console.log('Total rows:', nsRows.length);
