import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import SidebarLayout from './layouts/SidebarLayout';
import ShopSetupModal from './components/modals/ShopSetupModal';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import ComingSoon from './pages/ComingSoon';

// SuperAdmin pages
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';
import ShopsList           from './pages/superadmin/ShopsList';
import CreateShop          from './pages/superadmin/CreateShop';
import ShopDetail          from './pages/superadmin/ShopDetail';

// Admin pages
import UserManagement from './pages/admin/UserManagement';
import AuditLog from './pages/admin/AuditLog';
import BoardOfDirectors from './pages/admin/BoardOfDirectors';
import Branches from './pages/admin/Branches';
import Expenses from './pages/expenses/Expenses';
import Roles from './pages/admin/Roles';
import DeletionRequests from './pages/admin/DeletionRequests';

// Business modules
import Suppliers  from './pages/suppliers/Suppliers';
import SupplierLedger from './pages/suppliers/SupplierLedger';
import SupplierStatementPrint from './pages/suppliers/SupplierStatementPrint';
import EmployeeLedger from './pages/employees/EmployeeLedger';
import CustomerLedger from './pages/customers/CustomerLedger';
import EmployeeStatementPrint from './pages/employees/EmployeeStatementPrint';
import EmployeeSlipPrint from './pages/employees/EmployeeSlipPrint';
import Payroll from './pages/employees/Payroll';
import ChartOfAccounts from './pages/accounting/ChartOfAccounts';
import GeneralLedger from './pages/accounting/GeneralLedger';
import Products   from './pages/products/Products';
import Categories from './pages/products/Categories';
import Inventory  from './pages/inventory/Inventory';
import Customers  from './pages/customers/Customers';
import Employees  from './pages/employees/Employees';
import Sales      from './pages/sales/Sales';
import SalesReturns from './pages/returns/SalesReturns';
import Invoices          from './pages/invoices/Invoices';
import InvoicePrintPage  from './pages/invoices/InvoicePrintPage';
import VoucherPrintPage  from './pages/accounting/VoucherPrintPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } }
});

// Smart root redirect — SuperAdmin goes to platform dashboard, others to shop dashboard
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'super_admin') return <Navigate to="/superadmin/dashboard" replace />;
  return <Navigate to="/dashboard" replace />;
}

// Global modal overlay — renders financial setup / cash check-in over the whole app
function GlobalModals() {
  const { showSetupModal, onSetupComplete, user } = useAuth();
  if (showSetupModal)  return <ShopSetupModal  shopName={user?.shop_name || 'Your Shop'} onComplete={onSetupComplete} />;
  return null;
}

