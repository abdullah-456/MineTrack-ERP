const express = require('express');
const router = express.Router();
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const supplierController = require('../controllers/supplierController');
const productController = require('../controllers/productController');
const categoryController = require('../controllers/categoryController');
const inventoryController = require('../controllers/inventoryController');
const customerController = require('../controllers/customerController');
const employeeController = require('../controllers/employeeController');
const attendanceController = require('../controllers/attendanceController');
const saleController = require('../controllers/saleController');
const invoiceController = require('../controllers/invoiceController');
const saleReturnController = require('../controllers/saleReturnController');
const financialSetupController = require('../controllers/financialSetupController');
const supplierLedgerController = require('../controllers/supplierLedgerController');
const employeeLedgerController = require('../controllers/employeeLedgerController');
const customerLedgerController = require('../controllers/customerLedgerController');
const generalLedgerController = require('../controllers/generalLedgerController');
const chartOfAccountController = require('../controllers/chartOfAccountController');
const auditLogController = require('../controllers/auditLogController');
const boardMemberController = require('../controllers/boardMemberController');
const boardMemberLedgerController = require('../controllers/boardMemberLedgerController');
const expenseController = require('../controllers/expenseController');
const financialReportsController = require('../controllers/financialReportsController');
const moduleReportsController = require('../controllers/moduleReportsController');
const roleController = require('../controllers/roleController');
const deletionRequestController = require('../controllers/deletionRequestController');
const gatePassController = require('../controllers/gatePassController');
const godownController = require('../controllers/godownController');
const purchaseOrderController = require('../controllers/purchaseOrderController');
const purchaseRequisitionController = require('../controllers/purchaseRequisitionController');
const departmentalApprovalController = require('../controllers/departmentalApprovalController');
const purchaseFulfillmentController = require('../controllers/purchaseFulfillmentController');
const goodsReceiptController = require('../controllers/goodsReceiptController');
const fiscalYearController = require('../controllers/fiscalYearController');
const auditLog = require('../middleware/auditLog');
const loadEmployee = require('../middleware/loadEmployee');
const loadOwner = require('../middleware/loadOwner');
const documentController = require('../controllers/documentController');
const { employeeUpload } = require('../utils/employeeUploads');
const { documentUpload } = require('../utils/documentUploads');
const { approvalUpload } = require('../utils/approvalUploads');
const { fulfillmentUpload } = require('../utils/fulfillmentUploads');

router.use(authenticate);
router.use(tenantScope);
router.use(auditLog);

// Suppliers
router.get(   '/suppliers',              authorize('suppliers', 'read'),   supplierController.list);
router.get(   '/suppliers/:id',          authorize('suppliers', 'read'),   supplierController.get);
router.post(  '/suppliers',              authorize('suppliers', 'create'), supplierController.create);
router.put(   '/suppliers/:id',          authorize('suppliers', 'update'), supplierController.update);
router.delete('/suppliers/:id',          authorize('suppliers', 'delete'), supplierController.remove);
router.post(  '/suppliers/:id/products', authorize('suppliers', 'update'), supplierController.linkProduct);
router.get(   '/suppliers/:id/ledger',   authorize('suppliers', 'read'),   supplierLedgerController.getLedger);
router.post(  '/suppliers/:id/payments', authorize('suppliers', 'update'), supplierLedgerController.recordPayment);
router.post(  '/suppliers/:id/opening-balance', authorize('suppliers', 'update'), supplierLedgerController.recordOpeningBalance);
router.get(   '/suppliers/:id/documents',           authorize('documents', 'read'),   loadOwner('supplier'), documentController.listDocuments);
router.post(  '/suppliers/:id/documents',           authorize('documents', 'create'), loadOwner('supplier'), documentUpload.single('file'), documentController.uploadDocument);
router.get(   '/suppliers/:id/documents/:docId/file', authorize('documents', 'read'), loadOwner('supplier'), documentController.getDocumentFile);
router.delete('/suppliers/:id/documents/:docId',    authorize('documents', 'delete'), loadOwner('supplier'), documentController.deleteDocument);

