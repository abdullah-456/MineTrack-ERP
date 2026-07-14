import { useState, useEffect, Fragment } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/axios';
import {
  PrintStyles, PrintActionBar, CompanyHeader, AmountWords, SignatureRow, DocFooter,
  INK, INK_SOFT, LINE,
} from '../../components/print/PrintKit';

/* ── helpers ──────────────────────────────────────────── */
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtPKR = (n) => `Rs. ${(parseFloat(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtQty = (n) => (parseFloat(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* ── print-safe status chip (light fill + dark ink + border) ── */
function StatusChip({ status }) {
  const map = {
    paid: { bg: '#dcfce7', color: '#065f46', bd: '#16a34a' },
    partial: { bg: '#fef9c3', color: '#854d0e', bd: '#ca8a04' },
    pending: { bg: '#fee2e2', color: '#991b1b', bd: '#dc2626' },
    overdue: { bg: '#fee2e2', color: '#7f1d1d', bd: '#dc2626' },
    completed: { bg: '#dcfce7', color: '#065f46', bd: '#16a34a' },
    cancelled: { bg: '#f3f4f6', color: '#374151', bd: '#9ca3af' },
  };
  const s = map[status?.toLowerCase()] || { bg: '#f3f4f6', color: '#374151', bd: '#9ca3af' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 4, border: `1px solid ${s.bd}`,
      background: s.bg, color: s.color, fontWeight: 800, fontSize: 11, letterSpacing: 1,
    }}>
      {status?.toUpperCase() || '—'}
    </span>
  );
}

/* ── bordered meta grid: [{label,value}] laid out two pairs per row ── */
function MetaGrid({ items }) {
  const rows = [];
  const clean = items.filter(Boolean);
  for (let i = 0; i < clean.length; i += 2) rows.push(clean.slice(i, i + 2));
  return (
    <table className="doc" style={{ margin: '10px 0 14px' }}>
      <tbody>
        {rows.map((pair, ri) => (
          <tr key={ri}>
            {pair.map((it, ci) => (
              <Fragment key={ci}>
                <td style={{ color: INK_SOFT, width: '16%', whiteSpace: 'nowrap' }}>{it.label}</td>
                <td style={{ fontWeight: 700, width: '34%' }}>{it.value}</td>
              </Fragment>
            ))}
            {pair.length === 1 && <><td /><td /></>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── party block (Bill To / From Supplier / Customer) ── */
function PartyBox({ heading, name, lines = [], right }) {
  return (
    <div style={{ display: 'flex', gap: 14, margin: '0 0 12px' }}>
      <div style={{ flex: 1, border: `1px solid ${LINE}`, padding: '9px 11px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, marginBottom: 4 }}>{heading}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{name}</div>
        {lines.filter(Boolean).map((l, i) => (
          <div key={i} style={{ fontSize: 11.5, color: INK_SOFT, marginTop: 1 }}>{l}</div>
        ))}
      </div>
      {right && (
        <div style={{ flex: 1, border: `1px solid ${LINE}`, padding: '9px 11px' }}>{right}</div>
      )}
    </div>
  );
}

/* ── right-aligned totals box ── */
function TotalsBox({ rows }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
      <table className="doc" style={{ width: 300 }}>
        <tbody>
          {rows.filter(Boolean).map((r, i) => (
            <tr key={i} className={r.bold ? 'total' : ''}>
              <td style={{ color: r.bold ? INK : INK_SOFT }}>{r.label}</td>
              <td className="num" style={{ color: r.color || INK, fontWeight: r.bold ? 800 : 600 }}>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── shared items table (print-safe: dark ink on light header) ── */
function ItemsTable({ items, rowOf }) {
  return (
    <table className="doc" style={{ marginTop: 4 }}>
      <thead>
        <tr>
          <th style={{ width: '5%' }}>#</th>
          <th>Item</th>
          <th style={{ width: '16%' }}>SKU</th>
          <th className="num" style={{ width: '10%' }}>Qty</th>
          <th className="num" style={{ width: '16%' }}>Unit Price</th>
          <th className="num" style={{ width: '16%' }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 && (
          <tr><td colSpan={6} style={{ textAlign: 'center', color: INK_SOFT }}>No items</td></tr>
        )}
        {items.map((it, idx) => {
          const r = rowOf(it, idx);
          return (
            <tr key={idx}>
              <td>{idx + 1}</td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td style={{ color: INK_SOFT, fontFamily: 'monospace' }}>{r.sku || '—'}</td>
              <td className="num">{r.qty}</td>
              <td className="num">{r.price}</td>
              <td className="num" style={{ fontWeight: 700 }}>{r.amount}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ══════════════════════ SALE INVOICE ══════════════════════ */
function SaleInvoice({ data }) {
  const shop = data.Shop || {};
  const customer = data.Customer || {};
  const items = data.SaleItems || [];
  const payments = data.Payments || [];
  const subtotal = items.reduce((s, i) => s + parseFloat(i.line_total || 0), 0);
  const discount = parseFloat(data.discount || 0);
  const tax = parseFloat(data.tax || 0);
  const total = parseFloat(data.total || 0);
  const amountPaid = payments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const balanceDue = total - amountPaid;

  return (
    <div className="sheet">
      <CompanyHeader company={shop} docTitle="Sales Invoice" />
      <MetaGrid items={[
        { label: 'Invoice #', value: data.invoice_number },
        { label: 'Date', value: fmtDate(data.sale_date) },
        { label: 'Sale Type', value: (data.sale_type || 'cash').toUpperCase() },
        { label: 'Status', value: <StatusChip status={data.status} /> },
        data.Cashier && { label: 'Cashier', value: data.Cashier.name },
        data.Branch && { label: 'Branch', value: data.Branch.name },
        data.Employee && { label: 'Salesman', value: data.Employee.name },
      ]} />

      <PartyBox
        heading="BILL TO"
        name={customer.name || 'Walk-in Customer'}
        lines={[customer.phone && `Ph: ${customer.phone}`, customer.cnic && `CNIC: ${customer.cnic}`, customer.address]}
      />

      <ItemsTable items={items} rowOf={(it) => ({
        name: it.Product?.name || it.product_name || '—',
        sku: it.Product?.sku,
        qty: fmtQty(it.quantity),
        price: fmtPKR(parseFloat(it.line_total || 0) / (parseFloat(it.quantity) || 1)),
        amount: fmtPKR(it.line_total),
      })} />

      <TotalsBox rows={[
        { label: 'Subtotal', value: fmtPKR(subtotal) },
        discount > 0 && { label: 'Discount', value: `− ${fmtPKR(discount)}`, color: '#b91c1c' },
        tax > 0 && { label: 'Tax', value: fmtPKR(tax) },
        { label: 'Total', value: fmtPKR(total), bold: true },
        amountPaid > 0 && { label: 'Amount Paid', value: fmtPKR(amountPaid), color: '#047857' },
        balanceDue > 0.01 && { label: 'Balance Due', value: fmtPKR(balanceDue), bold: true, color: '#b91c1c' },
      ]} />

      <AmountWords amount={total} />

      {payments.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, marginBottom: 4 }}>PAYMENT HISTORY</div>
          <table className="doc">
            <thead><tr><th>Date</th><th>Method</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={i}>
                  <td>{fmtDate(p.payment_date || p.created_at)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.method || '—'}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{fmtPKR(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.description && (
        <div style={{ marginTop: 12, border: `1px solid ${LINE}`, padding: '8px 10px', fontSize: 12, color: INK }}>
          <span style={{ color: INK_SOFT, fontWeight: 700 }}>Note: </span>{data.description}
        </div>
      )}

      <SignatureRow left="Prepared By" right="Received By (Sign & Thumb)" />
      <DocFooter company={shop} />
    </div>
  );
}

/* ══════════════════════ PURCHASE INVOICE ══════════════════════ */
function PurchaseInvoice({ data }) {
  const shop = data.Shop || data.Supplier?.Shop || {};
  const supplier = data.Supplier || {};
  return (
    <div className="sheet">
      <CompanyHeader company={shop} docTitle="Purchase Invoice" />
      <MetaGrid items={[
        { label: 'Invoice #', value: data.invoice_number },
        { label: 'Date', value: fmtDate(data.invoice_date) },
        data.due_date && { label: 'Due Date', value: fmtDate(data.due_date) },
        { label: 'Status', value: <StatusChip status={data.status} /> },
      ]} />

      <PartyBox
        heading="SUPPLIER"
        name={supplier.company_name || '—'}
        lines={[
          supplier.contact_person && `Contact: ${supplier.contact_person}`,
          supplier.phone && `Ph: ${supplier.phone}`,
          supplier.email, supplier.address,
        ]}
        right={(
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, marginBottom: 4 }}>NOTES</div>
            <div style={{ fontSize: 11.5, color: INK_SOFT, lineHeight: 1.6 }}>{data.notes || 'No additional notes.'}</div>
          </>
        )}
      />

      <TotalsBox rows={[
        { label: 'Total Purchase Amount', value: fmtPKR(data.amount), bold: true },
      ]} />
      <AmountWords amount={data.amount} />

      <SignatureRow left="Prepared By" right="Authorised Signature" />
      <DocFooter company={shop} />
    </div>
  );
}

/* ══════════════════════ SALES RETURN ══════════════════════ */
function ReturnInvoice({ data }) {
  const shop = data.Shop || {};
  const customer = data.Customer || {};
  const items = data.ReturnItems || [];
  const isRefund = data.return_type === 'refund';
  return (
    <div className="sheet">
      <CompanyHeader company={shop} docTitle="Sales Return" />
      <MetaGrid items={[
        { label: 'Return #', value: data.return_number },
        { label: 'Date', value: fmtDateTime(data.return_date) },
        { label: 'Original Invoice', value: data.Sale?.invoice_number || '—' },
        { label: 'Return Type', value: (data.return_type || '').toUpperCase() },
        data.ProcessedBy && { label: 'Processed By', value: data.ProcessedBy.name },
        data.Branch && { label: 'Branch', value: data.Branch.name },
        { label: 'Status', value: <StatusChip status={data.status} /> },
        data.reason && { label: 'Reason', value: data.reason },
      ]} />

      <PartyBox
        heading="CUSTOMER"
        name={customer.name || 'Walk-in Customer'}
        lines={[customer.phone && `Ph: ${customer.phone}`, customer.address]}
      />

      <ItemsTable items={items} rowOf={(it) => ({
        name: it.Product?.name || `Product #${it.product_id}`,
        sku: it.Product?.sku,
        qty: fmtQty(it.quantity),
        price: fmtPKR(it.unit_price),
        amount: fmtPKR(it.line_total),
      })} />

      <TotalsBox rows={[
        { label: 'Returned Value', value: fmtPKR(data.returned_value) },
        isRefund
          ? { label: `Refunded (${data.refund_method})`, value: fmtPKR(data.refund_amount), bold: true, color: '#047857' }
          : { label: 'Settlement Paid', value: fmtPKR(data.settlement_amount), bold: true, color: '#4f46e5' },
      ]} />

      <AmountWords amount={isRefund ? data.refund_amount : data.settlement_amount} />
      <SignatureRow left="Processed By" right="Customer Sign & Thumb" />
      <DocFooter company={shop} />
    </div>
  );
}


