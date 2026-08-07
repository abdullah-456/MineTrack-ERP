// Shared 5-way status → label/badge mapping for Mines, used by both the Mines
// admin page and the SuperAdmin shop-detail view so the mapping lives in one
// place. Deliberately NOT the shared StatusBadge component — that component's
// 'closed' maps to a green "Completed" badge for installment plans, which
// would be exactly backwards for a permanently shut-down mine.
export const MINE_STATUSES = [
  { value: 'active', labelKey: 'mineStatusActive', badge: 'badge-green' },
  { value: 'under_development', labelKey: 'mineStatusUnderDevelopment', badge: 'badge-blue' },
  { value: 'suspended', labelKey: 'mineStatusSuspended', badge: 'badge-yellow' },
  { value: 'closed', labelKey: 'mineStatusClosed', badge: 'badge-red' },
  { value: 'lease_expired', labelKey: 'mineStatusLeaseExpired', badge: 'badge-red' },
];

export function getMineStatusMeta(t, status) {
  const entry = MINE_STATUSES.find(s => s.value === status) || MINE_STATUSES[0];
  return { badge: entry.badge, label: t(entry.labelKey) || entry.value };
}
