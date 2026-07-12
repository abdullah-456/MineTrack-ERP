import { jsPDF } from 'jspdf';
import api from '../api/axios';

// jsPDF's built-in fonts can't render Urdu/Arabic script (no glyph shaping),
// so the downloaded PDF is always laid out in English regardless of the
// active UI language — the Print button (real HTML + browser print-to-PDF)
// is the correct path when a fully Urdu document is needed.
const TITLES = {
  advance_given: 'Advance Slip',
  loan_given: 'Loan Slip',
  loan_repayment: 'Loan Payment Receipt',
  payment_made: 'Pay Slip',
};

const fmt = (n) => `Rs. ${(parseFloat(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

async function fetchSlip(employeeId, txnId) {
  const { data } = await api.get(`/employees/${employeeId}/slips/${txnId}`);
  return data;
}

function buildDoc({ employee, transaction: txn, payroll }, shopName) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const marginX = 14;
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(79, 70, 229); // indigo, matches the print-page letterhead
  doc.text(shopName || 'ESMS', marginX, y);

  y += 7;
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  const title = payroll ? TITLES.payment_made : (TITLES[txn.type] || 'Transaction Slip');
  doc.text(title, marginX, y);

  y += 3;
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, 148 - marginX, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81);

  const row = (label, value) => {
    doc.setTextColor(107, 114, 128);
    doc.text(label, marginX, y);
    doc.setTextColor(17, 24, 39);
    doc.text(String(value), 148 - marginX, y, { align: 'right' });
    y += 6;
  };

  row('Employee', employee.name);
  if (employee.designation) row('Designation', employee.designation);
  row('Date', new Date(txn.date).toLocaleDateString('en-PK'));
  if (txn.method) row('Method', txn.method.toUpperCase());
  if (txn.for_month) row('For Salary Month', txn.for_month);
  if (txn.notes) row('Notes', txn.notes);

  y += 4;
  doc.setDrawColor(229, 231, 235);
  doc.line(marginX, y, 148 - marginX, y);
  y += 8;

  if (payroll) {
    row('Month', payroll.month);
    row('Basic Salary', fmt(payroll.basic_salary));
    if (payroll.bonus > 0) row('Bonus', `+${fmt(payroll.bonus)}`);
    if (payroll.deductions > 0) row('Deductions', `-${fmt(payroll.deductions)}`);
    y += 2;
    doc.setDrawColor(55, 65, 81);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, 148 - marginX, y);
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    row('Net Pay', fmt(payroll.net_pay));
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text('AMOUNT', 74.25, y, { align: 'center' });
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    const incoming = txn.type === 'loan_repayment';
    doc.setTextColor(...(incoming ? [5, 150, 105] : [79, 70, 229]));
    doc.text(`${incoming ? '+' : ''}${fmt(txn.amount)}`, 74.25, y, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `${shopName || 'ESMS'} — Generated: ${new Date().toLocaleString('en-PK')}`,
    74.25, 195, { align: 'center' },
  );

  return doc;
}

// Fetches the slip, builds a PDF replicating it, and triggers a browser
// download — a genuine file save, distinct from the Print action (which
// opens the print dialog on the full bilingual HTML page).
export async function downloadEmployeeSlip(employeeId, txnId, shopName) {
  const data = await fetchSlip(employeeId, txnId);
  const doc = buildDoc(data, shopName);
  const safeName = (data.employee?.name || 'employee').replace(/[^a-z0-9]+/gi, '-');
  doc.save(`slip-${safeName}-${txnId}.pdf`);
}
