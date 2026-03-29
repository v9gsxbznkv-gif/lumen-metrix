/*
 * Lumen Metrix — Church Calendar
 * Key event dates for comparison across years
 * Includes Easter, Christmas, Mother's Day, and other significant Sundays
 */

export interface ChurchEvent {
  id: string;
  name: string;
  category: "holiday" | "seasonal" | "church";
  /** Returns the date for a given year, or null if not applicable */
  getDate: (year: number) => Date | null;
  /** How many weeks around the event to include in comparison */
  windowWeeks: number;
  description: string;
}

// Easter calculation (Anonymous Gregorian algorithm)
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Mother's Day: second Sunday of May
function getMothersDay(year: number): Date {
  const may1 = new Date(year, 4, 1);
  const dayOfWeek = may1.getDay();
  const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return new Date(year, 4, firstSunday + 7);
}

// Father's Day: third Sunday of June
function getFathersDay(year: number): Date {
  const june1 = new Date(year, 5, 1);
  const dayOfWeek = june1.getDay();
  const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return new Date(year, 5, firstSunday + 14);
}

// Thanksgiving: fourth Thursday of November
function getThanksgiving(year: number): Date {
  const nov1 = new Date(year, 10, 1);
  const dayOfWeek = nov1.getDay();
  const firstThursday = dayOfWeek <= 4 ? 5 - dayOfWeek : 12 - dayOfWeek;
  return new Date(year, 10, firstThursday + 21);
}

export const CHURCH_EVENTS: ChurchEvent[] = [
  {
    id: "easter",
    name: "Easter Sunday",
    category: "holiday",
    getDate: (y) => getEasterDate(y),
    windowWeeks: 1,
    description: "Resurrection Sunday — typically highest attendance of the year",
  },
  {
    id: "good_friday",
    name: "Good Friday",
    category: "holiday",
    getDate: (y) => {
      const easter = getEasterDate(y);
      return new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
    },
    windowWeeks: 0,
    description: "Friday before Easter",
  },
  {
    id: "palm_sunday",
    name: "Palm Sunday",
    category: "holiday",
    getDate: (y) => {
      const easter = getEasterDate(y);
      return new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 7);
    },
    windowWeeks: 1,
    description: "Sunday before Easter — start of Holy Week",
  },
  {
    id: "christmas_eve",
    name: "Christmas Eve",
    category: "holiday",
    getDate: (y) => new Date(y, 11, 24),
    windowWeeks: 1,
    description: "Christmas Eve services — typically second-highest attendance",
  },
  {
    id: "christmas",
    name: "Christmas Sunday",
    category: "holiday",
    getDate: (y) => {
      const dec25 = new Date(y, 11, 25);
      const day = dec25.getDay();
      if (day === 0) return dec25;
      // Nearest Sunday
      return day <= 3
        ? new Date(y, 11, 25 - day)
        : new Date(y, 11, 25 + (7 - day));
    },
    windowWeeks: 1,
    description: "Sunday closest to Christmas Day",
  },
  {
    id: "mothers_day",
    name: "Mother's Day",
    category: "holiday",
    getDate: (y) => getMothersDay(y),
    windowWeeks: 1,
    description: "Second Sunday of May — high attendance Sunday",
  },
  {
    id: "fathers_day",
    name: "Father's Day",
    category: "holiday",
    getDate: (y) => getFathersDay(y),
    windowWeeks: 1,
    description: "Third Sunday of June",
  },
  {
    id: "new_year",
    name: "New Year's Sunday",
    category: "seasonal",
    getDate: (y) => {
      const jan1 = new Date(y, 0, 1);
      const day = jan1.getDay();
      if (day === 0) return jan1;
      return new Date(y, 0, 1 + (7 - day));
    },
    windowWeeks: 1,
    description: "First Sunday of the year",
  },
  {
    id: "back_to_school",
    name: "Back to School",
    category: "seasonal",
    getDate: (y) => {
      // First Sunday of August
      const aug1 = new Date(y, 7, 1);
      const day = aug1.getDay();
      return new Date(y, 7, day === 0 ? 1 : 8 - day);
    },
    windowWeeks: 2,
    description: "First Sunday of August — fall kickoff season",
  },
  {
    id: "thanksgiving_sunday",
    name: "Thanksgiving Sunday",
    category: "seasonal",
    getDate: (y) => {
      const tg = getThanksgiving(y);
      // Sunday before Thanksgiving
      return new Date(tg.getFullYear(), tg.getMonth(), tg.getDate() - (tg.getDay() === 0 ? 0 : tg.getDay()));
    },
    windowWeeks: 1,
    description: "Sunday before Thanksgiving — gratitude emphasis",
  },
  {
    id: "super_bowl",
    name: "Super Bowl Sunday",
    category: "seasonal",
    getDate: (y) => {
      // Approximate: first Sunday of February
      const feb1 = new Date(y, 1, 1);
      const day = feb1.getDay();
      return new Date(y, 1, day === 0 ? 1 : 8 - day);
    },
    windowWeeks: 1,
    description: "First Sunday of February — often lower attendance",
  },
];

/** Get the ISO week number for a given date */
export function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Get the month (1-12) for a date */
export function getMonth(date: Date): number {
  return date.getMonth() + 1;
}

/** Format a date as "Mar 31, 2024" */
export function formatEventDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Get week numbers surrounding an event (for matching weekly data) */
export function getEventWeekRange(date: Date, windowWeeks: number): { startWeek: number; endWeek: number } {
  const centerWeek = getISOWeek(date);
  return {
    startWeek: Math.max(1, centerWeek - windowWeeks),
    endWeek: Math.min(52, centerWeek + windowWeeks),
  };
}
