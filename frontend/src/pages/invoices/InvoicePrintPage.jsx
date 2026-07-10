import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Printer, Download, ArrowLeft, Loader2, CheckCircle2, Clock, AlertCircle, Package } from 'lucide-react';
import api from '../../api/axios';

/* ── helpers ──────────────────────────────────────────── */
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-PK', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtPKR = (n) =>
  `Rs. ${(parseFloat(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── Status badge (print-safe solid colours) ──────────── */
function StatusChip({ status }) {
  const map = {
    paid:      { bg: '#d1fae5', color: '#065f46', label: 'PAID' },
    partial:   { bg: '#fef3c7', color: '#92400e', label: 'PARTIAL' },
    pending:   { bg: '#fee2e2', color: '#991b1b', label: 'PENDING' },
    overdue:   { bg: '#fee2e2', color: '#7f1d1d', label: 'OVERDUE' },
    completed: { bg: '#d1fae5', color: '#065f46', label: 'COMPLETED' },
    cancelled: { bg: '#f3f4f6', color: '#374151', label: 'CANCELLED' },
  };
  const s = map[status?.toLowerCase()] || { bg: '#f3f4f6', color: '#374151', label: status?.toUpperCase() || '—' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 4,
      backgroundColor: s.bg, color: s.color, fontWeight: 700, fontSize: 11, letterSpacing: 1,
    }}>
      {s.label}
    </span>
  );
}

/* ── Watermark stripe for status ──────────────────────── */
function Watermark({ status }) {
  if (status?.toLowerCase() === 'paid' || status?.toLowerCase() === 'completed') return null;
  const label = status?.toUpperCase() || '';
  const color = status?.toLowerCase() === 'overdue' ? 'rgba(220,38,38,0.07)' : 'rgba(251,191,36,0.07)';
  const textColor = status?.toLowerCase() === 'overdue' ? 'rgba(220,38,38,0.15)' : 'rgba(251,191,36,0.15)';
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 0,
    }}>
      <div style={{
        fontSize: 130, fontWeight: 900, color: textColor,
        transform: 'rotate(-30deg)', whiteSpace: 'nowrap', userSelect: 'none',
        letterSpacing: 12,
      }}>
        {label}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SALE INVOICE
══════════════════════════════════════════════════════════ */
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
    <div className="invoice-sheet" style={{ position: 'relative' }}>
      <Watermark status={data.status} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          {/* Shop Info */}
          <div>
            {shop.logo_url && (
              <img src={shop.logo_url} alt="logo" style={{ height: 56, marginBottom: 10, objectFit: 'contain' }} />
            )}
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1e1b4b', letterSpacing: -0.5 }}>
              {shop.name || 'Business Name'}
            </div>
            {shop.owner_name && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{shop.owner_name}</div>}
            {shop.address && <div style={{ fontSize: 11, color: '#6b7280', maxWidth: 240, marginTop: 4, lineHeight: 1.5 }}>{shop.address}</div>}
            {shop.phone && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📞 {shop.phone}</div>}
            {shop.email && <div style={{ fontSize: 11, color: '#6b7280' }}>✉ {shop.email}</div>}
          </div>

          {/* Invoice Title + Number */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#4f46e5', letterSpacing: -1, lineHeight: 1 }}>INVOICE</div>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#374151', marginTop: 6, fontWeight: 700 }}>
              {data.invoice_number}
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                <span style={{ color: '#9ca3af' }}>Issue Date:</span>
                <span style={{ color: '#374151', fontWeight: 600 }}>{fmtDate(data.sale_date)}</span>
              </div>
              {data.Cashier && (
                <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                  <span style={{ color: '#9ca3af' }}>Cashier:</span>
                  <span style={{ color: '#374151', fontWeight: 600 }}>{data.Cashier.name}</span>
                </div>
              )}
              {data.Branch && (
                <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                  <span style={{ color: '#9ca3af' }}>Branch:</span>
                  <span style={{ color: '#374151', fontWeight: 600 }}>{data.Branch.name}</span>
                </div>
              )}
              {data.Employee && (
                <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                  <span style={{ color: '#9ca3af' }}>Employee:</span>
                  <span style={{ color: '#374151', fontWeight: 600 }}>{data.Employee.name}</span>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <StatusChip status={data.status} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#4f46e5,#818cf8)', borderRadius: 4, marginBottom: 24 }} />

        {/* ── BILL TO ── */}
        <div style={{ display: 'flex', gap: 32, marginBottom: 28 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 6 }}>BILL TO</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e1b4b' }}>{customer.name || 'Walk-in Customer'}</div>
            {customer.phone && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📞 {customer.phone}</div>}
            {customer.cnic && <div style={{ fontSize: 11, color: '#6b7280' }}>🪪 CNIC: {customer.cnic}</div>}
            {customer.address && <div style={{ fontSize: 11, color: '#6b7280', maxWidth: 200, lineHeight: 1.5 }}>{customer.address}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 6 }}>SALE TYPE</div>
            <div style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: 6,
              background: data.sale_type === 'cash' ? '#d1fae5' : '#ede9fe',
              color: data.sale_type === 'cash' ? '#065f46' : '#4c1d95',
              fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1,
            }}>
              {data.sale_type || 'Cash'}
            </div>
          </div>
        </div>

        {/* ── ITEMS TABLE ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#4f46e5' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>#</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>ITEM</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>SKU</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>QTY</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>UNIT PRICE</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} style={{ background: idx % 2 === 0 ? '#f9fafb' : '#ffffff', borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '9px 12px', fontSize: 12, color: '#9ca3af' }}>{idx + 1}</td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: '#111827', fontWeight: 600 }}>
                  {item.Product?.name || item.product_name || '—'}
                </td>
                <td style={{ padding: '9px 12px', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                  {item.Product?.sku || '—'}
                </td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: '#374151', textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: '#374151', textAlign: 'right' }}>
                  {fmtPKR(parseFloat(item.line_total || 0) / (parseFloat(item.quantity) || 1))}
                </td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: '#111827', fontWeight: 700, textAlign: 'right' }}>
                  {fmtPKR(item.line_total)}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>No items found</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ── TOTALS ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
          <div style={{ width: 260 }}>
            <TotalRow label="Subtotal" value={fmtPKR(subtotal)} />
            {discount > 0 && <TotalRow label="Discount" value={`−${fmtPKR(discount)}`} valueColor="#dc2626" />}
            {tax > 0 && <TotalRow label="Tax" value={fmtPKR(tax)} />}
            <div style={{ height: 1, background: '#e5e7eb', margin: '8px 0' }} />
            <TotalRow label="Total" value={fmtPKR(total)} bold />
            {amountPaid > 0 && <TotalRow label="Amount Paid" value={fmtPKR(amountPaid)} valueColor="#059669" />}
            {balanceDue > 0.01 && <TotalRow label="Balance Due" value={fmtPKR(balanceDue)} bold valueColor="#dc2626" />}
          </div>
        </div>

        {/* ── PAYMENT HISTORY ── */}
        {payments.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 10 }}>PAYMENT HISTORY</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>Method</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 8px', color: '#374151' }}>{fmtDate(p.payment_date || p.created_at)}</td>
                    <td style={{ padding: '6px 8px', color: '#374151', textTransform: 'capitalize' }}>{p.method || '—'}</td>
                    <td style={{ padding: '6px 8px', color: '#059669', textAlign: 'right', fontWeight: 600 }}>{fmtPKR(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── FOOTER ── */}
        <InvoiceFooter shop={shop} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PURCHASE INVOICE
══════════════════════════════════════════════════════════ */
function PurchaseInvoice({ data }) {
  const shop = data.Shop || data.Supplier?.Shop || {};
  const supplier = data.Supplier || {};

  return (
    <div className="invoice-sheet" style={{ position: 'relative' }}>
      <Watermark status={data.status} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            {shop.logo_url && (
              <img src={shop.logo_url} alt="logo" style={{ height: 56, marginBottom: 10, objectFit: 'contain' }} />
            )}
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1e1b4b' }}>{shop.name || 'Business Name'}</div>
            {shop.owner_name && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{shop.owner_name}</div>}
            {shop.address && <div style={{ fontSize: 11, color: '#6b7280', maxWidth: 240, marginTop: 4, lineHeight: 1.5 }}>{shop.address}</div>}
            {shop.phone && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📞 {shop.phone}</div>}
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#2563eb', letterSpacing: -1, lineHeight: 1 }}>PURCHASE</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#2563eb', letterSpacing: 1, marginTop: 2 }}>INVOICE</div>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#374151', marginTop: 6, fontWeight: 700 }}>
              {data.invoice_number}
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                <span style={{ color: '#9ca3af' }}>Invoice Date:</span>
                <span style={{ color: '#374151', fontWeight: 600 }}>{fmtDate(data.invoice_date)}</span>
              </div>
              {data.due_date && (
                <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                  <span style={{ color: '#9ca3af' }}>Due Date:</span>
                  <span style={{ color: '#374151', fontWeight: 600 }}>{fmtDate(data.due_date)}</span>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <StatusChip status={data.status} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 3, background: 'linear-gradient(90deg,#2563eb,#60a5fa)', borderRadius: 4, marginBottom: 24 }} />

        {/* ── FROM / TO ── */}
        <div style={{ display: 'flex', gap: 32, marginBottom: 28 }}>
          <div style={{ flex: 1, padding: 16, background: '#f0f4ff', borderRadius: 8, borderLeft: '3px solid #2563eb' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 6 }}>FROM SUPPLIER</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e1b4b' }}>{supplier.company_name || '—'}</div>
            {supplier.contact_person && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>👤 {supplier.contact_person}</div>}
            {supplier.phone && <div style={{ fontSize: 11, color: '#6b7280' }}>📞 {supplier.phone}</div>}
            {supplier.email && <div style={{ fontSize: 11, color: '#6b7280' }}>✉ {supplier.email}</div>}
            {supplier.address && <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>{supplier.address}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 6 }}>NOTES</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>{data.notes || 'No additional notes.'}</div>
          </div>
        </div>

        {/* ── AMOUNT SUMMARY ── */}
        <div style={{ padding: 24, background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', borderRadius: 12, marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: 1 }}>TOTAL PURCHASE AMOUNT</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#1e40af', marginTop: 4 }}>{fmtPKR(data.amount)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <StatusChip status={data.status} />
            {data.due_date && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>Due: {fmtDate(data.due_date)}</div>
            )}
          </div>
        </div>

        <InvoiceFooter shop={shop} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   RETURN INVOICE / SLIP
══════════════════════════════════════════════════════════ */
function ReturnInvoice({ data }) {
  const shop = data.Shop || {};
  const customer = data.Customer || {};
  const items = data.ReturnItems || [];

  return (
    <div className="invoice-sheet" style={{ position: 'relative' }}>
      <Watermark status={data.status} />
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          {/* Shop Info */}
          <div>
            {shop.logo_url && (
              <img src={shop.logo_url} alt="logo" style={{ height: 56, marginBottom: 10, objectFit: 'contain' }} />
            )}
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1e1b4b', letterSpacing: -0.5 }}>
              {shop.name || 'Business Name'}
            </div>
            {shop.owner_name && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{shop.owner_name}</div>}
            {shop.address && <div style={{ fontSize: 11, color: '#6b7280', maxWidth: 240, marginTop: 4, lineHeight: 1.5 }}>{shop.address}</div>}
            {shop.phone && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📞 {shop.phone}</div>}
            {shop.email && <div style={{ fontSize: 11, color: '#6b7280' }}>✉ {shop.email}</div>}
          </div>

          {/* Invoice Title + Number */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#f43f5e', letterSpacing: -1, lineHeight: 1 }}>RETURN SLIP</div>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#374151', marginTop: 6, fontWeight: 700 }}>
              {data.return_number}
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                <span style={{ color: '#9ca3af' }}>Return Date:</span>
                <span style={{ color: '#374151', fontWeight: 600 }}>{fmtDateTime(data.return_date)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                <span style={{ color: '#9ca3af' }}>Original Invoice:</span>
                <span style={{ color: '#374151', fontWeight: 600 }}>{data.Sale?.invoice_number || '—'}</span>
              </div>
              {data.ProcessedBy && (
                <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                  <span style={{ color: '#9ca3af' }}>Processed By:</span>
                  <span style={{ color: '#374151', fontWeight: 600 }}>{data.ProcessedBy.name}</span>
                </div>
              )}
              {data.Branch && (
                <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                  <span style={{ color: '#9ca3af' }}>Branch:</span>
                  <span style={{ color: '#374151', fontWeight: 600 }}>{data.Branch.name}</span>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <StatusChip status={data.status} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#f43f5e,#fb7185)', borderRadius: 4, marginBottom: 24 }} />

        {/* ── BILL TO ── */}
        <div style={{ display: 'flex', gap: 32, marginBottom: 28 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 6 }}>CUSTOMER</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e1b4b' }}>{customer.name || 'Walk-in Customer'}</div>
            {customer.phone && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📞 {customer.phone}</div>}
            {customer.address && <div style={{ fontSize: 11, color: '#6b7280', maxWidth: 200, lineHeight: 1.5 }}>{customer.address}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 6 }}>RETURN TYPE</div>
            <div style={{
              display: 'inline-block', padding: '4px 12px', borderRadius: 6,
              background: data.return_type === 'refund' ? '#ffe4e6' : '#ede9fe',
              color: data.return_type === 'refund' ? '#9f1239' : '#4c1d95',
              fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1,
            }}>
              {data.return_type}
            </div>
            {data.reason && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#4b5563' }}>
                <strong>Reason:</strong> {data.reason}
              </div>
            )}
          </div>
        </div>

        {/* ── ITEMS TABLE ── */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#f43f5e' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>#</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>ITEM</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>SKU</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>QTY</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>UNIT PRICE</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} style={{ background: idx % 2 === 0 ? '#f9fafb' : '#ffffff', borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '9px 12px', fontSize: 12, color: '#9ca3af' }}>{idx + 1}</td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: '#111827', fontWeight: 600 }}>
                  {item.Product?.name || `Product #${item.product_id}`}
                </td>
                <td style={{ padding: '9px 12px', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                  {item.Product?.sku || '—'}
                </td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: '#374151', textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: '#374151', textAlign: 'right' }}>
                  {fmtPKR(item.unit_price)}
                </td>
                <td style={{ padding: '9px 12px', fontSize: 12, color: '#111827', fontWeight: 700, textAlign: 'right' }}>
                  {fmtPKR(item.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── TOTALS ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
          <div style={{ width: 260 }}>
            <TotalRow label="Returned Value" value={fmtPKR(data.returned_value)} />
            {data.return_type === 'refund' ? (
              <TotalRow label={`Refunded (${data.refund_method})`} value={fmtPKR(data.refund_amount)} valueColor="#059669" />
            ) : (
              <>
                <TotalRow label="Exchange Offset" value={`−${fmtPKR(Math.min(parseFloat(data.returned_value), parseFloat(data.returned_value) + parseFloat(data.settlement_amount)))}`} />
                <TotalRow label="Settlement Paid" value={fmtPKR(data.settlement_amount)} valueColor="#4f46e5" />
              </>
            )}
          </div>
        </div>

        <InvoiceFooter shop={shop} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   INSTALLMENT PAYMENT RECEIPT
══════════════════════════════════════════════════════════ */
function InstallmentReceipt({ data }) {
  const plan = data.InstallmentSchedule?.InstallmentPlan || {};
  const schedule = data.InstallmentSchedule || {};
  const customer = plan.Customer || {};
  const sale = plan.Sale || {};
  const shop = sale.Shop || {};
  const receiptNo = `PAY-${new Date(data.payment_date).toISOString().slice(0, 10).replace(/-/g, '')}-${String(data.id).padStart(4, '0')}`;

  return (
    <div className="invoice-sheet" style={{ position: 'relative' }}>
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <div>
            {shop.logo_url && (
              <img src={shop.logo_url} alt="logo" style={{ height: 56, marginBottom: 10, objectFit: 'contain' }} />
            )}
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1e1b4b' }}>{shop.name || 'Business Name'}</div>
            {shop.owner_name && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{shop.owner_name}</div>}
            {shop.address && <div style={{ fontSize: 11, color: '#6b7280', maxWidth: 240, marginTop: 4, lineHeight: 1.5 }}>{shop.address}</div>}
            {shop.phone && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📞 {shop.phone}</div>}
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#7c3aed', letterSpacing: -1, lineHeight: 1 }}>PAYMENT</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#7c3aed', letterSpacing: 1, marginTop: 2 }}>RECEIPT</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#374151', marginTop: 6, fontWeight: 700 }}>
              {receiptNo}
            </div>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                <span style={{ color: '#9ca3af' }}>Payment Date:</span>
                <span style={{ color: '#374151', fontWeight: 600 }}>{fmtDateTime(data.payment_date)}</span>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <StatusChip status="paid" />
            </div>
          </div>
        </div>

        <div style={{ height: 3, background: 'linear-gradient(90deg,#7c3aed,#a78bfa)', borderRadius: 4, marginBottom: 24 }} />

        {/* ── CUSTOMER ── */}
        <div style={{ display: 'flex', gap: 32, marginBottom: 28 }}>
          <div style={{ flex: 1, padding: 16, background: '#faf5ff', borderRadius: 8, borderLeft: '3px solid #7c3aed' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 6 }}>CUSTOMER</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e1b4b' }}>{customer.name || '—'}</div>
            {customer.phone && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📞 {customer.phone}</div>}
            {customer.cnic && <div style={{ fontSize: 11, color: '#6b7280' }}>🪪 CNIC: {customer.cnic}</div>}
            {customer.address && <div style={{ fontSize: 11, color: '#6b7280' }}>{customer.address}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 6 }}>PLAN REFERENCE</div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.8 }}>
              <div><span style={{ color: '#9ca3af' }}>Parent Invoice:</span> <strong style={{ fontFamily: 'monospace' }}>{sale.invoice_number || '—'}</strong></div>
              <div><span style={{ color: '#9ca3af' }}>Installment No.:</span> <strong>#{schedule.installment_no}</strong></div>
              <div><span style={{ color: '#9ca3af' }}>Total Installments:</span> <strong>{plan.number_of_installments}</strong></div>
              <div><span style={{ color: '#9ca3af' }}>Frequency:</span> <strong style={{ textTransform: 'capitalize' }}>{plan.frequency}</strong></div>
            </div>
          </div>
        </div>

        {/* ── PAYMENT DETAILS ── */}
        <div style={{ padding: 24, background: 'linear-gradient(135deg,#f5f3ff,#ede9fe)', borderRadius: 12, marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: 1 }}>AMOUNT PAID</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: '#059669', marginTop: 4 }}>{fmtPKR(data.amount_paid)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#6b7280', letterSpacing: 1, marginBottom: 6 }}>PAYMENT METHOD</div>
              <div style={{
                display: 'inline-block', padding: '4px 14px', borderRadius: 6,
                background: '#dbeafe', color: '#1e40af', fontWeight: 700, fontSize: 12,
                textTransform: 'uppercase', letterSpacing: 1,
              }}>
                {data.method || 'Cash'}
              </div>
            </div>
          </div>

          {parseFloat(data.late_fee_charged) > 0 && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(220,38,38,0.08)', borderRadius: 6, border: '1px solid rgba(220,38,38,0.2)' }}>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>LATE FEE CHARGED</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{fmtPKR(data.late_fee_charged)}</div>
            </div>
          )}
        </div>

        {/* ── NOTES ── */}
        {data.notes && (
          <div style={{ marginBottom: 24, padding: 14, background: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
            <strong>Notes:</strong> {data.notes}
          </div>
        )}

        <InvoiceFooter shop={shop} />
      </div>
    </div>
  );
}