// Purchase Orders
router.get(   '/purchase-orders',                      authorize('purchases', 'read'),   purchaseOrderController.list);
router.get(   '/purchase-orders/:id',                authorize('purchases', 'read'),   purchaseOrderController.get);
router.get(   '/purchase-orders/:id/receivable',     authorize('purchases', 'read'),   purchaseOrderController.getReceivable);
router.post(  '/purchase-orders',                    authorize('purchases', 'create'), purchaseOrderController.create);
router.put(   '/purchase-orders/:id',                authorize('purchases', 'update'), purchaseOrderController.update);
router.delete('/purchase-orders/:id',                authorize('purchases', 'delete'), purchaseOrderController.remove);
router.post(  '/purchase-orders/:id/send',           authorize('purchases', 'update'), purchaseOrderController.send);
router.post(  '/purchase-orders/:id/cancel',         authorize('purchases', 'update'), purchaseOrderController.cancel);
router.post(  '/purchase-orders/:poId/receipts',     authorize('purchases', 'create'), goodsReceiptController.createFromPo);
router.post(  '/purchase-orders/:id/receive',        authorize('purchases', 'create'), goodsReceiptController.receiveFromPo);

// Purchase Requisitions
router.get(   '/purchase-requisitions',              authorize('purchases', 'read'),   purchaseRequisitionController.list);
router.get(   '/purchase-requisitions/:id',        authorize('purchases', 'read'),   purchaseRequisitionController.get);
router.post(  '/purchase-requisitions',            authorize('purchases', 'create'), purchaseRequisitionController.create);
router.put(   '/purchase-requisitions/:id',        authorize('purchases', 'update'), purchaseRequisitionController.update);
router.delete('/purchase-requisitions/:id',        authorize('purchases', 'delete'), purchaseRequisitionController.remove);
router.post(  '/purchase-requisitions/:id/submit', authorize('purchases', 'update'), purchaseRequisitionController.submit);

// Departmental Approvals
router.get(   '/departmental-approvals/eligible-requisitions', authorize('purchases', 'read'),   departmentalApprovalController.listEligibleRequisitions);
router.get(   '/departmental-approvals',                       authorize('purchases', 'read'),   departmentalApprovalController.list);
router.get(   '/departmental-approvals/:id',                   authorize('purchases', 'read'),   departmentalApprovalController.get);
router.get(   '/departmental-approvals/:id/attachment',        authorize('purchases', 'read'),   departmentalApprovalController.getAttachment);
router.post(  '/departmental-approvals',                       authorize('purchases', 'approve'), approvalUpload.single('attachment'), departmentalApprovalController.create);
router.delete('/departmental-approvals/:id',                   authorize('purchases', 'delete'), departmentalApprovalController.remove);

// Purchase Workflow — PO fulfillment from approved PRs
router.get(   '/purchase-workflow/eligible-requisitions', authorize('purchases', 'read'),   purchaseFulfillmentController.listEligibleRequisitions);
router.get(   '/purchase-workflow/orders',                authorize('purchases', 'read'),   purchaseFulfillmentController.list);
router.get(   '/purchase-workflow/orders/:id',              authorize('purchases', 'read'),   purchaseFulfillmentController.get);
router.get(   '/purchase-workflow/orders/:id/documents/:docType', authorize('purchases', 'read'), purchaseFulfillmentController.getDocument);
router.post(  '/purchase-workflow/orders',                authorize('purchases', 'create'),
  fulfillmentUpload.fields([{ name: 'grn_document', maxCount: 1 }, { name: 'invoice_document', maxCount: 1 }]),
  purchaseFulfillmentController.execute);

