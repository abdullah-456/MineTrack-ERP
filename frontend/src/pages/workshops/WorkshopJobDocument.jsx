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

export default function WorkshopJobDocument({ job, showPrintBar = true }) {
  if (!job) return null;

  const shop = job.Shop || {};
  const branch = job.Branch || {};
  const vehicle = job.Vehicle || {};
  const employee = job.Employee || {};
  const items = job.WorkshopJobItems || [];
  const performedBy = employee.name || job.mechanic_name || '—';

  return (
    <>
      <PrintStyles />
      {showPrintBar && <PrintActionBar />}
      <div className="sheet">
        <div className="sheet-body">
          <CompanyHeader company={shop} docTitle="WORKSHOP JOB CARD" />

          <MetaGrid items={[
            { label: 'Job Number', value: job.job_number },
            { label: 'Date In', value: fmtDate(job.date_in) },
            { label: 'Vehicle', value: vehicle.vehicle_number || '—' },
            { label: 'Date Out', value: job.date_out ? fmtDate(job.date_out) : '—' },
            { label: 'Mine / Branch', value: branch.name || '—' },
            { label: 'Status', value: (job.status || '—').replace(/_/g, ' ').toUpperCase() },
            { label: 'Performed By', value: performedBy },
            job.odometer_reading && { label: 'Odometer', value: `${job.odometer_reading} km` },
          ]} />

          {job.work_description && (
            <div style={{ marginBottom: 14, border: `1px solid ${LINE}`, padding: '8px 11px', fontSize: 12, color: INK }}>
              <span style={{ color: INK_SOFT, fontWeight: 700 }}>Work Description: </span>{job.work_description}
            </div>
          )}

          <div style={{ fontSize: 10, fontWeight: 800, color: INK_SOFT, letterSpacing: 1.2, margin: '10px 0 2px' }}>PARTS USED</div>
          <table className="doc" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th style={{ width: '6%' }}>#</th>
                <th>Item</th>
                <th className="num" style={{ width: '14%' }}>Qty</th>
                <th className="num" style={{ width: '16%' }}>Unit Cost</th>
                <th className="num" style={{ width: '16%' }}>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={it.id || idx}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{it.WorkshopItem?.name || '—'}</td>
                  <td className="num">{fmtQty(it.quantity)} {it.WorkshopItem?.unit || ''}</td>
                  <td className="num">{fmtPKR(it.unit_cost)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtPKR(it.line_total)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: INK_SOFT }}>No parts used</td></tr>
              )}
            </tbody>
          </table>

          <table className="doc" style={{ marginTop: 14, width: '46%', marginLeft: 'auto' }}>
            <tbody>
              <tr>
                <td style={{ color: INK_SOFT }}>Labor Cost</td>
                <td className="num">{fmtPKR(job.labor_cost)}</td>
              </tr>
              <tr>
                <td style={{ color: INK_SOFT }}>Parts Cost</td>
                <td className="num">{fmtPKR(job.parts_cost)}</td>
              </tr>
              <tr className="total">
                <td style={{ fontWeight: 800, color: INK }}>Total Cost</td>
                <td className="num" style={{ fontWeight: 800, fontSize: 14 }}>{fmtPKR(job.total_cost)}</td>
              </tr>
            </tbody>
          </table>

          {job.notes && (
            <div style={{ marginTop: 14, border: `1px solid ${LINE}`, padding: '8px 11px', fontSize: 12, color: INK }}>
              <span style={{ color: INK_SOFT, fontWeight: 700 }}>Notes: </span>{job.notes}
            </div>
          )}
        </div>
        <DocClose company={shop} left="Prepared By" center="Mechanic" right="Authorized By" />
      </div>
    </>
  );
}