function App() {
  return (
    <ThemeProvider>
    <ToastProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
          <BrowserRouter>
            <GlobalModals />
            <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RootRedirect />} />

            {/* ── Standalone Invoice Print Page (new tab, no sidebar) ── */}
            <Route path="/invoice/:invoiceId" element={<InvoicePrintPage />} />
            <Route path="/vouchers/:voucherId" element={<VoucherPrintPage />} />
            <Route path="/suppliers/:id/statement" element={<SupplierStatementPrint />} />
            <Route path="/employees/:id/statement" element={<EmployeeStatementPrint />} />
            <Route path="/employees/:employeeId/slip/:txnId" element={<EmployeeSlipPrint />} />

            {/* ── SuperAdmin Portal (Platform Management) ── */}
            <Route element={<ProtectedRoute superAdminOnly><SidebarLayout /></ProtectedRoute>}>
              <Route path="/superadmin/dashboard"    element={<SuperAdminDashboard />} />
              <Route path="/superadmin/shops"        element={<ShopsList />} />
              <Route path="/superadmin/shops/create" element={<CreateShop />} />
              <Route path="/superadmin/shops/:id"    element={<ShopDetail />} />
              <Route path="/superadmin/shops/:id/edit" element={<ComingSoon title="Edit Shop" />} />
            </Route>

            {/* ── Regular Protected Routes (Admins, Accountants, Cashiers) ── */}
            <Route element={<ProtectedRoute><SidebarLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Admin — User Management */}
              <Route path="/admin/users"
                element={<ProtectedRoute module="users" action="read"><UserManagement /></ProtectedRoute>} />
              <Route path="/admin/roles-permissions"
                element={<ProtectedRoute module="users" action="read"><ComingSoon title="Roles & Permissions" /></ProtectedRoute>} />
              <Route path="/admin/audit-log"
                element={<ProtectedRoute module="users" action="read"><AuditLog /></ProtectedRoute>} />
              <Route path="/admin/board-of-directors"
                element={<ProtectedRoute module="board_directors" action="read"><BoardOfDirectors /></ProtectedRoute>} />
              <Route path="/admin/branches"
                element={<ProtectedRoute module="branches" action="read"><Branches /></ProtectedRoute>} />
              <Route path="/admin/roles"
                element={<ProtectedRoute module="roles" action="read"><Roles /></ProtectedRoute>} />
              <Route path="/admin/deletion-requests"
                element={<ProtectedRoute module="users" action="read"><DeletionRequests /></ProtectedRoute>} />

              {/* Sales */}
              <Route path="/sales"
                element={<ProtectedRoute module="sales" action="read"><Sales /></ProtectedRoute>} />
              <Route path="/sales/:id"
                element={<ProtectedRoute module="sales" action="read"><ComingSoon title="Sale Detail" /></ProtectedRoute>} />
              <Route path="/returns"
                element={<ProtectedRoute module="returns" action="read"><SalesReturns /></ProtectedRoute>} />

              {/* Inventory */}
              <Route path="/products"
                element={<ProtectedRoute module="products" action="read"><Products /></ProtectedRoute>} />
              <Route path="/products/new"
                element={<ProtectedRoute module="products" action="create"><ComingSoon title="New Product" /></ProtectedRoute>} />
              <Route path="/categories"
                element={<ProtectedRoute module="products" action="read"><Categories /></ProtectedRoute>} />
              <Route path="/inventory"
                element={<ProtectedRoute module="inventory" action="read"><Inventory /></ProtectedRoute>} />
              <Route path="/stock-transfers/new"
                element={<ProtectedRoute module="inventory" action="create"><ComingSoon title="Stock Transfer" /></ProtectedRoute>} />

              {/* Procurement */}
              <Route path="/suppliers"
                element={<ProtectedRoute module="suppliers" action="read"><Suppliers /></ProtectedRoute>} />
              <Route path="/suppliers/:id"
                element={<ProtectedRoute module="suppliers" action="read"><SupplierLedger /></ProtectedRoute>} />
              <Route path="/purchase-orders"
                element={<ProtectedRoute module="purchases" action="read"><ComingSoon title="Purchase Orders" /></ProtectedRoute>} />
              <Route path="/purchase-orders/new"
                element={<ProtectedRoute module="purchases" action="create"><ComingSoon title="New Purchase Order" /></ProtectedRoute>} />
              <Route path="/purchase-orders/:id"
                element={<ProtectedRoute module="purchases" action="read"><ComingSoon title="Purchase Order Detail" /></ProtectedRoute>} />
              <Route path="/goods-receipt/new"
                element={<ProtectedRoute module="purchases" action="create"><ComingSoon title="Goods Receipt Note" /></ProtectedRoute>} />
              <Route path="/invoices"
                element={<ProtectedRoute module="sales" action="read"><Invoices /></ProtectedRoute>} />
              <Route path="/purchase-invoices"
                element={<ProtectedRoute module="sales" action="read"><Invoices /></ProtectedRoute>} />

              {/* Customers */}
              <Route path="/customers"
                element={<ProtectedRoute module="customers" action="read"><Customers /></ProtectedRoute>} />
              <Route path="/customers/:id"
                element={<ProtectedRoute module="customers" action="read"><CustomerLedger /></ProtectedRoute>} />

              {/* HR */}
              <Route path="/employees"
                element={<ProtectedRoute module="employees" action="read"><Employees /></ProtectedRoute>} />
              <Route path="/employees/:id"
                element={<ProtectedRoute module="employees" action="read"><EmployeeLedger /></ProtectedRoute>} />
              <Route path="/payroll"
                element={<ProtectedRoute module="employees" action="read"><Payroll /></ProtectedRoute>} />

              {/* Accounting */}
              <Route path="/accounting/chart-of-accounts"
                element={<ProtectedRoute module="accounting" action="read"><ChartOfAccounts /></ProtectedRoute>} />
              <Route path="/accounting/vouchers/new"
                element={<ProtectedRoute module="accounting" action="create"><ComingSoon title="New Voucher" /></ProtectedRoute>} />
              <Route path="/accounting/general-ledger"
                element={<ProtectedRoute module="accounting" action="read"><GeneralLedger /></ProtectedRoute>} />
              <Route path="/expenses"
                element={<ProtectedRoute module="expenses" action="read"><Expenses /></ProtectedRoute>} />

              {/* Reports */}
              <Route path="/reports/trial-balance"
                element={<ProtectedRoute module="reports" action="read"><ComingSoon title="Trial Balance" /></ProtectedRoute>} />
              <Route path="/reports/profit-and-loss"
                element={<ProtectedRoute module="reports" action="read"><ComingSoon title="Profit & Loss" /></ProtectedRoute>} />
              <Route path="/reports/balance-sheet"
                element={<ProtectedRoute module="reports" action="read"><ComingSoon title="Balance Sheet" /></ProtectedRoute>} />
              <Route path="/reports/payables"
                element={<ProtectedRoute module="reports" action="read"><ComingSoon title="AP Aging" /></ProtectedRoute>} />
              <Route path="/reports/receivables"
                element={<ProtectedRoute module="reports" action="read"><ComingSoon title="AR Aging" /></ProtectedRoute>} />
            </Route>

            {/* 404 catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
    </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