// Goods Receipt Notes (GRN)
router.get(   '/goods-receipts',                     authorize('purchases', 'read'),   goodsReceiptController.list);
router.get(   '/goods-receipts/:id',                 authorize('purchases', 'read'),   goodsReceiptController.get);
router.post(  '/goods-receipts',                    authorize('purchases', 'create'), goodsReceiptController.create);
router.put(   '/goods-receipts/:id',                authorize('purchases', 'update'), goodsReceiptController.update);
router.delete('/goods-receipts/:id',                authorize('purchases', 'delete'), goodsReceiptController.remove);
router.post(  '/goods-receipts/:id/post',           authorize('purchases', 'approve'), goodsReceiptController.post);

// Categories
router.get(   '/categories',             authorize('products', 'read'),   categoryController.list);
router.post(  '/categories',             authorize('products', 'create'), categoryController.create);
router.put(   '/categories/:id',         authorize('products', 'update'), categoryController.update);
router.delete('/categories/:id',         authorize('products', 'delete'), categoryController.remove);

// Products
router.get(   '/products',               authorize('products', 'read'),   productController.list);
router.get(   '/products/:id',           authorize('products', 'read'),   productController.get);
router.post(  '/products',               authorize('products', 'create'), productController.create);
router.put(   '/products/:id',           authorize('products', 'update'), productController.update);
router.delete('/products/:id',           authorize('products', 'delete'), productController.remove);

// Inventory / Stock
router.get(   '/inventory',              authorize('inventory', 'read'),   inventoryController.list);
router.get(   '/inventory/summary',      authorize('inventory', 'read'),   inventoryController.summary);
router.get(   '/inventory/movements',    authorize('inventory', 'read'),   inventoryController.movements);
router.post(  '/inventory/adjust',       authorize('inventory', 'update'), inventoryController.adjust);
router.post(  '/inventory/transfer',     authorize('inventory', 'update'), inventoryController.transferStock);
router.post(  '/inventory/receive',      authorize('inventory', 'create'), inventoryController.receiveStock);

// Godowns
router.get(   '/godowns',                authorize('inventory', 'read'),   godownController.list);
router.get(   '/godowns/:id',            authorize('inventory', 'read'),   godownController.get);
router.post(  '/godowns',                authorize('inventory', 'create'), godownController.create);
router.put(   '/godowns/:id',            authorize('inventory', 'update'), godownController.update);
router.delete('/godowns/:id',            authorize('inventory', 'delete'), godownController.remove);
router.post(  '/godowns/:id/link-branches', authorize('inventory', 'update'), godownController.linkBranches);

// Customers
router.get(   '/customers',              authorize('customers', 'read'),   customerController.list);
router.get(   '/customers/:id',          authorize('customers', 'read'),   customerController.get);
router.post(  '/customers',              authorize('customers', 'create'), customerController.create);
router.put(   '/customers/:id',          authorize('customers', 'update'), customerController.update);
router.delete('/customers/:id',          authorize('customers', 'delete'), customerController.remove);
router.get(   '/customers/:id/ledger',   authorize('customers', 'read'),   customerLedgerController.getLedger);
router.post(  '/customers/:id/payments', authorize('customers', 'update'), customerLedgerController.recordPayment);
router.get(   '/customers/:id/documents',           authorize('documents', 'read'),   loadOwner('customer'), documentController.listDocuments);
router.post(  '/customers/:id/documents',           authorize('documents', 'create'), loadOwner('customer'), documentUpload.single('file'), documentController.uploadDocument);
router.get(   '/customers/:id/documents/:docId/file', authorize('documents', 'read'), loadOwner('customer'), documentController.getDocumentFile);
router.delete('/customers/:id/documents/:docId',    authorize('documents', 'delete'), loadOwner('customer'), documentController.deleteDocument);

