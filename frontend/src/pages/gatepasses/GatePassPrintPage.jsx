import { useState, useEffect, Fragment } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/axios';
import {
  PrintStyles, PrintActionBar, CompanyHeader, DocFooter,
  INK, INK_SOFT, LINE
} from '../../components/print/PrintKit';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const fmtQty = (n) => (parseFloat(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 3 });

function StatusChip({ status }) {
  const isCancelled = status?.toLowerCase() === 'cancelled';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 4,
      border: `1px solid ${isCancelled ? '#dc2626' : '#16a34a'}`,
      background: isCancelled ? '#fee2e2' : '#dcfce7',
      color: isCancelled ? '#991b1b' : '#065f46',
      fontWeight: 800, fontSize: 11, letterSpacing: 1,
    }}>
      {status?.toUpperCase() || 'ACTIVE'}
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

function PartyBox({ heading, name, lines = [], right }) {
  return (
    <div style={{ display: 'flex', gap: 14, margin: '0 0 14px' }}>
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

function ItemsTable({ items }) {
  return (
    <table className="doc" style={{ marginTop: 6 }}>
      <thead>
        <tr>
          <th style={{ width: '6%' }}>#</th>
          <th>Product / Item Description</th>
          <th style={{ width: '18%' }}>SKU / Code</th>
          <th className="num" style={{ width: '16%' }}>Quantity</th>
          <th style={{ width: '12%' }}>Unit</th>
          <th style={{ width: '22%' }}>Notes</th>
        </tr>
      </thead>
      <tbody>
        {(!items || items.length === 0) && (
          <tr><td colSpan={6} style={{ textAlign: 'center', color: INK_SOFT }}>No items listed</td></tr>
        )}
        {items && items.map((it, idx) => (
          <tr key={idx}>
            <td>{idx + 1}</td>
            <td style={{ fontWeight: 600 }}>{it.Product?.name || it.product_name || '—'}</td>
            <td style={{ color: INK_SOFT, fontFamily: 'monospace' }}>{it.Product?.sku || '—'}</td>
            <td className="num" style={{ fontWeight: 800 }}>{fmtQty(it.quantity)}</td>
            <td style={{ textTransform: 'lowercase' }}>{it.unit || 'kg'}</td>
            <td style={{ color: INK_SOFT, fontSize: 11 }}>{it.notes || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GatePassSignatureRow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 45 }}>
      <div style={{ width: '30%' }}>
        <div style={{ borderTop: `1px solid ${INK}`, marginBottom: 5 }} />
        <div style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Prepared / Issued By</div>
      </div>
      <div style={{ width: '30%', textAlign: 'center' }}>
        <div style={{ borderTop: `1px solid ${INK}`, marginBottom: 5 }} />
        <div style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Gate Security Sign & Stamp</div>
      </div>
      <div style={{ width: '30%', textAlign: 'right' }}>
        <div style={{ borderTop: `1px solid ${INK}`, marginBottom: 5 }} />
        <div style={{ fontSize: 11.5, fontWeight: 700, color: INK }}>Driver / Receiver Sign</div>
      </div>
    </div>
  );
}

const typeLabels = {
  sale_dispatch: 'SALE DISPATCH',
  pre_sale: 'PRE-SALE DISPATCH',
  transfer: 'STOCK TRANSFER',
  return: 'RETURN / SAMPLE',
  other: 'OTHER DISPATCH'
};

export default function GatePassPrintPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const shopIdParam = searchParams.get('shop_id');
  const autoPrint = searchParams.get('auto_print') === '1';

  const [loading, setLoading] = useState(true);
  const [gatePass, setGatePass] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const params = shopIdParam ? { shop_id: shopIdParam } : {};
        const { data } = await api.get(`/gatepasses/${id}`, { params });
        setGatePass(data.gate_pass);
      } catch (e) {
        setErr(e.response?.data?.message || 'Failed to load gatepass clearance slip');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, shopIdParam]);

  useEffect(() => {
    if (!loading && gatePass && autoPrint) {
      const timer = setTimeout(() => window.print(), 600);
      return () => clearTimeout(timer);
    }
  }, [loading, gatePass, autoPrint]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <div style={{ textAlign: 'center' }}>
        <Loader2 style={{ width: 40, height: 40, animation: 'spin 1s linear infinite', color: '#4f46e5', margin: '0 auto 12px' }} />
        <p style={{ color: INK_SOFT, fontSize: 14 }}>Loading gatepass clearance slip…</p>
      </div>
    </div>
  );

  if (err || !gatePass) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e5e7eb' }}>
      <div style={{ textAlign: 'center', padding: 32, background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <AlertCircle style={{ width: 48, height: 48, color: '#dc2626', margin: '0 auto 12px' }} />
        <p style={{ color: '#dc2626', fontWeight: 700 }}>{err || 'Gatepass not found'}</p>
        <button onClick={() => window.close()} style={{ marginTop: 16, padding: '8px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Close Tab
        </button>
      </div>
    </div>
  );

  const shop = gatePass.Shop || {};
  const customer = gatePass.Customer || {};
  const branch = gatePass.Branch || {};
  const sale = gatePass.Sale || {};
  const items = gatePass.GatePassItems || [];

  return (
    <>
      <PrintStyles />
      <PrintActionBar />
      <div className="sheet">
        <CompanyHeader company={shop} docTitle="GATEPASS / CLEARANCE SLIP" />
        
        <MetaGrid items={[
          { label: 'Gatepass #', value: gatePass.gate_pass_number },
          { label: 'Date & Time', value: fmtDateTime(gatePass.gate_pass_date) },
          { label: 'Dispatch Type', value: typeLabels[gatePass.type] || (gatePass.type || '').toUpperCase() },
          { label: 'Status', value: <StatusChip status={gatePass.status} /> },
          { label: 'Branch', value: branch.name || 'Main Branch' },
          sale.invoice_number && { label: 'Sale Invoice #', value: sale.invoice_number },
          gatePass.Issuer && { label: 'Issued By', value: gatePass.Issuer.name },
        ]} />

        <PartyBox
          heading="RECEIVER / CUSTOMER"
          name={gatePass.customer_name || customer.name || 'General Receiver'}
          lines={[
            (gatePass.customer_phone || customer.phone) && `Ph: ${gatePass.customer_phone || customer.phone}`,
            customer.cnic && `CNIC: ${customer.cnic}`,
            customer.address
          ]}
          right={(
            <>
              <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, marginBottom: 4 }}>VEHICLE & DRIVER DETAILS</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>Vehicle #: {gatePass.vehicle_no || 'N/A'}</div>
              <div style={{ fontSize: 11.5, color: INK_SOFT, marginTop: 2 }}>Driver Name: {gatePass.driver_name || 'N/A'}</div>
              {gatePass.driver_phone && <div style={{ fontSize: 11.5, color: INK_SOFT, marginTop: 1 }}>Driver Phone: {gatePass.driver_phone}</div>}
            </>
          )}
        />

        <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, margin: '10px 0 2px' }}>DISPATCHED ITEMS LIST</div>
        <ItemsTable items={items} />

        {gatePass.remarks && (
          <div style={{ marginTop: 14, border: `1px solid ${LINE}`, padding: '8px 11px', fontSize: 12, color: INK }}>
            <span style={{ color: INK_SOFT, fontWeight: 700 }}>Remarks / Instructions: </span>{gatePass.remarks}
          </div>
        )}

        <GatePassSignatureRow />
        <DocFooter company={shop} />
      </div>
    </>
  );
}
