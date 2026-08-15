import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import SidebarLayout from './layouts/SidebarLayout';
import ShopSetupModal from './components/modals/ShopSetupModal';
import YearEndCloseModal from './components/modals/YearEndCloseModal';
import { FiscalYearProvider, useFiscalYear } from './context/FiscalYearContext';
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
import BoardMemberLedger from './pages/admin/BoardMemberLedger';
import Mines from './pages/admin/Mines';
import MineFormPage from './pages/admin/MineFormPage';
import MineDetailPage from './pages/admin/MineDetailPage';
import Pits from './pages/admin/Pits';
import PitFormPage from './pages/admin/PitFormPage';
import PitDetailPage from './pages/admin/PitDetailPage';
import Benches from './pages/admin/Benches';
import BenchFormPage from './pages/admin/BenchFormPage';
import BenchDetailPage from './pages/admin/BenchDetailPage';
import Minerals from './pages/admin/Minerals';
import Vehicles from './pages/admin/Vehicles';
import HeavyMachineryList from './pages/machinery/HeavyMachineryList';
import HeavyMachineryLogPage from './pages/machinery/HeavyMachineryLogPage';
import Production from './pages/admin/Production';
import ProductionFormPage from './pages/admin/ProductionFormPage';
import TruckLoading from './pages/admin/TruckLoading';
import TruckLoadingFormPage from './pages/admin/TruckLoadingFormPage';
import Expenses from './pages/expenses/Expenses';
import Roles from './pages/admin/Roles';
import DeletionRequests from './pages/admin/DeletionRequests';
import CompanyProfile from './pages/admin/CompanyProfile';

// Business modules
import Suppliers  from './pages/suppliers/Suppliers';
import SupplierLedger from './pages/suppliers/SupplierLedger';
import SupplierStatementPrint from './pages/suppliers/SupplierStatementPrint';
import EmployeeLedger from './pages/employees/EmployeeLedger';
import CustomerLedger from './pages/customers/CustomerLedger';
import EmployeeStatementPrint from './pages/employees/EmployeeStatementPrint';
import EmployeeSlipPrint from './pages/employees/EmployeeSlipPrint';
import EmployeeClearancePrint from './pages/employees/EmployeeClearancePrint';
import Payroll from './pages/employees/Payroll';
import Attendance from './pages/employees/Attendance';
import Leave from './pages/employees/Leave';
import HolidayCalendar from './pages/employees/HolidayCalendar';
import ChartOfAccounts from './pages/accounting/ChartOfAccounts';
import Assets from './pages/accounting/Assets';
import JournalEntry from './pages/accounting/JournalEntry';
import GeneralLedger from './pages/accounting/GeneralLedger';
import TrialBalance from './pages/reports/TrialBalance';
import ProfitAndLoss from './pages/reports/ProfitAndLoss';
import BalanceSheet from './pages/reports/BalanceSheet';
import EquityStatement from './pages/reports/EquityStatement';
import CashFlowStatement from './pages/reports/CashFlowStatement';
import ReportsHub from './pages/reports/ReportsHub';
import SalesReport from './pages/reports/SalesReport';
import ModuleReport from './pages/reports/ModuleReport';
import Products   from './pages/products/Products';
import Categories from './pages/products/Categories';
import Inventory  from './pages/inventory/Inventory';
import Godowns    from './pages/inventory/Godowns';
import Customers  from './pages/customers/Customers';
import EmployeeFormPage from './pages/employees/EmployeeFormPage';
import Employees  from './pages/employees/Employees';
import Sales      from './pages/sales/Sales';
import SalesReturns from './pages/returns/SalesReturns';
import Invoices          from './pages/invoices/Invoices';
import InvoicePrintPage  from './pages/invoices/InvoicePrintPage';
import VoucherPrintPage      from './pages/accounting/VoucherPrintPage';
import LedgerVoucherPrint   from './pages/accounting/LedgerVoucherPrint';
import GatePasses        from './pages/gatepasses/GatePasses';
import GatePassPrintPage  from './pages/gatepasses/GatePassPrintPage';
import PurchaseOrderPrintPage from './pages/purchases/PurchaseOrderPrintPage';
import PurchaseRequisitions from './pages/purchases/PurchaseRequisitions';
import PurchaseRequisitionFormPage from './pages/purchases/PurchaseRequisitionFormPage';
import PurchaseRequisitionViewPage from './pages/purchases/PurchaseRequisitionViewPage';
import PurchaseRequisitionPrintPage from './pages/purchases/PurchaseRequisitionPrintPage';
import DepartmentalApprovals from './pages/purchases/DepartmentalApprovals';
import DepartmentalApprovalFormPage from './pages/purchases/DepartmentalApprovalFormPage';
import DepartmentalApprovalViewPage from './pages/purchases/DepartmentalApprovalViewPage';
import DepartmentalApprovalPrintPage from './pages/purchases/DepartmentalApprovalPrintPage';
import PurchaseWorkflowOrders from './pages/purchases/PurchaseWorkflowOrders';
import PurchaseWorkflowOrderFormPage from './pages/purchases/PurchaseWorkflowOrderFormPage';
import PurchaseWorkflowOrderViewPage from './pages/purchases/PurchaseWorkflowOrderViewPage';
import PurchaseWorkflowOrderPrintPage from './pages/purchases/PurchaseWorkflowOrderPrintPage';
import WorkshopItems from './pages/workshops/WorkshopItems';
import WorkshopStockLedger from './pages/workshops/WorkshopStockLedger';
import WorkshopJobs from './pages/workshops/WorkshopJobs';
import WorkshopJobFormPage from './pages/workshops/WorkshopJobFormPage';
import WorkshopJobViewPage from './pages/workshops/WorkshopJobViewPage';
import WorkshopJobPrintPage from './pages/workshops/WorkshopJobPrintPage';
import FiscalYears from './pages/admin/FiscalYears';

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

