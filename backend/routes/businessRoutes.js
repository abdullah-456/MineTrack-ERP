const express = require('express');
const router = express.Router();
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const supplierController = require('../controllers/supplierController');
const productController = require('../controllers/productController');
const categoryController = require('../controllers/categoryController');
const inventoryController = require('../controllers/inventoryController');
const customerController = require('../controllers/customerController');
const employeeController = require('../controllers/employeeController');
const saleController = require('../controllers/saleController');
const invoiceController = require('../controllers/invoiceController');
const saleReturnController = require('../controllers/saleReturnController');
const financialSetupController = require('../controllers/financialSetupController');
const supplierLedgerController = require('../controllers/supplierLedgerController');
const employeeLedgerController = require('../controllers/employeeLedgerController');
const customerLedgerController = require('../controllers/customerLedgerController');
const generalLedgerController = require('../controllers/generalLedgerController');
const auditLogController = require('../controllers/auditLogController');
const boardMemberController = require('../controllers/boardMemberController');
const expenseController = require('../controllers/expenseController');
const roleController = require('../controllers/roleController');
const deletionRequestController = require('../controllers/deletionRequestController');
const auditLog = require('../middleware/auditLog');

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
router.post(  '/inventory/receive',      authorize('inventory', 'create'), inventoryController.receiveStock);

// Customers
router.get(   '/customers',              authorize('customers', 'read'),   customerController.list);
router.get(   '/customers/:id',          authorize('customers', 'read'),   customerController.get);
router.post(  '/customers',              authorize('customers', 'create'), customerController.create);
router.put(   '/customers/:id',          authorize('customers', 'update'), customerController.update);
router.delete('/customers/:id',          authorize('customers', 'delete'), customerController.remove);
router.get(   '/customers/:id/ledger',   authorize('customers', 'read'),   customerLedgerController.getLedger);
router.post(  '/customers/:id/payments', authorize('customers', 'update'), customerLedgerController.recordPayment);

// Employees
router.get(   '/employees',              authorize('employees', 'read'),   employeeController.list);
router.get(   '/employees/latest-payslips', authorize('employees', 'read'), employeeLedgerController.getLatestPayslips);
router.get(   '/employees/:id',          authorize('employees', 'read'),   employeeController.get);
router.post(  '/employees',              authorize('employees', 'create'), employeeController.create);
router.put(   '/employees/:id',          authorize('employees', 'update'), employeeController.update);
router.delete('/employees/:id',          authorize('employees', 'delete'), employeeController.remove);
router.get(   '/employees/:id/ledger',   authorize('employees', 'read'),   employeeLedgerController.getLedger);
router.get(   '/employees/:id/slips/:txnId', authorize('employees', 'read'), employeeLedgerController.getTransactionSlip);
router.post(  '/employees/:id/advances', authorize('employees', 'update'), employeeLedgerController.recordAdvance);
router.post(  '/employees/:id/loans',    authorize('employees', 'update'), employeeLedgerController.recordLoan);
router.post(  '/employees/:id/receive-loan-payment', authorize('employees', 'update'), employeeLedgerController.receiveLoanPayment);
router.post(  '/employees/:id/opening-balance', authorize('employees', 'update'), employeeLedgerController.recordOpeningBalance);
router.post(  '/employees/:id/give-salary', authorize('employees', 'update'), employeeLedgerController.giveSalary);

// Sales
router.get(   '/sales',                  authorize('sales', 'read'),   saleController.list);
router.get(   '/sales/stats',            authorize('sales', 'read'),   saleController.stats);
router.get(   '/sales/:id',              authorize('sales', 'read'),   saleController.get);
router.post(  '/sales',                  authorize('sales', 'create'), saleController.create);
router.get(   '/sales/:id/returnable',   authorize('returns', 'read'),  saleReturnController.returnable);


// Sales Returns & Exchange
router.get(   '/returns',                authorize('returns', 'read'),   saleReturnController.list);
router.get(   '/returns/:id',            authorize('returns', 'read'),   saleReturnController.get);
router.post(  '/returns',                authorize('returns', 'create'), saleReturnController.create);
router.post(  '/returns/:id/void',       authorize('returns', 'delete'), saleReturnController.void);

// Invoices (Unified Sales, Purchases, Installment receipts)
router.get(   '/invoices',               authorize('sales', 'read'),   invoiceController.list);
router.get(   '/invoices/:id',           authorize('sales', 'read'),   invoiceController.get);

// Accounting (Chart of Accounts + General Ledger)
router.get(   '/accounting/chart-of-accounts', authorize('accounting', 'read'), generalLedgerController.listChartOfAccounts);
router.get(   '/accounting/general-ledger',    authorize('accounting', 'read'), generalLedgerController.listEntries);
router.get(   '/accounting/vouchers/:id',       authorize('accounting', 'read'), generalLedgerController.getVoucher);

// Financial Setup (first-time wizard) & Cash Sessions
router.post(  '/financial-setup',        financialSetupController.completeSetup);
router.get(   '/bank-accounts',          financialSetupController.listBankAccounts);
router.post(  '/cash-sessions',          financialSetupController.recordCashSession);
router.get(   '/cash-sessions/today',    financialSetupController.getTodaySession);
router.get(   '/cash-sessions',          financialSetupController.listSessions);
router.get(   '/balances',               financialSetupController.getLiveBalances);
router.get(   '/money-flow',             financialSetupController.getMoneyFlow);
router.get(   '/company',                financialSetupController.getCompany);

// Admin — Audit Log
router.get(   '/admin/audit-log',        authorize('users', 'read'), auditLogController.list);
router.get(   '/admin/audit-log/modules', authorize('users', 'read'), auditLogController.listModules);

// Board of Directors
router.get(   '/board-members',     authorize('board_directors', 'read'),   boardMemberController.list);
router.get(   '/board-members/:id', authorize('board_directors', 'read'),   boardMemberController.get);
router.post(  '/board-members',     authorize('board_directors', 'create'), boardMemberController.create);
router.put(   '/board-members/:id', authorize('board_directors', 'update'), boardMemberController.update);
router.delete('/board-members/:id', authorize('board_directors', 'delete'), boardMemberController.remove);

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