/* ── Shared Footer ───────────────────────────────────────── */
function InvoiceFooter({ shop }) {
  return (
    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <div style={{ fontSize: 11, color: '#9ca3af' }}>
        <div style={{ fontWeight: 600, color: '#6b7280', marginBottom: 2 }}>Thank you for your business!</div>
        {shop.email && <div>Questions? {shop.email}</div>}
        {shop.phone && <div>{shop.phone}</div>}
      </div>
      <div style={{ textAlign: 'right', fontSize: 10, color: '#d1d5db' }}>
        <div>Generated: {new Date().toLocaleString('en-PK')}</div>
        <div style={{ marginTop: 2 }}>Powered by ESMS</div>
      </div>
    </div>
  );
}

/* ── Reusable total row ──────────────────────────────────── */
function TotalRow({ label, value, bold, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: valueColor || '#111827', fontSize: bold ? 14 : 12 }}>{value}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════ */
export default function InvoicePrintPage() {
  const { invoiceId } = useParams();
  const [searchParams] = useSearchParams();
  const shopIdParam = searchParams.get('shop_id');

  const [loading, setLoading] = useState(true);
  const [invoiceData, setInvoiceData] = useState(null);
  const [err, setErr] = useState(null);
  const printRef = useRef(null);
  const autoPrint = searchParams.get('auto_print') === '1';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = shopIdParam ? { shop_id: shopIdParam } : {};
        const { data } = await api.get(`/invoices/${invoiceId}`, { params });
        setInvoiceData(data);
      } catch (e) {
        setErr(e.response?.data?.message || 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [invoiceId, shopIdParam]);

  // Auto-trigger print dialog when ?auto_print=1
  useEffect(() => {
    if (!loading && invoiceData && autoPrint) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [loading, invoiceData, autoPrint]);

  const handlePrint = () => window.print();

  const handleDownloadPDF = () => {
    // Trigger browser print dialog (user can Save as PDF)
    const originalTitle = document.title;
    const invNum = invoiceData?.details?.invoice_number || invoiceId;
    document.title = `Invoice-${invNum}`;
    window.print();
    document.title = originalTitle;
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f8' }}>
      <div style={{ textAlign: 'center' }}>
        <Loader2 style={{ width: 40, height: 40, animation: 'spin 1s linear infinite', color: '#4f46e5', margin: '0 auto 12px' }} />
        <p style={{ color: '#6b7280', fontSize: 14 }}>Loading invoice…</p>
      </div>
    </div>
  );

  if (err) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f8' }}>
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
      {/* ── Print Stylesheet (injected inline) ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', system-ui, sans-serif; background: #e5e7eb; margin: 0; }

        .invoice-sheet {
          width: 210mm;
          min-height: 297mm;
          background: #ffffff;
          padding: 18mm 16mm;
          margin: 0 auto;
          box-shadow: 0 4px 32px rgba(0,0,0,0.12);
        }

        .print-bar {
          width: 210mm;
          margin: 0 auto 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 0;
        }

        .btn-action {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 20px; border-radius: 8px; border: none;
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
          font-family: inherit;
        }
        .btn-action:hover { opacity: 0.88; transform: translateY(-1px); }
        .btn-action:active { transform: translateY(0); }
        .btn-print   { background: #4f46e5; color: #fff; }
        .btn-download{ background: #059669; color: #fff; }
        .btn-back    { background: #fff; color: #374151; border: 1px solid #d1d5db; }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        @media print {
          body { background: #fff !important; }
          .print-bar { display: none !important; }
          .invoice-sheet {
            width: 100%; min-height: unset;
            margin: 0; padding: 14mm 12mm;
            box-shadow: none;
            page-break-after: always;
          }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      {/* ── Action Bar (hidden on print) ── */}
      <div className="print-bar">
        <button className="btn-action btn-back" onClick={() => window.close()}>
          <ArrowLeft size={15} /> Close
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-action btn-print" onClick={handlePrint}>
            <Printer size={15} /> Print
          </button>
          <button className="btn-action btn-download" onClick={handleDownloadPDF}>
            <Download size={15} /> Download PDF
          </button>
        </div>
      </div>

      {/* ── Invoice Body ── */}
      <div ref={printRef}>
        {type === 'sale' && <SaleInvoice data={details} />}
        {type === 'purchase' && <PurchaseInvoice data={details} />}
        {type === 'installment' && <InstallmentReceipt data={details} />}
        {type === 'return' && <ReturnInvoice data={details} />}
      </div>

      {/* Bottom padding */}
      <div style={{ height: 32 }} className="print-bar" />
    </>
  );
}
