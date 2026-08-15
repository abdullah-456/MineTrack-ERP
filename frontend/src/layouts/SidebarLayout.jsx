import { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import FiscalYearSelector from '../components/ui/FiscalYearSelector';
import NotificationBell from '../components/notifications/NotificationBell';
import {
  LayoutDashboard, Package, Users, Building2,
  TrendingUp, CreditCard, UserCheck, BookOpen, FileBarChart2, Landmark,
  ShieldCheck, ChevronDown, ChevronRight, LogOut, Menu,
  Zap, Search, ChevronLeft, Sun, Moon, Globe, Check,
  Store, Pickaxe, CircleDot, Layers, Factory, Gem, Crown, RotateCcw, Receipt, KeyRound, ShieldAlert, Ticket, Warehouse, ClipboardList, Calendar, CalendarCheck, CalendarOff, PartyPopper, Truck, FileText, Wrench } from 'lucide-react';

// ── Nav structure for regular shop users (uses translation keys) ─
const shopNavGroups = [
  {
    labelKey: 'navOperations',
    items: [
      { to: '/dashboard',         icon: LayoutDashboard, labelKey: 'dashboard' },
      { to: '/sales',             icon: TrendingUp,      labelKey: 'sales',          module: 'sales',        action: 'read' },
      { to: '/returns',           icon: RotateCcw,       labelKey: 'salesReturns',   module: 'returns',      action: 'read' },
      { to: '/gatepasses',        icon: Ticket,          labelKey: 'gatepasses',     module: 'sales',        action: 'read' },
    ]
  },
  {
    labelKey: 'navInventory',
    items: [
      { to: '/products',          icon: Package,         labelKey: 'products',       module: 'products',     action: 'read' },
      { to: '/inventory',         icon: Building2,       labelKey: 'stock',          module: 'inventory',    action: 'read' },
      { to: '/godowns',           icon: Warehouse,       labelKey: 'godowns',        module: 'inventory',    action: 'read' },
      { to: '/categories',        icon: BookOpen,        labelKey: 'categories',     module: 'products',     action: 'read' },
    ]
  },
  {
    labelKey: 'navProcurement',
    items: [
      { to: '/suppliers',         icon: Building2,       labelKey: 'suppliers',      module: 'suppliers',    action: 'read' },
      { to: '/invoices',          icon: CreditCard,      labelKey: 'invoices',       module: 'sales',        action: 'read' },
    ]
  },
  {
    labelKey: 'navPurchaseWorkflow',
    items: [
      { to: '/purchase-workflow/requisitions', icon: FileText, labelKey: 'purchaseRequisitions', module: 'purchases', action: 'read' },
      { to: '/purchase-workflow/approvals', icon: ShieldCheck, labelKey: 'departmentalApprovals', module: 'purchases', action: 'read' },
      { to: '/purchase-workflow/orders', icon: ClipboardList, labelKey: 'workflowPurchaseOrders', module: 'purchases', action: 'read' },
    ]
  },
  {
    labelKey: 'navCRM',
    items: [
      { to: '/customers',         icon: Users,           labelKey: 'customers',      module: 'customers',    action: 'read' },
    ]
  },
  {
    labelKey: 'navFinance',
    items: [
      { to: '/accounting/chart-of-accounts', icon: BookOpen,      labelKey: 'chartOfAccounts', module: 'accounting', action: 'read' },
      { to: '/accounting/vouchers/new',      icon: FileBarChart2, labelKey: 'voucherEntry',    module: 'accounting', action: 'create' },
      { to: '/accounting/general-ledger',    icon: TrendingUp,    labelKey: 'generalLedger',   module: 'accounting', action: 'read' },
      { to: '/expenses',                     icon: Receipt,       labelKey: 'expenses',        module: 'expenses',   action: 'read' },
      { to: '/assets',                       icon: Landmark,      labelKey: 'assets',          module: 'assets',     action: 'read' },
    ]
  },
  {
    labelKey: 'navReports',
    items: [
      { to: '/reports',                 icon: FileBarChart2, labelKey: 'reportsHub',    module: 'reports', action: 'read' },
      { to: '/reports/trial-balance',   icon: FileBarChart2, labelKey: 'trialBalance',  module: 'reports', action: 'read' },
      { to: '/reports/profit-and-loss', icon: TrendingUp,    labelKey: 'plStatement',   module: 'reports', action: 'read' },
      { to: '/reports/balance-sheet',   icon: BookOpen,      labelKey: 'balanceSheet',  module: 'reports', action: 'read' },
      { to: '/reports/equity-statement', icon: Landmark,     labelKey: 'equityStatement', module: 'reports', action: 'read' },
      { to: '/reports/cash-flow',       icon: CreditCard,    labelKey: 'cashFlowStatement', module: 'reports', action: 'read' },
    ]
  },
  {
    labelKey: 'navHR',
    items: [
      { to: '/employees',  icon: UserCheck,     labelKey: 'employees',  module: 'employees',  action: 'read' },
      { to: '/attendance', icon: CalendarCheck, labelKey: 'attendance', module: 'attendance', action: 'read' },
      { to: '/payroll',    icon: CreditCard,    labelKey: 'payroll',    module: 'employees',  action: 'read' },
      { to: '/leave',      icon: CalendarOff,   labelKey: 'leave',      module: 'leave',      action: 'read' },
      { to: '/holidays',   icon: PartyPopper,   labelKey: 'holidays',   module: 'holidays',   action: 'read' },
    ]
  },
  {
    labelKey: 'navMining',
    items: [
      { to: '/admin/mines', icon: Pickaxe, labelKey: 'mines', module: 'branches', action: 'read' },
      { to: '/admin/pits', icon: CircleDot, labelKey: 'pits', module: 'branches', action: 'read' },
      { to: '/admin/benches', icon: Layers, labelKey: 'benches', module: 'branches', action: 'read' },
      { to: '/admin/production', icon: Factory, labelKey: 'production', module: 'branches', action: 'read' },
      { to: '/admin/truck-loading', icon: Truck, labelKey: 'truckLoading', module: 'truck_loading', action: 'read' },
      { to: '/admin/minerals', icon: Gem, labelKey: 'minerals', module: 'branches', action: 'read' },
      { to: '/vehicles', icon: Truck, labelKey: 'vehicles', module: 'vehicles', action: 'read' },
    ]
  },
  {
    labelKey: 'navWorkshops',
    items: [
      { to: '/workshops/items', icon: Package, labelKey: 'workshopItems', module: 'workshops', action: 'read' },
      { to: '/workshops/jobs', icon: Wrench, labelKey: 'workshopJobs', module: 'workshops', action: 'read' },
    ]
  },
  {
    labelKey: 'navAdmin',
    items: [
      { to: '/admin/company-profile', icon: Store,     labelKey: 'companyProfile',   module: 'users', action: 'update' },
      { to: '/admin/users',      icon: ShieldCheck,   labelKey: 'users',            module: 'users', action: 'read' },
      { to: '/admin/audit-log',  icon: FileBarChart2, labelKey: 'auditLog',         module: 'users', action: 'read' },
      { to: '/admin/board-of-directors', icon: Crown, labelKey: 'boardOfDirectors', module: 'board_directors', action: 'read' },
      { to: '/admin/roles', icon: KeyRound, labelKey: 'roles', module: 'roles', action: 'read' },
      { to: '/admin/deletion-requests', icon: ShieldAlert, labelKey: 'deletionRequests', module: 'users', action: 'read' },
      { to: '/admin/fiscal-years', icon: Calendar, labelKey: 'fiscalYears', module: 'accounting', action: 'read' },
    ]
  },
];

// ── SuperAdmin-specific nav ─────────────────────────────────────
const superAdminNavGroups = [
  {
    labelKey: 'navPlatform',
    items: [
      { to: '/superadmin/dashboard', icon: LayoutDashboard, labelKey: 'platformDashboard' },
      { to: '/superadmin/shops',     icon: Store,            labelKey: 'shopManagement' },
    ]
  },
  // SuperAdmin also sees a condensed version of shop nav
  {
    labelKey: 'navAdmin',
    items: [
      { to: '/admin/users', icon: Users, labelKey: 'users' },
    ]
  },
];

// ── useClickOutside helper ──────────────────────────────────────
function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      handler(e);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

// ── NavGroup component ──────────────────────────────────────────
function NavGroup({ group, collapsed, can, t }) {
  const [open, setOpen] = useState(true);

  const visibleItems = group.items.filter(item =>
    !item.module || can(item.module, item.action)
  );
  if (visibleItems.length === 0) return null;

  return (
    <div className="mb-1">
      {!collapsed && (
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-1.5 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest">{t(group.labelKey)}</span>
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      )}
      {(open || collapsed) && (
        <div className="space-y-0.5">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-2' : ''}`
              }
              title={collapsed ? t(item.labelKey) : ''}
            >
              <item.icon className={`flex-shrink-0 ${collapsed ? 'w-5 h-5' : 'w-4 h-4'}`} />
              {!collapsed && <span>{t(item.labelKey)}</span>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Language Dropdown ───────────────────────────────────────────
function LangDropdown({ lang, setLang, t }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const langs = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'ur', label: 'اردو',    flag: '🇵🇰' },
  ];

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="topbar-btn flex items-center gap-1.5"
        title={t('language')}
        id="lang-toggle"
      >
        <Globe className="w-4 h-4" />
        <span className="text-xs font-semibold hidden sm:block">
          {lang === 'ur' ? 'اردو' : 'EN'}
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="dropdown-menu">
          {langs.map(l => (
            <div
              key={l.code}
              className={`dropdown-item ${lang === l.code ? 'active' : ''}`}
              onClick={() => { setLang(l.code); setOpen(false); }}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
              {lang === l.code && <Check className="w-3 h-3 ml-auto" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Theme Toggle Button ─────────────────────────────────────────
function ThemeToggle({ theme, toggleTheme, t }) {
  return (
    <button
      onClick={toggleTheme}
      className="topbar-btn"
      title={theme === 'dark' ? t('lightMode') : t('darkMode')}
      id="theme-toggle"
    >
      {theme === 'dark'
        ? <Sun  className="w-5 h-5" />
        : <Moon className="w-5 h-5" />
      }
    </button>
  );
}

// ── Main SidebarLayout ──────────────────────────────────────────
export default function SidebarLayout() {
  const { user, logout, can, isSuperAdmin, shopName } = useAuth();
  const { theme, toggleTheme, lang, setLang, t } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleColors = {
    super_admin: 'badge-purple',
    admin:       'badge-blue',
    accountant:  'badge-green',
    user:        'badge-yellow',
  };

  // Pick nav groups based on role
  const navGroups = isSuperAdmin() ? superAdminNavGroups : shopNavGroups;

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        sidebar fixed lg:relative z-30 h-full flex flex-col
        transition-all duration-300
        ${collapsed ? 'w-16' : 'w-64'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo / Brand */}
        <div
          className={`flex items-center gap-3 px-4 py-4 ${collapsed ? 'justify-center' : ''}`}
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isSuperAdmin()
              ? 'bg-gradient-to-br from-amber-500 to-orange-600'
              : 'bg-gradient-to-br from-brand-500 to-purple-600'
          }`}>
            {isSuperAdmin() ? <Crown className="w-4 h-4 text-white" /> : <Zap className="w-4 h-4 text-white" />}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                {isSuperAdmin() ? `${t('appName')} Platform` : (shopName || t('appName'))}
              </h1>
              <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                {isSuperAdmin() ? t('platformAdmin') : t('appTagline')}
              </p>
            </div>
          )}
        </div>

        {/* SuperAdmin shop indicator pill */}
        {!isSuperAdmin() && shopName && !collapsed && (
          <div className="px-3 pt-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: 'var(--bg-elevated)' }}>
              <Store className="w-3 h-3 text-brand-400 flex-shrink-0" />
              <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                {shopName}
              </span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {navGroups.map(group => (
            <NavGroup key={group.labelKey} group={group} collapsed={collapsed} can={can} t={t} />
          ))}
        </nav>

        {/* User footer */}
        <div
          className={`p-3 ${collapsed ? 'flex justify-center' : ''}`}
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          {!collapsed ? (
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${
                isSuperAdmin()
                  ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                  : 'bg-gradient-to-br from-brand-500 to-purple-600'
              }`}>
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{user?.name}</p>
                <span className={`badge text-[10px] ${roleColors[user?.role] || 'badge-blue'}`}>
                  {user?.role === 'super_admin' ? '👑 Super Admin' :
                   user?.role === 'admin'       ? '🏢 Admin' :
                   user?.role === 'accountant'  ? '📊 Accountant' : '🛒 Cashier'}
                </span>
              </div>
              <button onClick={handleLogout} className="transition-colors p-1" style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} className="transition-colors p-1" style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full border items-center justify-center transition-all z-10 hover:bg-brand-600"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-input)',
            color: 'var(--text-secondary)',
          }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="topbar flex items-center gap-4 px-6 py-3">
          {/* Mobile menu */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="topbar-btn lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <div className="search-bar flex-1 flex items-center gap-3 max-w-sm">
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={t('quickSearch')}
              className="bg-transparent text-sm outline-none w-full"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-2">
            {!isSuperAdmin() && <FiscalYearSelector />}
            <ThemeToggle theme={theme} toggleTheme={toggleTheme} t={t} />
            <LangDropdown lang={lang} setLang={setLang} t={t} />

            {/* Notifications */}
            {!isSuperAdmin() && <NotificationBell />}

            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${
              isSuperAdmin()
                ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                : 'bg-gradient-to-br from-brand-500 to-purple-600'
            }`}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 relative z-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
