// Letter shown on the cell/button itself — P/A/L — so status reads without
// relying on color alone. Order doubles as the click-cycle order: 1st click
// on an unmarked cell lands on present, 2nd on absent, 3rd on leave.
// `hex` (no '#') is the same color as `cell`, used where a plain hex string
// is needed instead of a CSS rgb() — e.g. ExcelJS ARGB cell fills.
export const STATUS_META = {
  present: { labelKey: 'present', fallback: 'Present', badge: 'badge-green', letter: 'P', cell: 'rgb(16,185,129)', hex: '10B981' },
  absent:  { labelKey: 'absent',  fallback: 'Absent',  badge: 'badge-red',   letter: 'A', cell: 'rgb(239,68,68)', hex: 'EF4444' },
  leave:   { labelKey: 'leave',   fallback: 'Leave',    badge: 'badge-yellow', letter: 'L', cell: 'rgb(245,158,11)', hex: 'F59E0B' },
};
export const STATUS_ORDER = ['present', 'absent', 'leave'];
export const nextStatus = (current) => {
  const idx = current ? STATUS_ORDER.indexOf(current) : -1;
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
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
