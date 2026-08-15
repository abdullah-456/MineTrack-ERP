const db = require('../models');

// ──────────────────────────────────────────────────────────────────────────────
// Employment ID allocation.
//
// Lives here rather than in employeeController because that controller pulls in
// the upload machinery (multer/uuid), which a test cannot load — the same
// reason attendance's shared helpers were factored into utils/.
// ──────────────────────────────────────────────────────────────────────────────

// Resolves the visible prefix of an employment ID.
//
// A mine can carry a short location abbreviation (Branch.location_abbr); when it
// does, an employee attached to it is issued EMP-KHW-0007 instead of
// EMP-3-0007. The shop is still the owning tenant on the row — it just stops
// being the visible part of the ID.
//
// `requested` is what the user picked in the employee form's abbreviation
// dropdown. It's re-checked against this shop's own mines rather than trusted,
// so a hand-crafted request can't mint an ID under a prefix that doesn't exist
// or belongs to another tenant. Anything blank or unrecognised falls back to the
// shop id, which is exactly the format every existing ID already uses.
async function resolveEmploymentPrefix(shopId, requested, transaction) {
  const abbr = String(requested || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!abbr) return String(shopId);

  const owned = await db.Branch.findOne({
    where: { shop_id: shopId, location_abbr: abbr },
    attributes: ['id'],
    transaction,
  });
  return owned ? abbr : String(shopId);
}

// The employment ID's trailing number is a SINGLE running sequence per shop,
// shared by every prefix — so a shop using two abbreviations issues
// EMP-KHW-0006, EMP-STH-0007, EMP-3-0008 rather than restarting the count for
// each one ("no mixing up of them", confirmed with the user).
//
// Derived from the highest number already issued in this shop rather than from
// a row count: counting would re-hand-out a number after an employee is
// deleted, and — now that the prefix varies — the old exact-string collision
// check would no longer catch it, since EMP-KHW-0002 and EMP-3-0002 are
// different strings that both mean "employee number 2".
const EMPLOYMENT_ID_SEQ_RE = /-(\d+)$/;

async function nextEmploymentId(shopId, requestedAbbr, transaction) {
  const prefix = await resolveEmploymentPrefix(shopId, requestedAbbr, transaction);

  const issued = await db.Employee.findAll({
    where: { shop_id: shopId },
    attributes: ['employment_id'],
    raw: true,
    transaction,
  });

  const highest = issued.reduce((max, row) => {
    const m = EMPLOYMENT_ID_SEQ_RE.exec(row.employment_id || '');
    if (!m) return max;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  let seq = highest + 1;
  let code;
  do {
    code = `EMP-${prefix}-${String(seq).padStart(4, '0')}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await db.Employee.findOne({
      where: { shop_id: shopId, employment_id: code },
      transaction,
    });
    if (!exists) return code;
    seq += 1;
  } while (seq < highest + 1000);
  return `EMP-${prefix}-${Date.now()}`;
}

// Splits an issued ID back into its two meaningful halves. Returns null for
// anything that doesn't match, so a hand-edited or legacy value is left alone
// rather than mangled.
const EMPLOYMENT_ID_RE = /^EMP-(.+)-(\d+)$/;

function parseEmploymentId(employmentId) {
  const m = EMPLOYMENT_ID_RE.exec(String(employmentId || ''));
  if (!m) return null;
  return { prefix: m[1], seq: m[2] };
}

// Re-issues an EXISTING employee's ID under a different location abbreviation.
//
// Only the visible prefix changes — the sequence number is carried across
// untouched (EMP-1-0002 → EMP-KHW-0002), so re-issuing never consumes a new
// number, never leaves a hole, and never disturbs the shop-wide ordering.
// That is the whole difference between this and nextEmploymentId.
//
// Returns the current ID unchanged when nothing would actually change, so a
// plain profile save that happens to include the field is a no-op.
async function reissueEmploymentId(shopId, currentId, requestedAbbr, transaction) {
  const parsed = parseEmploymentId(currentId);
  // An ID we can't parse has no identifiable sequence number to preserve, so
  // rewriting it would be guesswork — leave it exactly as it is.
  if (!parsed) return currentId;

  const prefix = await resolveEmploymentPrefix(shopId, requestedAbbr, transaction);
  if (prefix === parsed.prefix) return currentId;

  const next = `EMP-${prefix}-${parsed.seq}`;

  // (shop_id, employment_id) is uniquely indexed. A collision here means two
  // employees already share a sequence number, which shouldn't happen — fail
  // loudly rather than surfacing a raw constraint error from the save.
  const clash = await db.Employee.findOne({
    where: { shop_id: shopId, employment_id: next },
    attributes: ['id', 'name'],
    transaction,
  });
  if (clash) {
    const e = new Error(`Employment ID ${next} is already used by ${clash.name}`);
    e.statusCode = 409;
    throw e;
  }

  return next;
}

module.exports = {
  resolveEmploymentPrefix, nextEmploymentId, parseEmploymentId, reissueEmploymentId,
};