// Global modal overlay — renders financial setup / year-end close over the whole app
function GlobalModals() {
  const { setupModal, onSetupComplete, closeFinancialSetup, user } = useAuth();
  const fy = useFiscalYear();
  const [yearEndOpen, setYearEndOpen] = useState(false);

  useEffect(() => {
    if (!user || user.role === 'super_admin') {
      setYearEndOpen(false);
      return;
    }
    if (setupModal.open) {
      setYearEndOpen(false);
      return;
    }
    const shouldShow = fy.yearEndPrompt && fy.canClose && !fy.isCloseDismissed();
    setYearEndOpen(shouldShow);
  }, [user, setupModal.open, fy.yearEndPrompt, fy.canClose, fy.isCloseDismissed]);

  return (
    <>
      {setupModal.open && (
        <ShopSetupModal
          shopName={user?.shop_name || 'Your Shop'}
          onComplete={onSetupComplete}
          onClose={setupModal.dismissible ? closeFinancialSetup : undefined}
          initialStep={setupModal.initialStep}
          focusMode={setupModal.focusMode}
          dismissible={setupModal.dismissible}
        />
      )}
      <YearEndCloseModal open={yearEndOpen} onClose={() => setYearEndOpen(false)} />
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
    <ToastProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FiscalYearProvider>
          <BrowserRouter>
            <GlobalModals />
            <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RootRedirect />} />

            {/* ── Standalone Print Pages (new tab, no sidebar, auth required) ── */}
            <Route path="/invoice/:invoiceId" element={<ProtectedRoute><InvoicePrintPage /></ProtectedRoute>} />
            <Route path="/gatepass/:id" element={<ProtectedRoute><GatePassPrintPage /></ProtectedRoute>} />
            <Route path="/purchase-order/:id" element={<ProtectedRoute><PurchaseOrderPrintPage /></ProtectedRoute>} />
            <Route path="/purchase-requisition/:id" element={<ProtectedRoute><PurchaseRequisitionPrintPage /></ProtectedRoute>} />
            <Route path="/departmental-approval/:id" element={<ProtectedRoute><DepartmentalApprovalPrintPage /></ProtectedRoute>} />
            <Route path="/purchase-workflow-order/:id" element={<ProtectedRoute><PurchaseWorkflowOrderPrintPage /></ProtectedRoute>} />
            <Route path="/workshop-job/:id" element={<ProtectedRoute><WorkshopJobPrintPage /></ProtectedRoute>} />
            <Route path="/vouchers/:voucherId" element={<ProtectedRoute><VoucherPrintPage /></ProtectedRoute>} />
            <Route path="/ledger-voucher" element={<ProtectedRoute><LedgerVoucherPrint /></ProtectedRoute>} />
            <Route path="/suppliers/:id/statement" element={<ProtectedRoute><SupplierStatementPrint /></ProtectedRoute>} />
            <Route path="/employees/:id/statement" element={<ProtectedRoute><EmployeeStatementPrint /></ProtectedRoute>} />
            <Route path="/employees/:id/clearance" element={<ProtectedRoute><EmployeeClearancePrint /></ProtectedRoute>} />
            <Route path="/employees/:employeeId/slip/:txnId" element={<ProtectedRoute><EmployeeSlipPrint /></ProtectedRoute>} />

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
              <Route path="/admin/board-of-directors/:id/ledger"
                element={<ProtectedRoute module="board_directors" action="read"><BoardMemberLedger /></ProtectedRoute>} />
              <Route path="/admin/mines"
                element={<ProtectedRoute module="branches" action="read"><Mines /></ProtectedRoute>} />
              <Route path="/admin/mines/create"
                element={<ProtectedRoute module="branches" action="create"><MineFormPage /></ProtectedRoute>} />
              <Route path="/admin/mines/:id/edit"
                element={<ProtectedRoute module="branches" action="update"><MineFormPage /></ProtectedRoute>} />
              <Route path="/admin/mines/:id"
                element={<ProtectedRoute module="branches" action="read"><MineDetailPage /></ProtectedRoute>} />
              <Route path="/admin/pits"
                element={<ProtectedRoute module="branches" action="read"><Pits /></ProtectedRoute>} />
              <Route path="/admin/pits/create"
                element={<ProtectedRoute module="branches" action="create"><PitFormPage /></ProtectedRoute>} />
              <Route path="/admin/pits/:id/edit"
                element={<ProtectedRoute module="branches" action="update"><PitFormPage /></ProtectedRoute>} />
              <Route path="/admin/pits/:id"
                element={<ProtectedRoute module="branches" action="read"><PitDetailPage /></ProtectedRoute>} />
              <Route path="/admin/benches"
                element={<ProtectedRoute module="branches" action="read"><Benches /></ProtectedRoute>} />
              <Route path="/admin/benches/create"
                element={<ProtectedRoute module="branches" action="create"><BenchFormPage /></ProtectedRoute>} />
              <Route path="/admin/benches/:id/edit"
                element={<ProtectedRoute module="branches" action="update"><BenchFormPage /></ProtectedRoute>} />
              <Route path="/admin/benches/:id"
                element={<ProtectedRoute module="branches" action="read"><BenchDetailPage /></ProtectedRoute>} />
              <Route path="/admin/production"
                element={<ProtectedRoute module="branches" action="read"><Production /></ProtectedRoute>} />
              <Route path="/admin/production/create"
                element={<ProtectedRoute module="branches" action="create"><ProductionFormPage /></ProtectedRoute>} />
              <Route path="/admin/production/:id/edit"
                element={<ProtectedRoute module="branches" action="update"><ProductionFormPage /></ProtectedRoute>} />
              <Route path="/admin/truck-loading"
                element={<ProtectedRoute module="truck_loading" action="read"><TruckLoading /></ProtectedRoute>} />
              <Route path="/admin/truck-loading/create"
                element={<ProtectedRoute module="truck_loading" action="create"><TruckLoadingFormPage /></ProtectedRoute>} />
              <Route path="/admin/truck-loading/:id/edit"
                element={<ProtectedRoute module="truck_loading" action="update"><TruckLoadingFormPage /></ProtectedRoute>} />
              <Route path="/admin/minerals"
                element={<ProtectedRoute module="branches" action="read"><Minerals /></ProtectedRoute>} />
              <Route path="/vehicles"
                element={<ProtectedRoute module="vehicles" action="read"><Vehicles /></ProtectedRoute>} />
              <Route path="/heavy-machinery"
                element={<ProtectedRoute module="heavy_machinery" action="read"><HeavyMachineryList /></ProtectedRoute>} />
              <Route path="/heavy-machinery/:id/logs"
                element={<ProtectedRoute module="heavy_machinery" action="read"><HeavyMachineryLogPage /></ProtectedRoute>} />
              <Route path="/admin/roles"
                element={<ProtectedRoute module="roles" action="read"><Roles /></ProtectedRoute>} />
              <Route path="/admin/deletion-requests"
                element={<ProtectedRoute module="users" action="read"><DeletionRequests /></ProtectedRoute>} />
              <Route path="/admin/company-profile"
                element={<ProtectedRoute module="users" action="update"><CompanyProfile /></ProtectedRoute>} />
              <Route path="/admin/fiscal-years"
                element={<ProtectedRoute module="accounting" action="read"><FiscalYears /></ProtectedRoute>} />

              {/* Sales */}
              <Route path="/sales"
                element={<ProtectedRoute module="sales" action="read"><Sales /></ProtectedRoute>} />
              <Route path="/sales/:id"
                element={<ProtectedRoute module="sales" action="read"><ComingSoon title="Sale Detail" /></ProtectedRoute>} />
              <Route path="/gatepasses"
                element={<ProtectedRoute module="sales" action="read"><GatePasses /></ProtectedRoute>} />
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
              <Route path="/godowns"
                element={<ProtectedRoute module="inventory" action="read"><Godowns /></ProtectedRoute>} />
              <Route path="/stock-transfers/new"
                element={<ProtectedRoute module="inventory" action="create"><ComingSoon title="Stock Transfer" /></ProtectedRoute>} />

              {/* Procurement & Purchase Workflow */}
              <Route path="/purchase-orders" element={<Navigate to="/purchase-workflow/orders" replace />} />
              <Route path="/purchase-workflow/requisitions"
                element={<ProtectedRoute module="purchases" action="read"><PurchaseRequisitions /></ProtectedRoute>} />
              <Route path="/purchase-workflow/requisitions/create"
                element={<ProtectedRoute module="purchases" action="create"><PurchaseRequisitionFormPage /></ProtectedRoute>} />
              <Route path="/purchase-workflow/requisitions/:id/edit"
                element={<ProtectedRoute module="purchases" action="update"><PurchaseRequisitionFormPage /></ProtectedRoute>} />
              <Route path="/purchase-workflow/requisitions/:id"
                element={<ProtectedRoute module="purchases" action="read"><PurchaseRequisitionViewPage /></ProtectedRoute>} />
              <Route path="/purchase-workflow/approvals"
                element={<ProtectedRoute module="purchases" action="read"><DepartmentalApprovals /></ProtectedRoute>} />
              <Route path="/purchase-workflow/approvals/create"
                element={<ProtectedRoute module="purchases" action="approve"><DepartmentalApprovalFormPage /></ProtectedRoute>} />
              <Route path="/purchase-workflow/approvals/:id"
                element={<ProtectedRoute module="purchases" action="read"><DepartmentalApprovalViewPage /></ProtectedRoute>} />
              <Route path="/purchase-workflow/orders"
                element={<ProtectedRoute module="purchases" action="read"><PurchaseWorkflowOrders /></ProtectedRoute>} />
              <Route path="/purchase-workflow/orders/create"
                element={<ProtectedRoute module="purchases" action="create"><PurchaseWorkflowOrderFormPage /></ProtectedRoute>} />
              <Route path="/purchase-workflow/orders/:id"
                element={<ProtectedRoute module="purchases" action="read"><PurchaseWorkflowOrderViewPage /></ProtectedRoute>} />

              {/* Workshops */}
              <Route path="/workshops/items"
                element={<ProtectedRoute module="workshops" action="read"><WorkshopItems /></ProtectedRoute>} />
              <Route path="/workshops/items/:id/ledger"
                element={<ProtectedRoute module="workshops" action="read"><WorkshopStockLedger /></ProtectedRoute>} />
              <Route path="/workshops/jobs"
                element={<ProtectedRoute module="workshops" action="read"><WorkshopJobs /></ProtectedRoute>} />
              <Route path="/workshops/jobs/create"
                element={<ProtectedRoute module="workshops" action="create"><WorkshopJobFormPage /></ProtectedRoute>} />
              <Route path="/workshops/jobs/:id/edit"
                element={<ProtectedRoute module="workshops" action="update"><WorkshopJobFormPage /></ProtectedRoute>} />
              <Route path="/workshops/jobs/:id"
                element={<ProtectedRoute module="workshops" action="read"><WorkshopJobViewPage /></ProtectedRoute>} />

              <Route path="/suppliers"
                element={<ProtectedRoute module="suppliers" action="read"><Suppliers /></ProtectedRoute>} />
              <Route path="/suppliers/:id"
                element={<ProtectedRoute module="suppliers" action="read"><SupplierLedger /></ProtectedRoute>} />
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
              <Route path="/employees/create"
                element={<ProtectedRoute module="employees" action="create"><EmployeeFormPage /></ProtectedRoute>} />
              <Route path="/employees/:id/edit"
                element={<ProtectedRoute module="employees" action="update"><EmployeeFormPage /></ProtectedRoute>} />
              <Route path="/employees/:id"
                element={<ProtectedRoute module="employees" action="read"><EmployeeLedger /></ProtectedRoute>} />
              <Route path="/payroll"
                element={<ProtectedRoute module="employees" action="read"><Payroll /></ProtectedRoute>} />
              <Route path="/attendance"
                element={<ProtectedRoute module="attendance" action="read"><Attendance /></ProtectedRoute>} />
              <Route path="/leave"
                element={<ProtectedRoute module="leave" action="read"><Leave /></ProtectedRoute>} />
              <Route path="/holidays"
                element={<ProtectedRoute module="holidays" action="read"><HolidayCalendar /></ProtectedRoute>} />

              {/* Accounting */}
              <Route path="/accounting/chart-of-accounts"
                element={<ProtectedRoute module="accounting" action="read"><ChartOfAccounts /></ProtectedRoute>} />
              <Route path="/assets"
                element={<ProtectedRoute module="assets" action="read"><Assets /></ProtectedRoute>} />
              <Route path="/accounting/vouchers/new"
                element={<ProtectedRoute module="accounting" action="create"><JournalEntry /></ProtectedRoute>} />
              <Route path="/accounting/general-ledger"
                element={<ProtectedRoute module="accounting" action="read"><GeneralLedger /></ProtectedRoute>} />
              <Route path="/expenses"
                element={<ProtectedRoute module="expenses" action="read"><Expenses /></ProtectedRoute>} />

              {/* Reports */}
              <Route path="/reports"
                element={<ProtectedRoute module="reports" action="read"><ReportsHub /></ProtectedRoute>} />
              <Route path="/reports/sales"
                element={<ProtectedRoute module="sales" action="read"><SalesReport /></ProtectedRoute>} />
              <Route path="/reports/purchases"
                element={<ProtectedRoute module="purchases" action="read"><ModuleReport moduleKey="purchases" /></ProtectedRoute>} />
              <Route path="/reports/inventory"
                element={<ProtectedRoute module="inventory" action="read"><ModuleReport moduleKey="inventory" /></ProtectedRoute>} />
              <Route path="/reports/customers"
                element={<ProtectedRoute module="customers" action="read"><ModuleReport moduleKey="customers" /></ProtectedRoute>} />
              <Route path="/reports/suppliers"
                element={<ProtectedRoute module="suppliers" action="read"><ModuleReport moduleKey="suppliers" /></ProtectedRoute>} />
              <Route path="/reports/expenses"
                element={<ProtectedRoute module="expenses" action="read"><ModuleReport moduleKey="expenses" /></ProtectedRoute>} />
              <Route path="/reports/accounting"
                element={<ProtectedRoute module="accounting" action="read"><ModuleReport moduleKey="accounting" /></ProtectedRoute>} />
              <Route path="/reports/employees"
                element={<ProtectedRoute module="employees" action="read"><ModuleReport moduleKey="employees" /></ProtectedRoute>} />
              <Route path="/reports/board"
                element={<ProtectedRoute module="board_directors" action="read"><ModuleReport moduleKey="board" /></ProtectedRoute>} />
              <Route path="/reports/production"
                element={<ProtectedRoute module="branches" action="read"><ModuleReport moduleKey="production" /></ProtectedRoute>} />
              <Route path="/reports/trial-balance"
                element={<ProtectedRoute module="reports" action="read"><TrialBalance /></ProtectedRoute>} />
              <Route path="/reports/profit-and-loss"
                element={<ProtectedRoute module="reports" action="read"><ProfitAndLoss /></ProtectedRoute>} />
              <Route path="/reports/balance-sheet"
                element={<ProtectedRoute module="reports" action="read"><BalanceSheet /></ProtectedRoute>} />
              <Route path="/reports/equity-statement"
                element={<ProtectedRoute module="reports" action="read"><EquityStatement /></ProtectedRoute>} />
              <Route path="/reports/cash-flow"
                element={<ProtectedRoute module="reports" action="read"><CashFlowStatement /></ProtectedRoute>} />
              <Route path="/reports/payables"
                element={<ProtectedRoute module="reports" action="read"><ComingSoon title="AP Aging" /></ProtectedRoute>} />
              <Route path="/reports/receivables"
                element={<ProtectedRoute module="reports" action="read"><ComingSoon title="AR Aging" /></ProtectedRoute>} />
            </Route>

            {/* 404 catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </FiscalYearProvider>
      </AuthProvider>
    </QueryClientProvider>
    </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
