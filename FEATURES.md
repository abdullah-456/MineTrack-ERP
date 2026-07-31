# ESMS — Electronics Shop Management System
### Feature sheet for sales conversations

> **What it is:** a complete, bilingual (English / اردو) shop management platform that runs the
> counter, the warehouse, the payroll and the accounts — with a real double-entry ledger
> underneath, so the books and the operations can never tell two different stories.

Every claim in this document was verified against the running code. A short
**["Not yet"](#not-yet--do-not-promise-these)** section at the end lists what to avoid promising,
so nothing falls over in a live demo.

---

## Why it wins

- **The books can't drift.** Every sale, purchase, expense, salary and stock receipt automatically
  posts a double-entry voucher. There is no month-end "reconcile the system with reality" ritual,
  because the ledger *is* the record.
- **Built for how shops here actually run.** Multiple branches, separate godowns, credit customers,
  salary advances, director-held cash, CNIC as identity — all first-class, not bolted on.
- **Full English and Urdu**, including right-to-left layout, switchable per user at any time.
- **Governance built in.** Every change is audit-logged, and staff deletions become approval
  requests instead of silently destroying records.

---

## 1. Sales & counter operations

- Sell for **cash, card, bank transfer, or on credit** — credit sales require a registered customer.
- Line-level discounts and tax, per-sale notes, and back-dated sale entry.
- **Pricing is server-owned.** A cashier cannot quietly change a price; overriding it requires the
  dedicated `sales:override_price` permission, which only trusted roles hold.
- Attribute every sale to a **branch or godown** and to the **salesperson** who made it.
- Customer advances are drawn down automatically against new sales.
- **Gate passes** — issue, print and manage goods-out passes.
- **Sales returns and exchanges**, with refunds and a void path that reverses the accounting.
- A unified **invoice register** covering sales, purchases and returns in one searchable list.

## 2. Inventory & warehousing

- Product catalogue with categories, supplier links, and **auto-generated SKUs** when left blank.
- Stock tracked **per branch and per godown**, with godown-to-branch linking.
- **Receive**, **adjust**, and **transfer stock between locations** — every movement paired and
  recorded.
- Complete **stock movement history** with on-hand quantity and valuation.
- **Low-stock alerts** surfaced directly on the dashboard.

## 3. Procurement

- **Purchase orders** — draft, send to supplier, cancel; with vendor reference and expected date.
- **Goods Receipt Notes** — raise standalone or straight from a PO, receive partial quantities,
  and hold them as drafts until someone with approval rights **posts** them. Stock only moves on
  posting, so a receiving clerk can never inflate inventory alone.
- **Supplier ledger** with payments, opening balances, and **prepaid supplier credit** that applies
  itself automatically to the next purchase.

## 4. Customers & receivables

- Customer register with CNIC, credit limits and running balances.
- **Customer ledger** showing every charge, recovery and return credit with a running balance.
- Overpayments **roll over into advance credit** automatically instead of erroring out.
- Printable customer statements on company letterhead.

## 5. Employees & HR

- A genuinely complete employee file: personal details, contact and emergency contact, education,
  previous **employment history**, and **dependants** — not just a name and a salary.
- **Auto-generated employment IDs** (e.g. `EMP-1-0004`).
- **Employee ledger** covering salary, advances, loans, recoveries and opening balances.
- **Payroll** with generated **payslips** and a guard preventing the same month being paid twice.
- **Loans** with instalment schedules, and **salary advances** that deduct themselves from the
  month you nominate — no separate collection step.
- **Termination workflow**: preview the full settlement (outstanding loans, uncleared advances,
  dues) before confirming, then print a **clearance certificate**.
- Staff status lifecycle — active, suspended, terminated — changeable directly from the list.

## 6. Accounting — a real double-entry engine

- **Chart of accounts** across seven root types, hierarchical and fully manageable by the user.
- **Manual journal entries** with a live "not balanced yet" check before posting.
- **General ledger** with rich filtering and one-click drill-down to the originating voucher.
- Every operational transaction **auto-posts its voucher** — this is the core of the product.
- **Cash sessions**, opening cash, multiple **bank accounts**, live cash and bank balances, and a
  money-flow view of everything in and out over any date range.

## 7. Financial statements

Produced from the general ledger, for any date range:

**Trial Balance** · **Profit & Loss** · **Balance Sheet** · **Statement of Changes in Equity** ·
**Cash Flow Statement**

## 8. Board of Directors & capital

Purpose-built for owner-operated businesses where directors move company money personally:

- Track each director's **Investment** as a memo equity claim, kept separate from company cash.
- Give each director a **Current Cash** and **Current Bank** wallet — these then appear as payment
  sources everywhere in the app, so "Sheraz paid the supplier from his own pocket" is a normal,
  fully-accounted transaction.
- Personal deposits, Capital ↔ Current transfers, per-director ledger, and Due-from-Director
  tracking.

## 9. Reporting & documents

- **Reports Hub** with nine module summaries: sales, purchases, inventory, customers, suppliers,
  expenses, accounting, employees, and board/capital.
- **Print, PDF and Excel** export on essentially every list in the system.
- PDFs are true vector documents on your **company letterhead with your uploaded logo**, including
  the filters applied, totals, and a signature block.
- Date-range, status and branch/godown filters throughout.
- **Dashboard**: today's and this week's sales, order counts, cash and bank position, money flow,
  stock value, low-stock alerts, recent sales, and a weekly sales/purchases chart.
- Printable vouchers with **amount in words**.

## 10. Multi-branch & multi-shop

- Run **multiple branches and godowns** under one shop, with per-location stock and reporting.
- A **super-admin platform tier** manages many independent shops — create, configure, activate or
  suspend each one. Sell it to a single shop, or run it as a service for many.
- Shop and branch scoping is enforced **server-side**, not just hidden in the UI.

## 11. Security & governance

- **JWT authentication** with short-lived access tokens and httpOnly refresh cookies; passwords
  hashed with bcrypt. Rate limiting, security headers and input validation throughout.
- **Granular role-based permissions** — every module against create / read / update / delete /
  approve. Build your own roles from the permissions catalogue.
- Four roles out of the box: **Super Admin, Admin, Accountant, Cashier**.
- **Audit log** of every change: who, what module, what action, from which IP.
- **Maker–checker deletions.** When a staff member deletes something, it becomes a *deletion
  request* for an admin to approve or reject — and approval performs a reversible disable or void,
  not a hard delete. Records survive mistakes and disputes.
- **One CNIC = one person**, enforced across employees, customers, suppliers, directors and
  guarantors — no duplicate identities in the system.

## 12. Everyday experience

- **English and Urdu** with proper right-to-left layout; switch language any time.
- **Dark and light themes.**
- Works on desktop and mobile; collapsible sidebar and mobile drawer.
- Company profile with logo upload, applied to every printed document.

---

## What each person gets

| Role | What they get |
|---|---|
| **Owner** | Live cash and bank position, money flow, profitability, and full visibility of what every branch and staff member is doing — without touching a spreadsheet. |
| **Accountant** | A real double-entry ledger, manual journals, the full statement set, and drill-down from any number to its source voucher. |
| **Manager / HR** | Purchase orders and receipts, stock across locations, complete staff files, payroll, advances, loans and clean terminations. |
| **Cashier** | A fast sale screen with server-enforced pricing they cannot override, and only the access they need. |

---

## Technical fact sheet

| | |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS, Recharts |
| **Backend** | Node.js, Express 5, Sequelize ORM |
| **Database** | PostgreSQL |
| **Auth** | JWT access tokens + httpOnly refresh cookies, bcrypt |
| **Documents** | Vector PDF generation, Excel export, print stylesheets |
| **Schema** | Fully migration-managed — upgrades apply cleanly to live data |
| **Deployment** | Self-hosted or cloud; single shop or multi-tenant |

---

## Not yet — do not promise these

Internal note. These exist as partial scaffolding and would fail a live demo:

| Item | Reality |
|---|---|
| Attendance tracking | Database table exists; no screen or API. Not usable. |
| Tax configuration | Table exists but is entirely unreferenced. Per-sale tax entry works; a tax *master* does not. |
| Guarantor management | Used only for CNIC duplicate checks. No screen to add or manage guarantors. |
| Installment sales | The backend accepts an instalment plan, but **no screen creates one**. Credit sales are the demoable path. |
| Held / parked sales | Only a status label. Nothing in the app can park a sale. |
| Global search | The top-bar search box is not wired up. |
| Notifications | The bell icon is decorative. |
| AP / AR aging reports | Placeholder screens. |
| Sale detail page | Placeholder — show the printable invoice instead. |
| Urdu PDFs | The UI is fully Urdu, but **exported PDFs transliterate to English** for font reasons. Demo Urdu on screen, not in PDF. |

Product creation and stock transfers **do** work — via modals on the Products and Inventory pages.
Avoid the `/products/new` and `/stock-transfers/new` URLs, which are placeholders.