// Employees
router.get(   '/employees',              authorize('employees', 'read'),   employeeController.list);
router.get(   '/employees/latest-payslips', authorize('employees', 'read'), employeeLedgerController.getLatestPayslips);
router.get(   '/employees/next-employment-id', authorize('employees', 'create'), employeeController.nextEmploymentId);
router.get(   '/employees/:id',          authorize('employees', 'read'),   employeeController.get);
router.post(  '/employees',              authorize('employees', 'create'), employeeController.create);
router.put(   '/employees/:id',          authorize('employees', 'update'), employeeController.update);
router.patch( '/employees/:id/status',   authorize('employees', 'update'), employeeController.patchStatus);
router.get(   '/employees/:id/termination-preview', authorize('employees', 'read'), employeeController.getTerminationPreview);
router.post(  '/employees/:id/terminate', authorize('employees', 'delete'), employeeController.terminate);
router.delete('/employees/:id',          authorize('employees', 'delete'), employeeController.remove);
router.get(   '/employees/:id/ledger',   authorize('employees', 'read'),   employeeLedgerController.getLedger);
router.get(   '/employees/:id/clearance-certificate', authorize('employees', 'read'), employeeLedgerController.getClearanceCertificate);
router.get(   '/employees/:id/slips/:txnId', authorize('employees', 'read'), employeeLedgerController.getTransactionSlip);
router.post(  '/employees/:id/advances', authorize('employees', 'update'), employeeLedgerController.recordAdvance);
router.post(  '/employees/:id/loans',    authorize('employees', 'update'), employeeLedgerController.recordLoan);
router.post(  '/employees/:id/receive-loan-payment', authorize('employees', 'update'), employeeLedgerController.receiveLoanPayment);
router.post(  '/employees/:id/receive-advance-payment', authorize('employees', 'update'), employeeLedgerController.receiveAdvancePayment);
router.post(  '/employees/:id/receive-overpayment', authorize('employees', 'update'), employeeLedgerController.receiveOverpayment);
router.post(  '/employees/:id/opening-balance', authorize('employees', 'update'), employeeLedgerController.recordOpeningBalance);
router.post(  '/employees/:id/give-salary', authorize('employees', 'update'), employeeLedgerController.giveSalary);

// Employee attachments — photo, CNIC image, other documents (all optional)
router.post(  '/employees/:id/photo',       authorize('employees', 'update'), loadEmployee, employeeUpload.photo.single('photo'), employeeController.uploadPhoto);
router.get(   '/employees/:id/photo',       authorize('employees', 'read'),   loadEmployee, employeeController.getPhoto);
router.delete('/employees/:id/photo',       authorize('employees', 'update'), loadEmployee, employeeController.deletePhoto);
router.post(  '/employees/:id/cnic-image',  authorize('employees', 'update'), loadEmployee, employeeUpload.cnic.single('cnic_image'), employeeController.uploadCnicImage);
router.get(   '/employees/:id/cnic-image',  authorize('employees', 'read'),   loadEmployee, employeeController.getCnicImage);
router.delete('/employees/:id/cnic-image',  authorize('employees', 'update'), loadEmployee, employeeController.deleteCnicImage);
router.post(  '/employees/:id/documents',   authorize('employees', 'update'), loadEmployee, employeeUpload.documents.single('file'), employeeController.uploadDocument);
router.get(   '/employees/:id/documents/:docId/file', authorize('employees', 'read'), loadEmployee, employeeController.getDocumentFile);
router.delete('/employees/:id/documents/:docId', authorize('employees', 'update'), loadEmployee, employeeController.deleteDocument);

// Attendance
router.get(   '/attendance',        authorize('attendance', 'read'),   attendanceController.getDay);
router.get(   '/attendance/month',  authorize('attendance', 'read'),   attendanceController.getMonth);
router.get(   '/attendance/summary', authorize('attendance', 'read'),  attendanceController.getSummary);
router.post(  '/attendance/mark',   authorize('attendance', 'create'), attendanceController.mark);

