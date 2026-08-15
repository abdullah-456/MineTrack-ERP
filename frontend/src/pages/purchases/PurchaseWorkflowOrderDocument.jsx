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

export default function PurchaseWorkflowOrderDocument({ order, showPrintBar = true }) {
  if (!order) return null;

  const shop = order.Shop || {};
  const supplier = order.Supplier || {};
  const branch = order.Branch || {};
  const pr = order.PurchaseRequisition || {};
  // The departmental approval that cleared this PO's requisition — fetched
  // by the backend already (workflowPoIncludes nests it under the
  // requisition), just never surfaced on this document until now.
  const approval = pr.DepartmentalApproval || {};
  const items = order.PurchaseOrderItems || [];
  const grn = (order.GoodsReceiptNotes || [])[0] || order.GoodsReceiptNote || null;
  const invoice = grn?.PurchaseInvoice || null;

  return (
    <>
      <PrintStyles />
      {showPrintBar && <PrintActionBar />}
      <div className="sheet">
        <div className="sheet-body">
          <CompanyHeader company={shop} docTitle="PURCHASE ORDER — WORKFLOW" />

          <MetaGrid items={[
            { label: 'PO Number', value: order.po_number },
            { label: 'Order Date', value: fmtDate(order.order_date) },
            { label: 'PR Number', value: pr.pr_number || '—' },
            { label: 'Approval Number', value: approval.da_number || '—' },
            { label: 'Supplier', value: supplier.company_name || '—' },
            { label: 'Mine / Branch', value: branch.name || '—' },
            { label: 'Status', value: (order.status || '—').replace(/_/g, ' ').toUpperCase() },
            grn && { label: 'GRN Number', value: grn.grn_number },
            invoice && { label: 'Purchase Invoice', value: invoice.invoice_number },
            invoice && { label: 'Payment Status', value: (invoice.status || '—').toUpperCase() },
          ]} />

          <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, margin: '10px 0 2px' }}>ORDERED ITEMS</div>
          <table className="doc" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th style={{ width: '6%' }}>#</th>
                <th>Product</th>
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
                  <td className="num">{fmtQty(it.quantity_ordered)} {it.Product?.unit || ''}</td>
                  <td className="num">{fmtPKR(it.unit_cost)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtPKR(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="doc" style={{ marginTop: 14, width: '42%', marginLeft: 'auto' }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 800, color: INK }}>Total</td>
                <td className="num" style={{ fontWeight: 800, fontSize: 14 }}>{fmtPKR(order.total)}</td>
              </tr>
            </tbody>
          </table>

          {(grn?.grn_document_name || grn?.invoice_document_name) && (
            <div style={{ marginTop: 14, border: `1px solid ${LINE}`, padding: '8px 11px', fontSize: 12 }}>
              {grn.grn_document_name && (
                <div style={{ marginBottom: grn.invoice_document_name ? 8 : 0 }}>
                  <div><span style={{ color: INK_SOFT, fontWeight: 700 }}>GRN Document: </span>{grn.grn_document_name}</div>
                  {grn.grn_document_description && (
                    <div style={{ marginTop: 4, color: INK_SOFT }}><span style={{ fontWeight: 700 }}>Description: </span>{grn.grn_document_description}</div>
                  )}
                </div>
              )}
              {grn.invoice_document_name && (
                <div>
                  <div><span style={{ color: INK_SOFT, fontWeight: 700 }}>Invoice Document: </span>{grn.invoice_document_name}</div>
                  {grn.invoice_document_description && (
                    <div style={{ marginTop: 4, color: INK_SOFT }}><span style={{ fontWeight: 700 }}>Description: </span>{grn.invoice_document_description}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {order.notes && (
            <div style={{ marginTop: 14, border: `1px solid ${LINE}`, padding: '8px 11px', fontSize: 12, color: INK }}>
              <span style={{ color: INK_SOFT, fontWeight: 700 }}>Notes: </span>{order.notes}
            </div>
          )}
        </div>
        <DocClose company={shop} left="Prepared By" center="Received By" right="Authorized By" />
      </div>
    </>
  );
}
