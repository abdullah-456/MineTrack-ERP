// Single source of truth for the software's own branding (distinct from a
// tenant shop's own business name/logo, which lives in the Shop/Company model).
// Used on the login page, sidebar, browser tab, and printed document footers.

export const APP_NAME = 'Mine Track ERP';
export const APP_TAGLINE = 'From Lease to Dispatch';
export const DEVELOPER_NAME = 'ASMRY Soft Solution';
export const DEVELOPER_CONTACT = '0334 9951063';

// Short credit line stamped in the footer of every printed document (invoices,
// slips, vouchers, reports) — separate from the tenant's own letterhead.
export const SOFTWARE_CREDIT = `${APP_NAME} — ${APP_TAGLINE}  |  Software by ${DEVELOPER_NAME}  |  ${DEVELOPER_CONTACT}`;
