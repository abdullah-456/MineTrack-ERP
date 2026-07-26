import { useState, useEffect, Fragment } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/axios';
import {
  PrintStyles, PrintActionBar, CompanyHeader, AmountWords, SignatureRow, DocFooter,
  INK, INK_SOFT, LINE,
} from '../../components/print/PrintKit';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtPKR = (n) => {
  const val = parseFloat(n);
  if (isNaN(val)) return '—';
  return `Rs. ${val.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtQty = (n) => (parseFloat(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 3 });

function StatusChip({ status }) {
  const map = {
    draft: { bg: '#fef9c3', color: '#854d0e', bd: '#ca8a04' },
    sent: { bg: '#dbeafe', color: '#1e40af', bd: '#2563eb' },
    partially_received: { bg: '#ede9fe', color: '#5b21b6', bd: '#7c3aed' },
    received: { bg: '#dcfce7', color: '#065f46', bd: '#16a34a' },
    cancelled: { bg: '#f3f4f6', color: '#374151', bd: '#9ca3af' },
  };
  const s = map[status?.toLowerCase()] || { bg: '#f3f4f6', color: '#374151', bd: '#9ca3af' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 4, border: `1px solid ${s.bd}`,
      background: s.bg, color: s.color, fontWeight: 800, fontSize: 11, letterSpacing: 1,
    }}>
      {(status || '—').replace(/_/g, ' ').toUpperCase()}
    </span>
  );
}

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
                <td style={{ color: INK_SOFT, width: '18%', whiteSpace: 'nowrap' }}>{it.label}</td>
                <td style={{ fontWeight: 700, width: '32%' }}>{it.value}</td>
              </Fragment>
            ))}
            {pair.length === 1 && <><td /><td /></>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PartyBox({ heading, name, lines = [] }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, padding: '9px 11px', marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, marginBottom: 4 }}>{heading}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{name}</div>
      {lines.filter(Boolean).map((l, i) => (
        <div key={i} style={{ fontSize: 11.5, color: INK_SOFT, marginTop: 1 }}>{l}</div>
      ))}
    </div>
  );
}

export default function PurchaseOrderPrintPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const shopIdParam = searchParams.get('shop_id');
  const autoPrint = searchParams.get('auto_print') === '1';

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const params = shopIdParam ? { shop_id: shopIdParam } : {};
        const { data } = await api.get(`/purchase-orders/${id}`, { params });
        setOrder(data.purchase_order);
      } catch (e) {
        setErr(e.response?.data?.message || 'Failed to load purchase order');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, shopIdParam]);

  useEffect(() => {
    if (!loading && order && autoPrint) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [loading, order, autoPrint]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <div style={{ textAlign: 'center' }}>
        <Loader2 style={{ width: 40, height: 40, animation: 'spin 1s linear infinite', color: '#4f46e5', margin: '0 auto 12px' }} />
        <p style={{ color: INK_SOFT, fontSize: 14 }}>Loading purchase order…</p>
      </div>
    </div>
  );

  if (err || !order) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <div style={{ textAlign: 'center', padding: 32, background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <AlertCircle style={{ width: 48, height: 48, color: '#dc2626', margin: '0 auto 12px' }} />
        <p style={{ color: '#dc2626', fontWeight: 700 }}>{err || 'Purchase order not found'}</p>
        <button type="button" onClick={() => window.close()} style={{ marginTop: 16, padding: '8px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Close Tab
        </button>
      </div>
    </div>
  );

  const shop = order.Shop || {};
  const supplier = order.Supplier || {};
  const branch = order.Branch || {};
  const items = order.PurchaseOrderItems || [];

  return (
    <>
      <PrintStyles />
      <PrintActionBar />
      <div className="sheet">
        <CompanyHeader company={shop} docTitle="PURCHASE ORDER" />

        <MetaGrid items={[
          { label: 'PO Number', value: order.po_number },
          { label: 'Order Date', value: fmtDate(order.order_date) },
          { label: 'Expected Date', value: fmtDate(order.expected_date) },
          { label: 'Status', value: <StatusChip status={order.status} /> },
          { label: 'Branch', value: branch.name || '—' },
          order.Creator && { label: 'Prepared By', value: order.Creator.name },
        ]} />

        <PartyBox
          heading="SUPPLIER / VENDOR"
          name={supplier.company_name || '—'}
          lines={[
            supplier.supplier_code && `Code: ${supplier.supplier_code}`,
            supplier.phone && `Ph: ${supplier.phone}`,
            supplier.address,
          ]}
        />

        <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, margin: '10px 0 2px' }}>ORDERED ITEMS</div>
        <table className="doc" style={{ marginTop: 6 }}>
          <thead>
            <tr>
              <th style={{ width: '6%' }}>#</th>
              <th>Product / Description</th>
              <th style={{ width: '14%' }}>SKU</th>
              <th className="num" style={{ width: '12%' }}>Qty</th>
              <th className="num" style={{ width: '14%' }}>Unit Cost</th>
              <th className="num" style={{ width: '16%' }}>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id || idx}>
                <td>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>{it.Product?.name || '—'}</td>
                <td style={{ color: INK_SOFT, fontFamily: 'monospace' }}>{it.Product?.sku || '—'}</td>
                <td className="num">{fmtQty(it.quantity_ordered)} {it.Product?.unit || 'kg'}</td>
                <td className="num">{fmtPKR(it.unit_cost)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmtPKR(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="doc" style={{ marginTop: 14, width: '42%', marginLeft: 'auto' }}>
          <tbody>
            <tr><td style={{ color: INK_SOFT }}>Subtotal</td><td className="num" style={{ fontWeight: 700 }}>{fmtPKR(order.subtotal)}</td></tr>
            {parseFloat(order.discount) > 0 && (
              <tr><td style={{ color: INK_SOFT }}>Discount</td><td className="num">− {fmtPKR(order.discount)}</td></tr>
            )}
            {parseFloat(order.tax) > 0 && (
              <tr><td style={{ color: INK_SOFT }}>Tax</td><td className="num">{fmtPKR(order.tax)}</td></tr>
            )}
            <tr>
              <td style={{ fontWeight: 800, color: INK }}>Total</td>
              <td className="num" style={{ fontWeight: 800, fontSize: 14 }}>{fmtPKR(order.total)}</td>
            </tr>
          </tbody>
        </table>

        <AmountWords amount={order.total} />

        {order.notes && (
          <div style={{ marginTop: 14, border: `1px solid ${LINE}`, padding: '8px 11px', fontSize: 12, color: INK }}>
            <span style={{ color: INK_SOFT, fontWeight: 700 }}>Notes: </span>{order.notes}
          </div>
        )}

        <SignatureRow left="Authorized By" right="Supplier Acknowledgement" />
        <DocFooter company={shop} />
      </div>
    </>
  );
}
