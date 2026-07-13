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

const fmt = (n) => `Rs. ${(parseFloat(n) || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

async function fetchSlip(employeeId, txnId) {
  const { data } = await api.get(`/employees/${employeeId}/slips/${txnId}`);
  return data;
}

function buildDoc({ employee, transaction: txn, payroll }, company = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const W = 148, margin = 14, right = W - margin;
  let y = 16;

  // ── Letterhead ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(17, 24, 39);
  doc.text(company.name || 'Company', W / 2, y, { align: 'center' }); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(70, 70, 70);
  const contact = [company.address, company.phone && `Ph: ${company.phone}`, company.email].filter(Boolean).join('  |  ');
  if (contact) { doc.text(contact, W / 2, y, { align: 'center' }); y += 4; }
  if (company.owner_name) { doc.text(`Proprietor: ${company.owner_name}`, W / 2, y, { align: 'center' }); y += 4; }
  y += 1; doc.setDrawColor(17, 24, 39); doc.setLineWidth(0.5); doc.line(margin, y, right, y); y += 6;

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
    row('Month', payroll.month);
    row('Basic Salary', fmt(payroll.basic_salary));
    if (payroll.bonus > 0) row('Bonus', `+${fmt(payroll.bonus)}`);
    if (payroll.deductions > 0) row('Deductions', `-${fmt(payroll.deductions)}`);
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
