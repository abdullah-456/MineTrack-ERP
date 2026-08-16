// Shared "make raw data presentable" helpers for reports and lists.
//
// Only strings that LOOK like a raw DB token (lowercase letters/digits,
// underscores, spaces — nothing else) are touched. Anything with an
// uppercase letter or other punctuation (names, item codes like
// "WSI-1-0001", emails) already has real casing and is returned untouched —
// that's what makes it safe to apply broadly without mangling legitimate
// free text.
const RAW_TOKEN = /^[a-z0-9_ ]+$/;

export function humanize(value) {
  if (typeof value !== 'string' || !value) return value;
  if (!RAW_TOKEN.test(value)) return value;
  return value
    .replace(/[_\s]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// The standard pattern for a status/type/enum column going forward:
// a real translation when one exists, otherwise a clean Title Case label
// instead of a raw leak.
export function statusLabel(t, prefix, value) {
  if (!value) return '—';
  return t(`${prefix}_${value}`) || humanize(value);
}
