'use strict';

const db = require('../models');
const { Op } = require('sequelize');

async function idsFor(Model, where, transaction) {
  const rows = await Model.findAll({ where, attributes: ['id'], raw: true, transaction });
  return rows.map(r => r.id);
}

async function destroyWhere(Model, where, transaction) {
  await Model.destroy({ where, transaction });
}

// Permanently removes a shop and all data scoped to it (SuperAdmin only).
async function destroyShopCompletely(shopId, transaction) {
  const branchIds = await idsFor(db.Branch, { shop_id: shopId }, transaction);
  const productIds = await idsFor(db.Product, { shop_id: shopId }, transaction);
  const saleIds = await idsFor(db.Sale, { shop_id: shopId }, transaction);
  const employeeIds = await idsFor(db.Employee, { shop_id: shopId }, transaction);
  const customerIds = await idsFor(db.Customer, { shop_id: shopId }, transaction);
  const supplierIds = await idsFor(db.Supplier, { shop_id: shopId }, transaction);
  const voucherIds = await idsFor(db.Voucher, { shop_id: shopId }, transaction);
  const gatePassIds = await idsFor(db.GatePass, { shop_id: shopId }, transaction);
  const returnIds = await idsFor(db.SaleReturn, { shop_id: shopId }, transaction);
  const poIds = await idsFor(db.PurchaseOrder, { shop_id: shopId }, transaction);
  const grnIds = await idsFor(db.GoodsReceiptNote, { shop_id: shopId }, transaction);

  const loanIds = employeeIds.length
    ? await idsFor(db.EmployeeLoan, { employee_id: { [Op.in]: employeeIds } }, transaction)
    : [];

  const transferIds = branchIds.length
    ? (await db.StockTransfer.findAll({
        where: {
          [Op.or]: [
            { from_branch_id: { [Op.in]: branchIds } },
            { to_branch_id: { [Op.in]: branchIds } },
          ],
        },
        attributes: ['id'],
        raw: true,
        transaction,
      })).map(r => r.id)
    : [];

  if (voucherIds.length) {
    await destroyWhere(db.GeneralLedger, { voucher_id: { [Op.in]: voucherIds } }, transaction);
    await destroyWhere(db.VoucherEntry, { voucher_id: { [Op.in]: voucherIds } }, transaction);
  }
  await destroyWhere(db.GeneralLedger, { shop_id: shopId }, transaction);

  if (supplierIds.length) {
    const purchaseInvoiceIds = await idsFor(db.PurchaseInvoice, { supplier_id: { [Op.in]: supplierIds } }, transaction);
    if (purchaseInvoiceIds.length) {
      await destroyWhere(db.PurchaseInvoiceItem, { purchase_invoice_id: { [Op.in]: purchaseInvoiceIds } }, transaction);
    }
    await destroyWhere(db.PurchaseInvoice, { supplier_id: { [Op.in]: supplierIds } }, transaction);
  }
  if (saleIds.length) {
    await destroyWhere(db.Payment, { sale_id: { [Op.in]: saleIds } }, transaction);
    await destroyWhere(db.SaleItem, { sale_id: { [Op.in]: saleIds } }, transaction);
  }
  if (returnIds.length) {
    await destroyWhere(db.SaleReturnItem, { return_id: { [Op.in]: returnIds } }, transaction);
  }
  if (gatePassIds.length) {
    await destroyWhere(db.GatePassItem, { gate_pass_id: { [Op.in]: gatePassIds } }, transaction);
  }
  if (loanIds.length) {
    await destroyWhere(db.EmployeeLoanSchedule, { loan_id: { [Op.in]: loanIds } }, transaction);
  }
  if (transferIds.length) {
    await destroyWhere(db.StockTransferItem, { transfer_id: { [Op.in]: transferIds } }, transaction);
  }
  if (productIds.length) {
    await destroyWhere(db.ProductSupplier, { product_id: { [Op.in]: productIds } }, transaction);
  }
  if (customerIds.length) {
    await destroyWhere(db.Guarantor, { customer_id: { [Op.in]: customerIds } }, transaction);
  }

  if (branchIds.length || productIds.length) {
    const stockWhere = [];
    if (branchIds.length) stockWhere.push({ branch_id: { [Op.in]: branchIds } });
    if (productIds.length) stockWhere.push({ product_id: { [Op.in]: productIds } });
    if (stockWhere.length) {
      const clause = stockWhere.length === 1 ? stockWhere[0] : { [Op.or]: stockWhere };
      await destroyWhere(db.Stock, clause, transaction);
      await destroyWhere(db.StockMovement, clause, transaction);
      await destroyWhere(db.StockAdjustment, clause, transaction);
    }
  }

  if (employeeIds.length) {
    await destroyWhere(db.Payroll, { employee_id: { [Op.in]: employeeIds } }, transaction);
    await destroyWhere(db.Attendance, { employee_id: { [Op.in]: employeeIds } }, transaction);
    await destroyWhere(db.EmployeeLoan, { employee_id: { [Op.in]: employeeIds } }, transaction);
  }

  if (transferIds.length) {
    await destroyWhere(db.StockTransfer, { id: { [Op.in]: transferIds } }, transaction);
  }

  if (grnIds.length) {
    await destroyWhere(db.GoodsReceiptNoteItem, { goods_receipt_note_id: { [Op.in]: grnIds } }, transaction);
  }
  if (poIds.length) {
    await destroyWhere(db.PurchaseOrderItem, { purchase_order_id: { [Op.in]: poIds } }, transaction);
  }

  for (const Model of [
    db.SaleReturn, db.GatePass, db.GoodsReceiptNote, db.PurchaseOrder,
    db.CustomerTransaction, db.SupplierTransaction,
    db.EmployeeTransaction, db.BoardMemberTransaction, db.Expense, db.Sale,
    db.Voucher, db.BankAccount, db.CashSession, db.Product, db.Customer,
    db.Supplier, db.Employee, db.BoardMember, db.Category, db.Godown,
    db.DeletionRequest, db.AuditLog,
  ]) {
    await destroyWhere(Model, { shop_id: shopId }, transaction);
  }

  await destroyWhere(db.ChartOfAccount, { shop_id: shopId }, transaction);

  const roleIds = await idsFor(db.Role, { shop_id: shopId }, transaction);
  if (roleIds.length) {
    await destroyWhere(db.RolePermission, { role_id: { [Op.in]: roleIds } }, transaction);
    await destroyWhere(db.Role, { id: { [Op.in]: roleIds } }, transaction);
  }

  await destroyWhere(db.User, { shop_id: shopId }, transaction);
  await destroyWhere(db.Branch, { shop_id: shopId }, transaction);
  await destroyWhere(db.Shop, { id: shopId }, transaction);
}

module.exports = { destroyShopCompletely };
