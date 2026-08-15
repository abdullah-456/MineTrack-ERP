// Single source of truth for what an attendance status is and what it's worth
// in payroll. Every consumer — the attendance write path, the monthly summary,
// the payroll run — reads these instead of repeating a literal list, so adding
// a status can never leave one of them silently out of date.
//
// The frontend mirrors this in frontend/src/utils/attendanceStatus.js (labels
// and colours live there; the weights and divisor below are duplicated there
// only so the Give Salary preview matches what the backend will actually save).

const ATTENDANCE_STATUSES = ['present', 'absent', 'leave', 'half_day', 'short_leave'];

// Fixed divisor for the per-day salary deduction, rather than the real number
// of days in the calendar month (28–31) or the working days left after
// holidays. Business preference, confirmed with the user: the same absence
// should cost the same fraction of salary regardless of which month it falls
// in. Used by employeeLedgerController.runGiveSalary and mirrored by the
// Give Salary preview on the frontend.
const SALARY_DAYS_PER_MONTH = 26;

// How much of a paid day each status earns a DAILY-WAGE employee.
// Confirmed with the user: present, half day and short leave all count as a
// full day for now; absent and approved leave earn nothing. A status missing
// from this map is worth 0, so a future status is unpaid until someone decides
// otherwise rather than silently paying out.
//
// This deliberately does NOT feed the salaried absence deduction — half day and
// short leave are informational there (also confirmed), so a salaried employee's
// deduction still counts only absent (and optionally leave) days.
const WAGE_DAY_WEIGHTS = {
  present: 1,
  half_day: 1,
  short_leave: 1,
  absent: 0,
  leave: 0,
};

// Sum of WAGE_DAY_WEIGHTS over a { status: count } map, rounded to 2dp so a
// half-weight status can never introduce a floating-point tail into money.
function countPaidDays(counts) {
  const total = Object.entries(counts || {})
    .reduce((sum, [status, n]) => sum + (WAGE_DAY_WEIGHTS[status] || 0) * (n || 0), 0);
  return Math.round(total * 100) / 100;
}

module.exports = { ATTENDANCE_STATUSES, SALARY_DAYS_PER_MONTH, WAGE_DAY_WEIGHTS, countPaidDays };
