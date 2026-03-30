import { getDb } from './server/db.ts';
import { attendanceMonthly } from './drizzle/schema.ts';
import { and, eq } from 'drizzle-orm';

const db = await getDb();

// Check if April 2026 ESL Class row exists
const rows = await db.select().from(attendanceMonthly).where(and(
  eq(attendanceMonthly.year, 2026),
  eq(attendanceMonthly.month, 4)
));

console.log('April 2026 rows before delete:', rows.length);
rows.forEach(r => console.log('  ', r));

// Delete any April 2026 rows
if (rows.length > 0) {
  const result = await db.delete(attendanceMonthly).where(and(
    eq(attendanceMonthly.year, 2026),
    eq(attendanceMonthly.month, 4)
  ));
  console.log('Deleted April 2026 rows');
}

// Verify deletion
const afterDelete = await db.select().from(attendanceMonthly).where(and(
  eq(attendanceMonthly.year, 2026),
  eq(attendanceMonthly.month, 4)
));
console.log('April 2026 rows after delete:', afterDelete.length);

// Now test the Weekly Report getData
const { appRouter } = await import('./server/routers.ts');

function createPublicContext() {
  return {
    user: null,
    req: {
      protocol: 'https',
      headers: {},
    },
    res: {
      clearCookie: () => {},
    },
  };
}

const caller = appRouter.createCaller(createPublicContext());
const result = await caller.weeklyReport.getData({
  year: 2026,
  comparisons: ['previousWeek'],
});

console.log('\nWeekly Report 2026 result:');
console.log('  latestMonth:', result.meta.latestMonth);
console.log('  current exists:', result.current !== null);
if (result.current) {
  console.log('  current.campuses:', result.current.campuses.length);
  console.log('  current.totals.attendance:', result.current.totals.attendance);
}
