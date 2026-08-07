import { jsPDF } from 'jspdf';
import api from '../api/axios';
import { getCompany } from './reportExport';
import { SOFTWARE_CREDIT } from '../config/branding';

const fmt = (n) => {
  const val = parseFloat(n);
  if (isNaN(val) || Math.abs(val) < 0.01) return '—';
  return `Rs. ${val.toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

async function fetchClearance(employeeId) {
  const { data } = await api.get(`/employees/${employeeId}/clearance-certificate`);
  return data;
}

function buildDoc(data, company = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 14;
  const right = W - margin;
  const { employee, summary, clearance } = data;

  const contact = [company.address, company.phone && `Ph: ${company.phone}`, company.email].filter(Boolean).join('  |  ');
  const lines = 1 + (contact ? 1 : 0) + (company.owner_name ? 1 : 0);
  const bandH = 9 + lines * 5;

  doc.setFillColor(67, 56, 202);
  doc.rect(0, 0, W, bandH, 'F');
  doc.setFillColor(5, 150, 105);
  doc.rect(0, bandH, W, 1.4, 'F');

  if (company.logo_url) {
    try {
      const props = doc.getImageProperties(company.logo_url);
      let lw = 18;
      let lh = (lw * props.height) / props.width;
      const maxLh = Math.min(12, bandH - 4);
      if (lh > maxLh) {
        lh = maxLh;
        lw = (lh * props.width) / props.height;
      }
      doc.addImage(company.logo_url, props.fileType || 'PNG', margin, Math.max(2, (bandH - lh) / 2), lw, lh);
    } catch { /* ignore */ }
  }

  let y = (bandH - lines * 4.6) / 2 + 4.6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(company.name || 'Company', W / 2, y, { align: 'center' });
  y += 4.6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(224, 231, 255);
  if (contact) {
    doc.text(contact, W / 2, y, { align: 'center' });
    y += 4.6;
  }
  if (company.owner_name) {
    doc.text(`Proprietor: ${company.owner_name}`, W / 2, y, { align: 'center' });
  }

  y = bandH + 1.4 + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(49, 46, 129);
  doc.text('EMPLOYEE CLEARANCE CERTIFICATE', W / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`Certificate No: ECC-${employee.id}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, margin, y);
  doc.text(`Issued: ${fmtDate(data.issued_at)}`, right, y, { align: 'right' });
  y += 8;

  const row = (label, value) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 90, 90);
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text(String(value), right, y, { align: 'right' });
    y += 5.5;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);
  doc.text('Employee Details', margin, y);
  y += 6;

  row('Name', employee.name);
  if (employee.designation) row('Designation', employee.designation);
  if (employee.branch) row('Mine', employee.branch);
  if (employee.cnic) row('CNIC', employee.cnic);
  if (employee.phone) row('Phone', employee.phone);
  row('Hire Date', fmtDate(employee.hire_date));
  row('Termination Date', fmtDate(employee.terminated_at));
  row('Basic Salary', fmt(employee.basic_salary));
  if (employee.termination_notes) row('Remarks', employee.termination_notes);

  y += 3;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, right, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Financial Summary', margin, y);
  y += 6;
  row('Total Salary Accrued', fmt(summary.total_salary_accrued));
  row('Total Salary Paid', fmt(summary.total_paid));
  row('Current Payable Balance', fmt(summary.current_payable));
  row('Total Loans Given', fmt(summary.loan_given));
  row('Loan Balance Receivable', fmt(summary.loan_receivable));
  row('Total Advances Given', fmt(summary.advance_given));
  row('Uncleared Advances', fmt(summary.advance_pending));

  y += 3;
  doc.line(margin, y, right, y);
  y += 7;

  doc.text('Clearance Status', margin, y);
  y += 6;

  const statusColor = clearance.fully_cleared ? [4, 120, 87] : [185, 28, 28];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...statusColor);
  doc.text(
    clearance.fully_cleared
      ? 'FULLY CLEARED — No outstanding dues on either side'
      : 'PENDING ITEMS — Outstanding balances listed below',
    margin,
    y,
  );
  y += 7;

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(8.5);
  const colW = [78, 38, 28, 38];
  const headers = ['Item', 'Amount', 'Status', 'Remarks'];
  let x = margin;
  doc.setFillColor(238, 240, 244);
  doc.rect(margin, y - 4, right - margin, 6, 'F');
  headers.forEach((h, i) => {
    doc.text(h, x + 1, y);
    x += colW[i];
  });
  y += 5;

  clearance.items.forEach((item) => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    x = margin;
    const remarks = item.cleared ? 'Settled' : 'Outstanding';
    const status = item.cleared ? 'CLEARED' : 'PENDING';
    [item.label, fmt(item.amount), status, remarks].forEach((cell, i) => {
      const lines = doc.splitTextToSize(String(cell), colW[i] - 2);
      doc.text(lines, x + 1, y);
      x += colW[i];
    });
    y += 7;
  });

  if (clearance.pending_advances?.length > 0) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Pending Advance Details', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    clearance.pending_advances.forEach((adv) => {
      doc.text(
        `• ${fmtDate(adv.date)} — ${fmt(adv.amount)} for ${adv.for_month || '—'}${adv.notes ? ` (${adv.notes})` : ''}`,
        margin + 2,
        y,
      );
      y += 5;
    });
  }

  if (data.payroll_history?.length > 0) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`Payroll Records: ${data.payroll_history.length} month(s) processed`, margin, y);
    y += 5;
  }

  y = Math.max(y + 10, 240);
  const colSig = (right - margin) / 3;
  doc.setDrawColor(80, 80, 80);
  doc.line(margin, y, margin + colSig - 6, y);
  doc.line(margin + colSig, y, margin + 2 * colSig - 6, y);
  doc.line(margin + 2 * colSig + 4, y, right, y);
  y += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  doc.text('HR / Manager', margin, y);
  doc.text('Employee Sign & Thumb', margin + colSig, y);
  doc.text('Authorized Signatory', margin + 2 * colSig + 4, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `${company.name || ''} — Generated: ${new Date().toLocaleString('en-PK')}`,
    W / 2,
    290,
    { align: 'center' },
  );
  doc.setFontSize(6.5);
  doc.text(SOFTWARE_CREDIT, W / 2, 294, { align: 'center' });

  return doc;
}

export async function downloadEmployeeClearance(employeeId, companyOrName) {
  const [data, fetchedCompany] = await Promise.all([
    fetchClearance(employeeId),
    getCompany().catch(() => ({})),
  ]);
  let company = fetchedCompany || {};
  if (companyOrName && typeof companyOrName === 'object') company = companyOrName;
  else if (typeof companyOrName === 'string' && !company.name) company = { name: companyOrName };

  const doc = buildDoc(data, company);
  const safeName = (data.employee?.name || 'employee').replace(/[^a-z0-9]+/gi, '-');
  doc.save(`clearance-${safeName}.pdf`);
}

export function openClearancePrint(employeeId, autoPrint = false) {
  const qs = autoPrint ? '?auto_print=1' : '';
  window.open(`/employees/${employeeId}/clearance${qs}`, '_blank', 'noopener,noreferrer');
}