// Attendance — reports
router.get(   '/attendance/employees',    authorize('attendance', 'read'), attendanceController.getRosterForReports);
router.get(   '/attendance/report/daily', authorize('attendance', 'read'), attendanceController.getDailyReport);
router.get(   '/attendance/report/range', authorize('attendance', 'read'), attendanceController.getRangeReport);

// Sales
router.get(   '/sales',                  authorize('sales', 'read'),   saleController.list);
router.get(   '/sales/stats',            authorize('sales', 'read'),   saleController.stats);
router.get(   '/sales/:id',              authorize('sales', 'read'),   saleController.get);
router.post(  '/sales',                  authorize('sales', 'create'), saleController.create);
router.get(   '/sales/:id/returnable',   authorize('returns', 'read'),  saleReturnController.returnable);

// GatePasses
router.get(   '/gatepasses',             authorize('sales', 'read'),   gatePassController.list);
router.get(   '/gatepasses/:id',         authorize('sales', 'read'),   gatePassController.get);
router.post(  '/gatepasses',             authorize('sales', 'create'), gatePassController.create);
router.delete('/gatepasses/:id',         authorize('sales', 'delete'), gatePassController.remove);


// Sales Returns & Exchange
router.get(   '/returns',                authorize('returns', 'read'),   saleReturnController.list);
router.get(   '/returns/:id',            authorize('returns', 'read'),   saleReturnController.get);
router.post(  '/returns',                authorize('returns', 'create'), saleReturnController.create);
router.post(  '/returns/:id/void',       authorize('returns', 'delete'), saleReturnController.void);

// Invoices (Unified Sales, Purchases, Installment receipts)
router.get(   '/invoices',               authorize('sales', 'read'),   invoiceController.list);
router.get(   '/invoices/:id',           authorize('sales', 'read'),   invoiceController.get);

// Accounting (Chart of Accounts + General Ledger)
router.get(   '/accounting/chart-of-accounts',     authorize('accounting', 'read'),   generalLedgerController.listChartOfAccounts);
router.post(  '/accounting/chart-of-accounts',     authorize('accounting', 'create'), chartOfAccountController.create);
router.put(   '/accounting/chart-of-accounts/:id', authorize('accounting', 'update'), chartOfAccountController.update);
router.delete('/accounting/chart-of-accounts/:id', authorize('accounting', 'delete'), chartOfAccountController.remove);
router.get(   '/accounting/general-ledger/filter-options', authorize('accounting', 'read'), generalLedgerController.getFilterOptions);
router.get(   '/accounting/general-ledger',        authorize('accounting', 'read'),   generalLedgerController.listEntries);
router.get(   '/accounting/vouchers/:id',          authorize('accounting', 'read'),   generalLedgerController.getVoucher);
router.post(  '/accounting/journal-entries',       authorize('accounting', 'create'), generalLedgerController.createJournalEntry);

// Fiscal Years
router.get(   '/fiscal-years',                      authorize('accounting', 'read'), fiscalYearController.list);
router.get(   '/fiscal-years/current',              authorize('accounting', 'read'), fiscalYearController.current);
router.get(   '/fiscal-years/:id/pre-close-checklist', authorize('accounting', 'read'), fiscalYearController.preCloseChecklist);
router.post(  '/fiscal-years/:id/close',            authorize('accounting', 'fiscal_year.close'), fiscalYearController.close);

