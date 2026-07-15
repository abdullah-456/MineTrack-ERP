/** Short display for voucher numbers — legacy rows embed the date in the string. */
export function formatVoucherNumber(v = '') {
  const s = String(v || '');
  const legacy = s.match(/^VCH-\d+-(\d{8})-(\d+)$/);
  if (legacy) return `VCH-${legacy[2].padStart(4, '0')}`;
  return s;
}
