// Converts a number to words using the South-Asian (lakh / crore) system,
// e.g. 300000 → "Rupees Three Lakh Only", matching the voucher stationery.

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? ` ${ONES[o]}` : '');
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (h) out += `${ONES[h]} Hundred`;
  if (rest) out += `${h ? ' ' : ''}${twoDigits(rest)}`;
  return out;
}

// Integer → words in the Indian numbering system (crore, lakh, thousand).
export function numberToWords(num) {
  num = Math.floor(Math.abs(num));
  if (num === 0) return 'Zero';

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = num % 1000;

  const parts = [];
  if (crore) parts.push(`${numberToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(' ').trim();
}

// Full currency phrase: "Rupees Three Lakh Only" (+ paisa when present).
export function amountInWords(amount, currency = 'Rupees') {
  const n = parseFloat(amount) || 0;
  const rupees = Math.floor(Math.abs(n));
  const paisa = Math.round((Math.abs(n) - rupees) * 100);
  const sign = n < 0 ? 'Minus ' : '';

  let words = `${sign}${currency} ${numberToWords(rupees)}`;
  if (paisa > 0) words += ` and ${twoDigits(paisa)} Paisa`;
  return `${words} Only`;
}

export default amountInWords;