// Financial Reports (derived from General Ledger)
router.get(   '/reports/trial-balance',    authorize('reports', 'read'), financialReportsController.trialBalance);
router.get(   '/reports/profit-and-loss', authorize('reports', 'read'), financialReportsController.profitAndLoss);
router.get(   '/reports/balance-sheet',   authorize('reports', 'read'), financialReportsController.balanceSheet);
router.get(   '/reports/equity-statement', authorize('reports', 'read'), financialReportsController.equityStatement);
router.get(   '/reports/cash-flow',       authorize('reports', 'read'), financialReportsController.cashFlow);
router.get(   '/reports/modules/sales/summary', authorize('sales', 'read'), moduleReportsController.salesSummary);
router.get('/reports/modules/purchases/summary', authorize('purchases', 'read'), moduleReportsController.purchasesSummary);
router.get('/reports/modules/inventory/summary', authorize('inventory', 'read'), moduleReportsController.inventorySummary);
router.get('/reports/modules/customers/summary', authorize('customers', 'read'), moduleReportsController.customersSummary);
router.get('/reports/modules/suppliers/summary', authorize('suppliers', 'read'), moduleReportsController.suppliersSummary);
router.get('/reports/modules/expenses/summary', authorize('expenses', 'read'), moduleReportsController.expensesSummary);
router.get('/reports/modules/accounting/summary', authorize('accounting', 'read'), moduleReportsController.accountingSummary);
router.get('/reports/modules/employees/summary', authorize('employees', 'read'), moduleReportsController.employeesSummary);
router.get('/reports/modules/board/summary', authorize('board_directors', 'read'), moduleReportsController.boardSummary);
router.get('/reports/modules/production/summary', authorize('branches', 'read'), moduleReportsController.productionSummary);

// Entity-picker options for each report's "narrow to one X" filter — gated on
// the same permission as that module's own summary route, not shared, so a
// user without accounting:read can still filter their own module's report.
router.get('/reports/modules/sales/filter-options', authorize('sales', 'read'), moduleReportsController.salesFilterOptions);
router.get('/reports/modules/purchases/filter-options', authorize('purchases', 'read'), moduleReportsController.purchasesFilterOptions);
router.get('/reports/modules/inventory/filter-options', authorize('inventory', 'read'), moduleReportsController.inventoryFilterOptions);
router.get('/reports/modules/customers/filter-options', authorize('customers', 'read'), moduleReportsController.customersFilterOptions);
router.get('/reports/modules/suppliers/filter-options', authorize('suppliers', 'read'), moduleReportsController.suppliersFilterOptions);
router.get('/reports/modules/expenses/filter-options', authorize('expenses', 'read'), moduleReportsController.expensesFilterOptions);
router.get('/reports/modules/employees/filter-options', authorize('employees', 'read'), moduleReportsController.employeesFilterOptions);
router.get('/reports/modules/board/filter-options', authorize('board_directors', 'read'), moduleReportsController.boardFilterOptions);
router.get('/reports/modules/production/filter-options', authorize('branches', 'read'), moduleReportsController.productionFilterOptions);

// Financial Setup (first-time wizard) & Cash Sessions
router.post(  '/financial-setup',                 authorize('accounting', 'create'), financialSetupController.completeSetup);
router.post(  '/financial-setup/skip',          authorize('accounting', 'create'), financialSetupController.skipSetup);
router.post(  '/financial-setup/opening-cash',  authorize('accounting', 'create'), financialSetupController.setOpeningCash);
router.post(  '/financial-setup/bank-accounts', authorize('accounting', 'create'), financialSetupController.addBankAccounts);
router.get(   '/bank-accounts',          financialSetupController.listBankAccounts);
router.post(  '/cash-sessions',          authorize('accounting', 'create'), financialSetupController.recordCashSession);
router.get(   '/cash-sessions/today',    financialSetupController.getTodaySession);
router.get(   '/cash-sessions',          financialSetupController.listSessions);
router.get(   '/balances',               financialSetupController.getLiveBalances);
router.get(   '/money-flow',             financialSetupController.getMoneyFlow);
router.get(   '/company',                financialSetupController.getCompany);
router.put(   '/company',                authorize('users', 'update'), financialSetupController.updateCompany);
router.get(   '/company/documents',           authorize('documents', 'read'),   loadOwner('shop'), documentController.listDocuments);
router.post(  '/company/documents',           authorize('documents', 'create'), loadOwner('shop'), documentUpload.single('file'), documentController.uploadDocument);
router.get(   '/company/documents/:docId/file', authorize('documents', 'read'), loadOwner('shop'), documentController.getDocumentFile);
router.delete('/company/documents/:docId',    authorize('documents', 'delete'), loadOwner('shop'), documentController.deleteDocument);

