import { Fragment } from 'react';
import {
  PrintStyles, PrintActionBar, CompanyHeader, AmountWords, DocClose,
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
    submitted: { bg: '#dbeafe', color: '#1e40af', bd: '#2563eb' },
    approved: { bg: '#dcfce7', color: '#065f46', bd: '#16a34a' },
    rejected: { bg: '#fee2e2', color: '#991b1b', bd: '#dc2626' },
    closed: { bg: '#f3f4f6', color: '#374151', bd: '#9ca3af' },
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

function PriorityChip({ priority }) {
  const urgent = priority === 'urgent';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 4,
      border: `1px solid ${urgent ? '#dc2626' : '#9ca3af'}`,
      background: urgent ? '#fee2e2' : '#f3f4f6',
      color: urgent ? '#991b1b' : '#374151',
      fontWeight: 800, fontSize: 11, letterSpacing: 1,
    }}>
      {(priority || 'normal').toUpperCase()}
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

export default function PurchaseRequisitionDocument({ requisition, showPrintBar = true }) {
  if (!requisition) return null;

  const shop = requisition.Shop || {};
  const branch = requisition.Branch || {};
  const requester = requisition.Requester || {};
  const items = requisition.PurchaseRequisitionItems || [];

  return (
    <>
      <PrintStyles />
      {showPrintBar && <PrintActionBar />}
      <div className="sheet">
        <div className="sheet-body">
          <CompanyHeader company={shop} docTitle="PURCHASE REQUISITION" />

          <MetaGrid items={[
            { label: 'PR Number', value: requisition.pr_number },
            { label: 'Requisition Date', value: fmtDate(requisition.requisition_date) },
            { label: 'Required By', value: fmtDate(requisition.required_date) },
            { label: 'Status', value: <StatusChip status={requisition.status} /> },
            { label: 'Priority', value: <PriorityChip priority={requisition.priority} /> },
            { label: 'Mine / Branch', value: branch.name || '—' },
            { label: 'Department', value: requisition.department || requester.Designation?.name || requester.designation || '—' },
            { label: 'Requested By', value: requester.name || '—' },
            requisition.Creator && { label: 'Prepared By', value: requisition.Creator.name },
          ]} />

          {requisition.purpose && (
            <div style={{ border: `1px solid ${LINE}`, padding: '9px 11px', marginBottom: 14, fontSize: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, marginBottom: 4 }}>PURPOSE / JUSTIFICATION</div>
              <div style={{ color: INK }}>{requisition.purpose}</div>
            </div>
          )}

          <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, margin: '10px 0 2px' }}>REQUESTED ITEMS</div>
          <table className="doc" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th style={{ width: '6%' }}>#</th>
                <th>Item / Description</th>
                <th style={{ width: '14%' }}>SKU</th>
                <th className="num" style={{ width: '12%' }}>Qty</th>
                <th className="num" style={{ width: '14%' }}>Est. Unit Cost</th>
                <th className="num" style={{ width: '16%' }}>Est. Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.id || idx}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{it.description || it.Product?.name || '—'}</td>
                  <td style={{ color: INK_SOFT, fontFamily: 'monospace' }}>{it.Product?.sku || '—'}</td>
                  <td className="num">{fmtQty(it.quantity)} {it.unit || it.Product?.unit || ''}</td>
                  <td className="num">{fmtPKR(it.estimated_unit_cost)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtPKR(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="doc" style={{ marginTop: 14, width: '42%', marginLeft: 'auto' }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 800, color: INK }}>Estimated Total</td>
                <td className="num" style={{ fontWeight: 800, fontSize: 14 }}>{fmtPKR(requisition.total)}</td>
              </tr>
            </tbody>
          </table>

          <AmountWords amount={requisition.total} />

          {requisition.notes && (
            <div style={{ marginTop: 14, border: `1px solid ${LINE}`, padding: '8px 11px', fontSize: 12, color: INK }}>
              <span style={{ color: INK_SOFT, fontWeight: 700 }}>Notes: </span>{requisition.notes}
            </div>
          )}
        </div>

        <DocClose company={shop} left="Requested By" center="Department Head" right="Approved By" />
      </div>
    </>
  );
}

export { fmtDate, fmtPKR, fmtQty, StatusChip };
