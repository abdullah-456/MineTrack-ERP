// Formats the [{unit, total}] shape returned by the backend's productionTotals
// helper (grouped by unit, since a mine/pit/bench/mineral can in principle
// have entries logged under more than one unit) into a short display string.
export function formatProductionTotal(totals) {
  if (!Array.isArray(totals) || totals.length === 0) return null;
  return totals.map(t => `${Number(t.total).toLocaleString()} ${t.unit}`).join(' + ');
}