// Admin — Audit Log
router.get(   '/admin/audit-log',        authorize('users', 'read'), auditLogController.list);
router.get(   '/admin/audit-log/modules', authorize('users', 'read'), auditLogController.listModules);

// Board of Directors
router.get(   '/board-members',     authorize('board_directors', 'read'),   boardMemberController.list);
router.get(   '/board-members/payment-sources', (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  return next();
}, async (req, res) => {
  try {
    const { requireShopId } = require('../utils/shopScope');
    const { listPaymentSources } = require('../utils/bodAccounts');
    const shopId = requireShopId(req, res);
    if (!shopId) return;
    const sources = await listPaymentSources(shopId);
    return res.json({ sources });
  } catch (e) {
    console.error('listBodPaymentSources error:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
router.get(   '/board-members/:id', authorize('board_directors', 'read'),   boardMemberController.get);
router.post(  '/board-members',     authorize('board_directors', 'create'), boardMemberController.create);
router.put(   '/board-members/:id', authorize('board_directors', 'update'), boardMemberController.update);
router.delete('/board-members/:id', authorize('board_directors', 'delete'), boardMemberController.remove);
router.get(   '/board-members/:id/ledger',  authorize('board_directors', 'read'),   boardMemberLedgerController.getLedger);
router.post(  '/board-members/:id/personal-deposit', authorize('board_directors', 'update'), boardMemberLedgerController.recordPersonalDeposit);
router.post(  '/board-members/:id/transfer', authorize('board_directors', 'update'), boardMemberLedgerController.recordTransfer);
router.get(   '/board-members/:id/documents',           authorize('documents', 'read'),   loadOwner('board_member'), documentController.listDocuments);
router.post(  '/board-members/:id/documents',           authorize('documents', 'create'), loadOwner('board_member'), documentUpload.single('file'), documentController.uploadDocument);
router.get(   '/board-members/:id/documents/:docId/file', authorize('documents', 'read'), loadOwner('board_member'), documentController.getDocumentFile);
router.delete('/board-members/:id/documents/:docId',    authorize('documents', 'delete'), loadOwner('board_member'), documentController.deleteDocument);

// Expenses
router.get(   '/expenses',     authorize('expenses', 'read'),   expenseController.list);
router.get(   '/expenses/:id', authorize('expenses', 'read'),   expenseController.get);
router.post(  '/expenses',     authorize('expenses', 'create'), expenseController.create);
router.put(   '/expenses/:id', authorize('expenses', 'update'), expenseController.update);
router.delete('/expenses/:id', authorize('expenses', 'delete'), expenseController.remove);

// Roles & Permissions
router.get(   '/roles',                      authorize('roles', 'read'),   roleController.list);
router.get(   '/roles/permissions-catalog',  authorize('roles', 'read'),   roleController.permissionsCatalog);
router.get(   '/roles/:id',                  authorize('roles', 'read'),   roleController.get);
router.post(  '/roles',                      authorize('roles', 'create'), roleController.create);
router.put(   '/roles/:id',                  authorize('roles', 'update'), roleController.update);
router.delete('/roles/:id',                  authorize('roles', 'delete'), roleController.remove);

// Deletion Requests (admin/super_admin only — gated inside the controller)
router.get(   '/deletion-requests',            deletionRequestController.list);
router.post(  '/deletion-requests/:id/approve', deletionRequestController.approve);
router.post(  '/deletion-requests/:id/reject',  deletionRequestController.reject);

module.exports = router;
