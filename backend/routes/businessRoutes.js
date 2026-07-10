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
const installmentController = require('../controllers/installmentController');
const invoiceController = require('../controllers/invoiceController');
const saleReturnController = require('../controllers/saleReturnController');
const financialSetupController = require('../controllers/financialSetupController');

router.use(authenticate);
router.use(tenantScope);

// Suppliers
router.get(   '/suppliers',              authorize('suppliers', 'read'),   supplierController.list);
router.get(   '/suppliers/:id',          authorize('suppliers', 'read'),   supplierController.get);
router.post(  '/suppliers',              authorize('suppliers', 'create'), supplierController.create);
router.put(   '/suppliers/:id',          authorize('suppliers', 'update'), supplierController.update);
router.delete('/suppliers/:id',          authorize('suppliers', 'delete'), supplierController.remove);
router.post(  '/suppliers/:id/products', authorize('suppliers', 'update'), supplierController.linkProduct);

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

// Employees
router.get(   '/employees',              authorize('employees', 'read'),   employeeController.list);
router.get(   '/employees/:id',          authorize('employees', 'read'),   employeeController.get);
router.post(  '/employees',              authorize('employees', 'create'), employeeController.create);
router.put(   '/employees/:id',          authorize('employees', 'update'), employeeController.update);
router.delete('/employees/:id',          authorize('employees', 'delete'), employeeController.remove);

// Sales
router.get(   '/sales',                  authorize('sales', 'read'),   saleController.list);
router.get(   '/sales/stats',            authorize('sales', 'read'),   saleController.stats);
router.get(   '/sales/:id',              authorize('sales', 'read'),   saleController.get);
router.post(  '/sales',                  authorize('sales', 'create'), saleController.create);
router.get(   '/sales/:id/returnable',   authorize('returns', 'read'),  saleReturnController.returnable);

// Installments
router.get(   '/installments',           authorize('sales', 'read'),   installmentController.list);
router.get(   '/installments/stats',     authorize('sales', 'read'),   installmentController.stats);
router.get(   '/installments/:id',       authorize('sales', 'read'),   installmentController.get);
router.post(  '/installments',           authorize('sales', 'create'), installmentController.createPlan);
router.post(  '/installments/:id/pay/:scheduleId', authorize('sales', 'create'), installmentController.recordPayment);

// Sales Returns & Exchange
router.get(   '/returns',                authorize('returns', 'read'),   saleReturnController.list);
router.get(   '/returns/:id',            authorize('returns', 'read'),   saleReturnController.get);
router.post(  '/returns',                authorize('returns', 'create'), saleReturnController.create);
router.post(  '/returns/:id/void',       authorize('returns', 'delete'), saleReturnController.void);

// Invoices (Unified Sales, Purchases, Installment receipts)
router.get(   '/invoices',               authorize('sales', 'read'),   invoiceController.list);
router.get(   '/invoices/:id',           authorize('sales', 'read'),   invoiceController.get);

// Financial Setup (first-time wizard) & Cash Sessions
router.post(  '/financial-setup',        financialSetupController.completeSetup);
router.get(   '/bank-accounts',          financialSetupController.listBankAccounts);
router.post(  '/cash-sessions',          financialSetupController.recordCashSession);
router.get(   '/cash-sessions/today',    financialSetupController.getTodaySession);
router.get(   '/cash-sessions',          financialSetupController.listSessions);

module.exports = router;
