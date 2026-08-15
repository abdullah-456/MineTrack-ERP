// Letter shown on the cell/badge itself — P/A/L/H/S — so status reads without
// relying on color alone (the month grid cell is too small for a word).
// `hex` (no '#') is the same color as `cell`, used where a plain hex string
// is needed instead of a CSS rgb() — e.g. ExcelJS ARGB cell fills.
//
// Status is now chosen from a dropdown rather than by clicking a cell to cycle
// through the options: with five statuses, cycling would mean up to five
// clicks to reach the one you want, and there is no way to see what the
// options are without trying them.
export const STATUS_META = {
  present:     { labelKey: 'present',    fallback: 'Present',     badge: 'badge-green',  letter: 'P', cell: 'rgb(16,185,129)',  hex: '10B981' },
  absent:      { labelKey: 'absent',     fallback: 'Absent',      badge: 'badge-red',    letter: 'A', cell: 'rgb(239,68,68)',   hex: 'EF4444' },
  leave:       { labelKey: 'leave',      fallback: 'Leave',       badge: 'badge-yellow', letter: 'L', cell: 'rgb(245,158,11)',  hex: 'F59E0B' },
  half_day:    { labelKey: 'halfDay',    fallback: 'Half Day',    badge: 'badge-blue',   letter: 'H', cell: 'rgb(59,130,246)',  hex: '3B82F6' },
  short_leave: { labelKey: 'shortLeave', fallback: 'Short Leave', badge: 'badge-purple', letter: 'S', cell: 'rgb(168,85,247)',  hex: 'A855F7' },
};
export const STATUS_ORDER = ['present', 'absent', 'leave', 'half_day', 'short_leave'];

// Not a real attendance status — a holiday is never written to the Attendance
// table, it's a separate "is this day off" fact from the Holidays module,
// shown purely as an overlay on an otherwise-unmarked cell. Slate rather than
// any of the five status colours above so it reads as "no work expected" at a
// glance, not confused with any of them — and 'half_day' already owns the
// letter 'H', so this gets a distinct dash rather than a colliding letter.
export const HOLIDAY_META = { labelKey: 'holiday', fallback: 'Holiday', letter: '—', cell: 'rgb(100,116,139)', hex: '64748B' };

// Mirrors backend/utils/attendanceStatus.js. Duplicated deliberately (the two
// runtimes can't share a module here) — if either side changes, change both:
// the Give Salary preview reads these to show what the backend is about to
// save, and a mismatch would show the user a figure that isn't what gets paid.

// Fixed divisor for the per-day salary deduction — NOT the real number of days
// in the selected month. Business preference: the same absence costs the same
// fraction of salary regardless of which month it falls in.
export const SALARY_DAYS_PER_MONTH = 26;

// What each status is worth to a DAILY-WAGE employee. Present, half day and
// short leave all count as a full paid day; absent and leave earn nothing.
// Does not affect the salaried absence deduction — half day and short leave
// are informational there.
export const WAGE_DAY_WEIGHTS = {
  present: 1,
  half_day: 1,
  short_leave: 1,
  absent: 0,
  leave: 0,
};

// Every date between from/to inclusive, as full ISO strings — matches the
// full-date keys buildRangeGrid returns (unlike the legacy 2-digit-day month grid).
export function enumerateDates(from, to) {
  const dates = [];
  let d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return dates;
}

// "2026-07" → "2026-July". Used anywhere a salary month is printed on a
// payslip, so the raw YYYY-MM never reaches the reader. Anything that doesn't
// match the pattern is returned unchanged rather than mangled.
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export function formatSalaryMonth(value) {
  if (typeof value !== 'string') return value;
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const name = MONTH_NAMES[parseInt(m[2], 10) - 1];
  return name ? `${m[1]}-${name}` : value;
}
