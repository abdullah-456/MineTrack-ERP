import { jsPDF } from 'jspdf';
import api from '../api/axios';
import { getCompany } from './reportExport';
import { formatSalaryMonth } from './attendanceStatus';
import { buildClearanceWalkthrough } from './clearanceWalkthrough';
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
  const { employee, clearance } = data;
  // Same computation the print page uses — see clearanceWalkthrough.js for
  // why it's shared rather than recalculated here. Every figure that used to
  // come straight off `summary` now flows through this instead.
  const w = buildClearanceWalkthrough(data);

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

  // Same page-break rule the clearance-items loop already used ad hoc
  // (if (y > 250) addPage()), generalized so every section below can rely on
  // it — the walkthrough sections added below are long enough on an employee
  // with a full payroll history that they'd otherwise run off the page.
  const ensureSpace = (need) => {
    if (y + need > 270) {
      doc.addPage();
      y = 20;
    }
  };

  const row = (label, value, { total = false } = {}) => {
    ensureSpace(6);
    if (total) {
      doc.setFillColor(238, 240, 244);
      doc.rect(margin - 1, y - 4, right - margin + 2, 6.5, 'F');
    }
    doc.setFont('helvetica', total ? 'bold' : 'normal');
    doc.setTextColor(total ? 17 : 90, total ? 24 : 90, total ? 39 : 90);
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text(String(value), right, y, { align: 'right' });
    y += 5.5;
  };

  // row() takes an already-formatted string; this is for the walkthrough
  // sections below, which pass a raw number and want the zero-check done on
  // that NUMBER (not on the formatted "Rs. 1,000" string, which parseFloat
  // can't meaningfully test) before formatting and drawing it.
  const amountRow = (label, val, { total = false, hideIfZero = false } = {}) => {
    if (hideIfZero && !(Math.abs(parseFloat(val)) > 0.005)) return;
    row(label, fmt(val), { total });
  };

  const sectionTitle = (text) => {
    ensureSpace(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(text, margin, y);
    y += 6;
  };

  sectionTitle('Employee Details');
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

  // Every total below is walked through step by step instead of shown as a
  // bare figure — Total Salary Accrued and Total Salary Paid used to sit
  // right next to each other with nothing explaining the gap between them.
  // Each "cutting" (tax, absence, advance recovery) gets its own line, in the
  // order it's actually subtracted, so a reader gets from gross to net
  // without doing arithmetic themselves.
  sectionTitle('Salary Calculation');
  amountRow('Basic Salary / Wage Pay', w.salary.basic);
  amountRow('+ Allowances', w.salary.allowances, { hideIfZero: true });
  amountRow('+ Temporary Allowance', w.salary.tempAllowance, { hideIfZero: true });
  amountRow('+ Bonus', w.salary.bonus, { hideIfZero: true });
  amountRow('+ Commission', w.salary.commission, { hideIfZero: true });
  amountRow('+ Overtime', w.salary.overtime, { hideIfZero: true });
  amountRow('= Total Salary Accrued (Gross)', w.salary.grossAccrued, { total: true });
  amountRow('- Tax Deductions', w.salary.taxDeduction, { hideIfZero: true });
  amountRow('- Attendance / Absence Deductions', w.salary.attendanceDeduction, { hideIfZero: true });
  amountRow('- Advance Deductions (Recovered via Salary)', w.salary.advanceDeduction, { hideIfZero: true });
  amountRow('= Net Salary Paid via Monthly Payroll', w.salary.netPaidViaPayroll, { total: true });
  if (w.settlement.hasActivity) {
    amountRow('+ Final Payment to Employee (at Termination)', w.settlement.paymentToEmployee, { hideIfZero: true });
    amountRow('- Amount Recovered from Employee (at Termination)', w.settlement.recoveredFromEmployee, { hideIfZero: true });
    amountRow('= Total Salary Paid (All-In)', w.totalPaidAllIn, { total: true });
  }
  y += 3;

  if (w.loans.given > 0 || w.loans.repaid > 0) {
    sectionTitle('Loans');
    amountRow('Total Loans Given', w.loans.given);
    amountRow('- Loans Repaid', w.loans.repaid, { hideIfZero: true });
    amountRow('= Outstanding Loan Balance (Receivable)', w.loans.outstanding, { total: true });
    y += 3;
  }

  if (w.advances.given > 0) {
    sectionTitle('Advances');
    amountRow('Total Advances Given', w.advances.given);
    amountRow('- Advances Cleared', w.advances.cleared, { hideIfZero: true });
    amountRow('= Uncleared Advances', w.advances.outstanding, { total: true });
    y += 3;
  }

  ensureSpace(20);
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, right, y);
  y += 7;

  sectionTitle('Clearance Status');

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
        `• ${fmtDate(adv.date)} — ${fmt(adv.amount)} for ${formatSalaryMonth(adv.for_month) || '—'}${adv.notes ? ` (${adv.notes})` : ''}`,
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