/* ══════════════════════ MAIN PAGE ══════════════════════ */
export default function InvoicePrintPage() {
  const { invoiceId } = useParams();
  const [searchParams] = useSearchParams();
  const shopIdParam = searchParams.get('shop_id');
  const autoPrint = searchParams.get('auto_print') === '1';

  const [loading, setLoading] = useState(true);
  const [invoiceData, setInvoiceData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const params = shopIdParam ? { shop_id: shopIdParam } : {};
        const { data } = await api.get(`/invoices/${invoiceId}`, { params });
        setInvoiceData(data);
      } catch (e) {
        setErr(e.response?.data?.message || 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    })();
  }, [invoiceId, shopIdParam]);

  useEffect(() => {
    if (!loading && invoiceData && autoPrint) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [loading, invoiceData, autoPrint]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <div style={{ textAlign: 'center' }}>
        <Loader2 style={{ width: 40, height: 40, animation: 'spin 1s linear infinite', color: '#4f46e5', margin: '0 auto 12px' }} />
        <p style={{ color: INK_SOFT, fontSize: 14 }}>Loading document…</p>
      </div>
    </div>
  );

  if (err) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <div style={{ textAlign: 'center', padding: 32, background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <AlertCircle style={{ width: 48, height: 48, color: '#dc2626', margin: '0 auto 12px' }} />
        <p style={{ color: '#dc2626', fontWeight: 700 }}>{err}</p>
        <button onClick={() => window.close()} style={{ marginTop: 16, padding: '8px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Close Tab
        </button>
      </div>
    </div>
  );

  const { type, details } = invoiceData || {};

  return (
    <>
      <PrintStyles />
      <PrintActionBar />
      {type === 'sale' && <SaleInvoice data={details} />}
      {type === 'purchase' && <PurchaseInvoice data={details} />}
      {type === 'return' && <ReturnInvoice data={details} />}
    </>
  );
}
