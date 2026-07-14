import { jsPDF } from 'jspdf';
import api from '../api/axios';
import { getCompany } from './reportExport';
import { amountInWords } from './amountInWords';

// Downloadable employee transaction/pay slip — same letterhead & print-safe
// styling as the on-screen slip and every other document (dark ink, company
// details on top, amount in words, signature lines). Vector text stays crisp.

const TITLES = {
  advance_given: 'Advance Slip',
  loan_given: 'Loan Slip',
  loan_repayment: 'Loan Payment Receipt',
  payment_made: 'Pay Slip',
};

const fmt = (n) => {
  const val = parseFloat(n);
  if (isNaN(val) || val === 0) return '—';
  return `Rs. ${val.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
};

async function fetchSlip(employeeId, txnId) {
  const { data } = await api.get(`/employees/${employeeId}/slips/${txnId}`);
  return data;
}

function buildDoc({ employee, transaction: txn, payroll }, company = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const W = 148, margin = 14, right = W - margin;

  // ── Letterhead ── solid brand-colour band (indigo, emerald accent stripe),
  // reversed light-on-colour text so it stays readable against the fill.
  const contact = [company.address, company.phone && `Ph: ${company.phone}`, company.email].filter(Boolean).join('  |  ');
  const lines = 1 + (contact ? 1 : 0) + (company.owner_name ? 1 : 0);
  const bandH = 9 + lines * 5;

  doc.setFillColor(67, 56, 202); doc.rect(0, 0, W, bandH, 'F');
  doc.setFillColor(5, 150, 105); doc.rect(0, bandH, W, 1.4, 'F');

  if (company.logo_url) {
    try {
      const props = doc.getImageProperties(company.logo_url);
      let lw = 18, lh = (lw * props.height) / props.width;
      const maxLh = Math.min(12, bandH - 4);
      if (lh > maxLh) { lh = maxLh; lw = (lh * props.width) / props.height; }
      doc.addImage(company.logo_url, props.fileType || 'PNG', margin, Math.max(2, (bandH - lh) / 2), lw, lh);
    } catch { /* invalid logo — ignore */ }
  }

  let y = (bandH - lines * 4.6) / 2 + 4.6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(255, 255, 255);
  doc.text(company.name || 'Company', W / 2, y, { align: 'center' }); y += 4.6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(224, 231, 255);
  if (contact) { doc.text(contact, W / 2, y, { align: 'center' }); y += 4.6; }
  if (company.owner_name) { doc.text(`Proprietor: ${company.owner_name}`, W / 2, y, { align: 'center' }); y += 4.6; }

  y = bandH + 1.4 + 8;
  const title = payroll ? TITLES.payment_made : (TITLES[txn.type] || 'Transaction Slip');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(17, 24, 39);
  doc.text(title.toUpperCase(), W / 2, y, { align: 'center' }); y += 8;

  // ── Detail rows ──
  doc.setFontSize(10);
  const row = (label, value) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 90, 90);
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(17, 24, 39);
    doc.text(String(value), right, y, { align: 'right' });
    y += 6;
  };
  row('Employee', employee.name);
  if (employee.designation) row('Designation', employee.designation);
  row('Date', new Date(txn.date).toLocaleDateString('en-GB'));
  if (txn.method) row('Method', String(txn.method).toUpperCase());
  if (txn.for_month) row('For Salary Month', txn.for_month);
  if (txn.notes) row('Notes', txn.notes);

  y += 2; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3); doc.line(margin, y, right, y); y += 7;

  let headline;
  if (payroll) {
    const advanceDeduction = payroll.advance_deduction || 0;
    const manualDeductions = Math.max(0, (payroll.deductions || 0) - advanceDeduction);
    row('Month', payroll.month);
    row('Basic Salary', fmt(payroll.basic_salary));
    row('Advance', advanceDeduction > 0 ? `-${fmt(advanceDeduction)}` : '-');
    row('Bonus', payroll.bonus > 0 ? `+${fmt(payroll.bonus)}` : '-');
    row('Deductions', manualDeductions > 0 ? `-${fmt(manualDeductions)}` : '-');
    row('Others', '-');
    y += 1; doc.setDrawColor(17, 24, 39); doc.setLineWidth(0.5); doc.line(margin, y, right, y); y += 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(17, 24, 39);
    doc.text('Net Pay', margin, y);
    doc.text(fmt(payroll.net_pay), right, y, { align: 'right' }); y += 8;
    headline = payroll.net_pay;
  } else {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(17, 24, 39);
    doc.text('Amount', margin, y);
    doc.text(fmt(txn.amount), right, y, { align: 'right' }); y += 8;
    headline = txn.amount;
  }

  // ── Amount in words ──
  doc.setDrawColor(17, 24, 39); doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(40, 40, 40);
  const words = amountInWords(headline);
  const wLines = doc.splitTextToSize(`Amount in words: ${words}`, right - margin - 4);
  const boxH = wLines.length * 4 + 4;
  doc.rect(margin, y, right - margin, boxH);
  doc.text(wLines, margin + 2, y + 5); y += boxH + 12;

  // ── Signatures ──
  const colW = (right - margin) / 2;
  doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.3);
  doc.line(margin, y, margin + colW - 8, y);
  doc.line(margin + colW + 4, y, right, y);
  y += 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(40, 40, 40);
  doc.text('Prepared By', margin, y);
  doc.text('Received Sign & Thumb', margin + colW + 4, y);

  // ── Footer ──
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
  doc.text(`${company.name || ''} — Generated: ${new Date().toLocaleString('en-PK')}`, W / 2, 200, { align: 'center' });

  return doc;
}

// Fetches the slip + company profile, builds a professional PDF, downloads it.
// `companyOrName` is optional — an object is used directly; otherwise the
// company profile is fetched. A bare string is treated as the company name.
export async function downloadEmployeeSlip(employeeId, txnId, companyOrName) {
  const [data, fetchedCompany] = await Promise.all([
    fetchSlip(employeeId, txnId),
    getCompany().catch(() => ({})),
  ]);
  let company = fetchedCompany || {};
  if (companyOrName && typeof companyOrName === 'object') company = companyOrName;
  else if (typeof companyOrName === 'string' && !company.name) company = { name: companyOrName };

  const doc = buildDoc(data, company);
  const safeName = (data.employee?.name || 'employee').replace(/[^a-z0-9]+/gi, '-');
  doc.save(`slip-${safeName}-${txnId}.pdf`);
}
