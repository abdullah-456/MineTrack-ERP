import { Fragment } from 'react';
import {
  PrintStyles, PrintActionBar, CompanyHeader, DocClose,
  INK, INK_SOFT, LINE,
} from '../../components/print/PrintKit';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtPKR = (n) => {
  const val = parseFloat(n);
  if (isNaN(val)) return '—';
  return `Rs. ${val.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtQty = (n) => (parseFloat(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 3 });

function DecisionChip({ decision }) {
  const approved = decision === 'approved';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 4,
      border: `1px solid ${approved ? '#16a34a' : '#dc2626'}`,
      background: approved ? '#dcfce7' : '#fee2e2',
      color: approved ? '#065f46' : '#991b1b',
      fontWeight: 800, fontSize: 11, letterSpacing: 1,
    }}>
      {(decision || '—').toUpperCase()}
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

export default function DepartmentalApprovalDocument({ approval, showPrintBar = true, attachmentUrl = null }) {
  if (!approval) return null;

  const shop = approval.Shop || {};
  const pr = approval.PurchaseRequisition || {};
  const branch = pr.Branch || {};
  const requester = pr.Requester || {};
  const items = pr.PurchaseRequisitionItems || [];

  return (
    <>
      <PrintStyles />
      {showPrintBar && <PrintActionBar />}
      <div className="sheet">
        <div className="sheet-body">
          <CompanyHeader company={shop} docTitle="DEPARTMENTAL APPROVAL" />

          <MetaGrid items={[
            { label: 'Approval No.', value: approval.da_number },
            { label: 'Approval Date', value: fmtDate(approval.approval_date) },
            { label: 'Decision', value: <DecisionChip decision={approval.decision} /> },
            { label: 'PR Number', value: pr.pr_number || '—' },
            { label: 'Requisition Date', value: fmtDate(pr.requisition_date) },
            { label: 'Required By', value: fmtDate(pr.required_date) },
            { label: 'Mine / Branch', value: branch.name || '—' },
            { label: 'Requested By', value: requester.name || '—' },
            { label: 'Department', value: pr.department || '—' },
            approval.Creator && { label: 'Approved By', value: approval.Creator.name },
          ]} />

          {approval.remarks && (
            <div style={{ border: `1px solid ${LINE}`, padding: '9px 11px', marginBottom: 14, fontSize: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, marginBottom: 4 }}>REMARKS</div>
              <div style={{ color: INK }}>{approval.remarks}</div>
            </div>
          )}

          {items.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, margin: '10px 0 2px' }}>LINKED REQUISITION ITEMS</div>
              <table className="doc" style={{ marginTop: 6 }}>
                <thead>
                  <tr>
                    <th style={{ width: '6%' }}>#</th>
                    <th>Item / Description</th>
                    <th className="num" style={{ width: '12%' }}>Qty</th>
                    <th className="num" style={{ width: '16%' }}>Est. Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={it.id || idx}>
                      <td>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{it.description || it.Product?.name || '—'}</td>
                      <td className="num">{fmtQty(it.quantity)} {it.unit || it.Product?.unit || ''}</td>
                      <td className="num" style={{ fontWeight: 700 }}>{fmtPKR(it.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="doc" style={{ marginTop: 10, width: '42%', marginLeft: 'auto' }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 800, color: INK }}>Requisition Total</td>
                    <td className="num" style={{ fontWeight: 800, fontSize: 14 }}>{fmtPKR(pr.total)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {approval.attachment_name && (
            <div style={{ marginTop: 14, border: `1px solid ${LINE}`, padding: '8px 11px', fontSize: 12, color: INK }}>
              <div>
                <span style={{ color: INK_SOFT, fontWeight: 700 }}>Supporting Document: </span>
                {attachmentUrl ? (
                  <a href={attachmentUrl} target="_blank" rel="noopener noreferrer">{approval.attachment_name}</a>
                ) : (
                  approval.attachment_name
                )}
              </div>
              {approval.attachment_description && (
                <div style={{ marginTop: 6, color: INK_SOFT }}>
                  <span style={{ fontWeight: 700 }}>Description: </span>{approval.attachment_description}
                </div>
              )}
            </div>
          )}
        </div>

        <DocClose company={shop} left="Department Head" center="Finance Review" right="Authorized Signatory" />
      </div>
    </>
  );
}

export { fmtDate, fmtPKR, DecisionChip };
