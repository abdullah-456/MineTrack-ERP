# ESMS — Phases 0–5 (Security fixes + Sales Returns/Exchange)

This bundle contains your project **source** with Phases 0–5 applied and tested.
It deliberately does **NOT** include `node_modules`, `.env`, or `database.sqlite`,
so applying it can't clobber your secrets or data.

Everything here was verified end-to-end against a clean database in a Linux
sandbox: fresh migrations apply, the server boots, login works, and every new
flow (refund, exchange, over-return guard, price-tamper block, oversell block,
installment sale on a fresh DB) passed.

--------------------------------------------------------------------------------
## WHAT'S IN THE BOX
--------------------------------------------------------------------------------

- `esms/`  — the full project source (backend + frontend), Phases 0–5 applied
- `esms_phase0-5.patch` — the same changes as a unified diff, if you'd rather
  apply onto your existing git repo instead of copying files
- `CHANGES.md` — a plain-English list of every change and why
- this file

--------------------------------------------------------------------------------
## HOW TO USE IT — PICK ONE
--------------------------------------------------------------------------------

### Option A — Git patch onto your existing repo (recommended, keeps history)

From your project root (`e:\esms`), on a NEW branch:

```powershell
cd e:\esms
git checkout -b phase-0-5
git apply --whitespace=nowarn path\to\esms_phase0-5.patch
```

If `git apply` complains, use the more forgiving three-way merge:

```powershell
git apply --3way path\to\esms_phase0-5.patch
```

Then review the diff in your IDE, and if happy: `git add -A && git commit`.

> The patch touches 27 files (see CHANGES.md). It does NOT touch `.env`,
> `database.sqlite`, or `node_modules`.

### Option B — Copy the folder (simplest)

1. Copy the `esms/` folder from this bundle over your project, OR extract it to a
   fresh location.
2. Copy your existing `backend/.env` into the new `backend/` (it isn't included).
   If you don't have one, copy `backend/.env.example` to `backend/.env` and fill
   in the two JWT secrets and DB values.

--------------------------------------------------------------------------------
## AFTER APPLYING — INSTALL, MIGRATE, RUN
--------------------------------------------------------------------------------

One new backend dependency was added (`express-rate-limit`), so install first.

**Backend**
```powershell
cd e:\esms\backend
npm install
npm run migrate
npm run dev
```

If this is a brand-new database (no data yet), also seed the demo data:
```powershell
npm run seed
```

**Frontend** (no new dependencies)
```powershell
cd e:\esms\frontend
npm install     # only needed if node_modules is missing
npm run dev
```

Open http://localhost:5173 and log in. Because Phase 0 rotated your JWT secrets,
any old session is invalid — log in again (e.g. `admin@demo.esms.local` /
`Admin@123`).

--------------------------------------------------------------------------------
## IMPORTANT — RUNNING ON YOUR EXISTING DATABASE
--------------------------------------------------------------------------------

The 5 new migrations are written to be **safe on your existing data** — they only
ADD tables/columns and backfill; nothing is dropped. Still, before running
`npx sequelize db:migrate` on a database you care about:

**Back it up first.** For SQLite that's literally copying the file:
```powershell
copy e:\esms\backend\database.sqlite e:\esms\backend\database.backup.sqlite
```

The migrations:
- add `shop_id` to categories (fixes a cross-tenant data leak) and backfill it
- add `disabled_by_suspension` to users (fixes suspended-shop reactivation)
- create the sales-returns tables and backfill the `returns` permissions
- create `installment_schedule` / `installment_payments` **if missing**
  (fixes a real bug: a fresh install from migrations was missing these — your
  dev DB only had them because early code used sequelize.sync())
- fill any other schema gaps between your models and the migration-built schema

All five are guarded (they check before creating), so re-running is safe.

--------------------------------------------------------------------------------
## HOW TO TRY THE NEW RETURNS FEATURE
--------------------------------------------------------------------------------

1. Log in as an admin (returns creation is admin-only by default; cashiers can
   view but not create — change this in the seeder/migration grants if you want).
2. Make a normal sale (POS/Sales).
3. Open the new **Returns** item in the sidebar → **New Return**.
4. Search the sale by its invoice number, pick the item(s) and quantity.
5. Choose **Refund** (cash back, item restocked) or **Exchange** (pick
   replacement products — the app blocks you if the exchange total is BELOW the
   returned value, and collects the difference).
6. A return slip is shown; exchanges also produce a new invoice.

--------------------------------------------------------------------------------
## WHAT'S NOT INCLUDED (still on the roadmap)
--------------------------------------------------------------------------------

Phases 6–11 from the build plan (audit logging, double-entry accounting/GL,
procurement PO→GRN, stock transfers, HR/payroll/expenses, pagination + indexes
for scale, and the auth-token hardening) are NOT in this bundle. They're larger
modules that need your product decisions and their own testing pass.

Also intentionally deferred: the destructive "drop dead/duplicate columns"
cleanup (Phase 3 in the original audit). Dropping columns on a live SQLite DB is
where you could lose data, so that's left for a separate, backed-up step. The app
runs fine with those unused columns present.
