'use strict';

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

/**
 * Net amount the customer paid for a sale line after line + sale-level discounts.
 * Prorates by return quantity.
 */
function computeReturnLineTotal(saleItem, returnQty, sale) {
  const soldQty = parseFloat(saleItem.quantity) || 0;
  const qty = parseFloat(returnQty) || 0;
  if (!(qty > 0) || !(soldQty > 0)) return 0;

  let lineNet = parseFloat(saleItem.line_total);
  if (!Number.isFinite(lineNet)) {
    const unitPrice = parseFloat(saleItem.unit_price) || 0;
    const lineDiscount = parseFloat(saleItem.discount) || 0;
    lineNet = unitPrice * soldQty - lineDiscount;
  }

  const saleSubtotal = parseFloat(sale.subtotal) || 0;
  const saleDiscount = parseFloat(sale.discount) || 0;
  if (saleSubtotal > 0 && saleDiscount > 0) {
    lineNet -= (lineNet / saleSubtotal) * saleDiscount;
  }

  return round2(lineNet * (qty / soldQty));
}

/** Per-unit refund price after discounts (for display). */
function computeRefundUnitPrice(saleItem, sale) {
  const soldQty = parseFloat(saleItem.quantity) || 0;
  if (!(soldQty > 0)) return round2(parseFloat(saleItem.unit_price) || 0);
  return round2(computeReturnLineTotal(saleItem, soldQty, sale) / soldQty);
}

module.exports = { computeReturnLineTotal, computeRefundUnitPrice };
