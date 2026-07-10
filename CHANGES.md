# CHANGES — ESMS Phases 0–5

Every change below was tested against a clean database. "Fresh install" = ran all
migrations + seeders from an empty DB; "existing DB" = your populated database.

## Phase 0 — Repo hygiene (you already did most of this in your IDE)
- `backend/.gitignore` — ignores `.env`, `*.sqlite`, `node_modules`, `dist`, logs.
- `backend/.env.example` — safe template (adds `CORS_ORIGINS`), no real values.
- (Secret rotation and git-untracking you already performed on your machine.)

## Phase 1 — Critical access control & data integrity
- **Categories are now tenant-scoped.** `models/category.js` gains `shop_id`;
  `controllers/categoryController.js` filters/sets/validates by shop on every
  handler. Migration `...000000-add-shop-to-categories` adds + backfills the
  column. Fixes a cross-tenant leak where any shop could see/edit/delete another
  shop's categories.
- **Sale price is server-owned.** `controllers/saleController.js` now takes the
  unit price from the product record; a client-supplied `unit_price` is honored
  ONLY if the user has the new `sales:override_price` permission. Discounts/tax
  are clamped so a total can never go negative.
- **Customer balance is ledger-only.** `controllers/customerController.js` no
  longer accepts `current_balance` from the request on create/update. It changes
  only through sales/payments/returns.

## Phase 2 — High-severity correctness
- **Per-shop invoice numbers.** Invoice numbers are now `INV-<shopId>-<date>-<seq>`
  so two shops can't collide on the global-unique constraint.
- **Oversell + duplicate-line fix.** Sale creation aggregates quantities per
  product, locks the stock row (`LOCK.UPDATE`), and re-checks availability before
  decrementing. Stock can't go negative; the same product in two lines can't
  double-spend stock.
- **Receiving stock no longer fakes a paid bill.** Purchase invoices from stock
  receipts are created `unpaid`.
- **Weighted-average cost.** Receiving stock updates `cost_price` by weighted
  average instead of overwriting.
- **Suspended-shop reactivation fixed.** `users.disabled_by_suspension` (new
  column) tracks which users a suspension disabled, so reactivating a shop
  re-enables exactly those — not users an admin disabled individually.
- **FK validation.** Sales and inventory now verify `branch_id`, `customer_id`,
  `employee_id`, `supplier_id` belong to the caller's shop.
- **CORS + rate limiting.** `server.js` uses an origin allowlist from
  `CORS_ORIGINS`, throttles `/auth/login` and `/auth/refresh`, adds a general
  API limiter, a 1 MB body limit, a global error handler that stops leaking
  internals, and moves the health check so it isn't shadowed by the auth router.

## Phase 4 — Sales Returns & Exchange (the new feature)
- New tables via `...000002-sales-returns-module`: `sale_returns` (header) and
  `sale_return_items` (lines); plus a `returns` permission module and
  `sales:override_price`, granted to roles (admin full; cashier read-only).
- `controllers/saleReturnController.js` + routes in `routes/businessRoutes.js`:
  - `GET /sales/:id/returnable` — sale items with returnable quantity.
  - `GET /returns`, `GET /returns/:id`, `POST /returns`, `POST /returns/:id/void`.
  - **Refund**: restocks items, cash back for cash/card sales, or reduces the
    customer's balance for credit/installment sales (any excess over the
    outstanding balance is refunded in cash). Over-return is blocked.
  - **Exchange**: enforces new-items total ≥ returned value (never below),
    restocks returned items, decrements exchanged items, creates a new invoice,
    and collects only the difference.
  - **Void**: reverses a refund (pulls stock back, reverses balance credit);
    exchanges can't be auto-voided (they issued a real invoice).
- Frontend: `src/pages/returns/SalesReturns.jsx` + route in `App.jsx` + sidebar
  entry + `Returns`/`واپسی` labels in `translations.js`.

## Phase 5 — Business-logic / accounting correctness
- Installment inputs validated (`number_of_installments >= 1`, `markup_rate >= 0`)
  to prevent divide-by-zero.
- Credit sale with no up-front payment now correctly records the full balance
  (previously it recorded a full payment).
- Installment payment: rejects non-positive amounts, locks the schedule row
  against double-payment, and deducts only principal+markup (not late fees) from
  the customer balance.
- `createShop` validates before opening its transaction (no leaked transaction
  handles on early return).
- Fixed a pre-existing alias bug in the customer-detail endpoint.

## Bonus bug fixes found during testing (not in the original plan)
- **`...000003-fix-missing-installment-tables`**: a fresh install from migrations
  was missing `installment_schedule` and `installment_payments` entirely, so
  installments broke on any clean deploy. Now created (guarded — no-op if present).
- **`...000004-align-schema-with-models`**: several model tables/columns
  (`stock_adjustments`, `purchase_invoices`, `customer_type`, etc.) existed only
  because of early `sequelize.sync()` and were absent from a migration-only
  install. This migration fills those gaps (guarded, additive only).
- Rollback-after-commit crashes in the transactional controllers are now guarded
  with `transaction.finished`.

## Files changed (27)
backend: `.gitignore`, `.env.example`, `server.js`, `package.json`,
`package-lock.json`, controllers (`sale`, `saleReturn`, `customer`, `category`,
`installment`, `inventory`, `shop`), models (`category`, `user`, `salereturn`,
`salereturnitem`), routes (`businessRoutes`), seeder
(`...roles-permissions-users-coa`), and 5 migrations (`...000000`–`...000004`).
frontend: `App.jsx`, `layouts/SidebarLayout.jsx`, `translations.js`,
`pages/returns/SalesReturns.jsx`.
