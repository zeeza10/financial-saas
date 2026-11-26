import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  Landmark,
  Layers,
  LogOut,
  Menu,
  PieChart,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  ORG_ROLES,
  hasRolePermission,
  type AccountDto,
  type AssetDto,
  type AuditEventDto,
  type BalanceSheetReportDto,
  type BankAccountDto,
  type BankTransactionDto,
  type CashFlowReportDto,
  type DashboardSummaryDto,
  type InvoiceBillDto,
  type JournalEntryDto,
  type LiabilityDto,
  type MemberDto,
  type OrganizationDto,
  type OrgRole,
  type PartyDto,
  type PeriodDto,
  type ProfitDistributionDto,
  type ProfitShareAgreementDto,
  type ReconciliationDto,
  type SalaryRunDto,
  type TrialBalanceReportDto,
} from '@financial-saas/contracts';
import type { ProfitAndLossSummary } from '@financial-saas/ledger-core';
import { apiClient, type SessionUser } from './apiClient.js';
import { LedgerPanel } from './components/LedgerPanel.js';
import { BankingPanel } from './components/BankingPanel.js';
import { OperationsPanel } from './components/OperationsPanel.js';
import { InvestorsPayrollPanel } from './components/InvestorsPayrollPanel.js';
import { DashboardPanel } from './components/DashboardPanel.js';
import { ReportsPanel } from './components/ReportsPanel.js';
import {
  EmptyState,
  StatusBadge,
  ToastHost,
  badgeToneForStatus,
  type ToastItem,
} from './components/ui/DesignSystem.js';

type ActiveTab =
  | 'dashboard'
  | 'overview'
  | 'coa'
  | 'journals'
  | 'banking'
  | 'operations'
  | 'investors'
  | 'reports'
  | 'periods'
  | 'members'
  | 'audit';

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingOrgData, setLoadingOrgData] = useState(false);
  const [devAutoLoginAvailable, setDevAutoLoginAvailable] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [orgs, setOrgs] = useState<OrganizationDto[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [tab, setTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  // Create org form
  const [orgName, setOrgName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [country, setCountry] = useState('US');

  // Phase 3 & 4 org data
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('accountant');
  const [auditEvents, setAuditEvents] = useState<AuditEventDto[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [chainValid, setChainValid] = useState<boolean | null>(null);

  const [accounts, setAccounts] = useState<AccountDto[]>([]);
  const [entries, setEntries] = useState<JournalEntryDto[]>([]);
  const [periods, setPeriods] = useState<PeriodDto[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceReportDto | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccountDto[]>([]);
  const [bankTxs, setBankTxs] = useState<BankTransactionDto[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationDto[]>([]);
  const [parties, setParties] = useState<PartyDto[]>([]);
  const [invoicesBills, setInvoicesBills] = useState<InvoiceBillDto[]>([]);
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [liabilities, setLiabilities] = useState<LiabilityDto[]>([]);
  const [agreements, setAgreements] = useState<ProfitShareAgreementDto[]>([]);
  const [distributions, setDistributions] = useState<ProfitDistributionDto[]>([]);
  const [salaryRuns, setSalaryRuns] = useState<SalaryRunDto[]>([]);

  // Phase 6 Dashboard & Reports filters/state
  const todayIso = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(`${todayIso.slice(0, 4)}-01-01`);
  const [endDate, setEndDate] = useState(todayIso);
  const [filterAccountId, setFilterAccountId] = useState('');
  const [filterPartyId, setFilterPartyId] = useState('');
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummaryDto | null>(null);
  const [pnlReport, setPnlReport] = useState<ProfitAndLossSummary | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetReportDto | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowReportDto | null>(null);

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;

  const pushToast = useCallback(
    (title: string, detail?: string, tone: ToastItem['tone'] = 'success') => {
      const id = crypto.randomUUID();
      setToasts((prev) => [
        ...prev.slice(-3),
        { id, title, ...(detail ? { detail } : {}), tone },
      ]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setProfileOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const session = await apiClient.getSession();
        if (session?.authenticated) {
          setUser(session.user);
        } else {
          const devUser = await apiClient.tryDevAutoLogin();
          if (devUser) {
            setDevAutoLoginAvailable(true);
            setUser(devUser);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to check session');
      } finally {
        setLoadingSession(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const list = await apiClient.listOrganizations();
        setOrgs(list);
        if (list.length > 0 && !activeOrgId) {
          setActiveOrgId(list[0]!.id);
        } else if (list.length === 0) {
          setTab('overview');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load organizations');
      }
    })();
  }, [user, activeOrgId]);

  const refreshActiveOrgData = useCallback(async () => {
    if (!activeOrg) return;
    setLoadingOrgData(true);
    const tasks: Promise<void>[] = [];

    if (hasRolePermission(activeOrg.role, 'accounts:read')) {
      tasks.push(apiClient.listAccounts(activeOrg.id).then(setAccounts));
    }
    if (hasRolePermission(activeOrg.role, 'reports:read')) {
      tasks.push(apiClient.listJournalEntries(activeOrg.id).then(setEntries));
      tasks.push(apiClient.listPeriods(activeOrg.id).then(setPeriods));
      tasks.push(
        apiClient
          .getTrialBalance(activeOrg.id, new Date().toISOString().slice(0, 10))
          .then(setTrialBalance)
      );
    }
    if (hasRolePermission(activeOrg.role, 'banking:read')) {
      tasks.push(apiClient.listBankAccounts(activeOrg.id).then(setBankAccounts));
      tasks.push(apiClient.listBankTransactions(activeOrg.id).then(setBankTxs));
      tasks.push(apiClient.listReconciliations(activeOrg.id).then(setReconciliations));
    }
    if (hasRolePermission(activeOrg.role, 'organizations:read')) {
      tasks.push(apiClient.listParties(activeOrg.id).then(setParties));
    }
    if (
      hasRolePermission(activeOrg.role, 'reports:read') ||
      hasRolePermission(activeOrg.role, 'reports:read_scoped')
    ) {
      const filterOpts = {
        startDate,
        endDate,
        ...(filterAccountId ? { accountId: filterAccountId } : {}),
        ...(filterPartyId ? { partyId: filterPartyId } : {}),
      };
      tasks.push(apiClient.getDashboard(activeOrg.id, filterOpts).then(setDashboardSummary));
      tasks.push(apiClient.getProfitAndLoss(activeOrg.id, filterOpts).then(setPnlReport));
      tasks.push(apiClient.getBalanceSheet(activeOrg.id, endDate).then(setBalanceSheet));
      tasks.push(apiClient.getCashFlow(activeOrg.id, { startDate, endDate }).then(setCashFlow));
    }
    if (hasRolePermission(activeOrg.role, 'reports:read')) {
      tasks.push(apiClient.listInvoicesBills(activeOrg.id).then(setInvoicesBills));
      tasks.push(apiClient.listAssets(activeOrg.id).then(setAssets));
      tasks.push(apiClient.listLiabilities(activeOrg.id).then(setLiabilities));
      tasks.push(apiClient.listSalaryRuns(activeOrg.id).then(setSalaryRuns));
    }
    if (hasRolePermission(activeOrg.role, 'profit_sharing:read')) {
      tasks.push(apiClient.listProfitShareAgreements(activeOrg.id).then(setAgreements));
      tasks.push(apiClient.listProfitDistributions(activeOrg.id).then(setDistributions));
    }
    if (hasRolePermission(activeOrg.role, 'members:read')) {
      tasks.push(apiClient.listMembers(activeOrg.id).then(setMembers));
    }
    if (hasRolePermission(activeOrg.role, 'audit:read')) {
      tasks.push(apiClient.listAuditEvents(activeOrg.id).then(setAuditEvents));
    }
    try {
      await Promise.all(tasks);
    } finally {
      setLoadingOrgData(false);
    }
  }, [activeOrg, startDate, endDate, filterAccountId, filterPartyId]);

  useEffect(() => {
    if (!activeOrg) return;
    setError(null);
    void refreshActiveOrgData().catch((e) =>
      setError(e instanceof Error ? e.message : 'Unable to load organization data')
    );
  }, [activeOrg, tab, refreshActiveOrgData]);

  // Real actionable notifications computed solely from live state
  const alerts = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; target: ActiveTab; tone: 'warning' | 'danger' | 'info' }> = [];
    const drafts = entries.filter((e) => e.status === 'draft');
    if (drafts.length > 0) {
      items.push({
        id: 'drafts',
        title: `${drafts.length} unposted journal draft(s)`,
        detail: 'Review and post drafts into the general ledger.',
        target: 'journals',
        tone: 'warning',
      });
    }
    const dups = bankTxs.filter((t) => t.status === 'duplicate_held');
    if (dups.length > 0) {
      items.push({
        id: 'dups',
        title: `${dups.length} duplicate bank transaction(s) held`,
        detail: 'Blocked by BR-013 duplicate protection.',
        target: 'banking',
        tone: 'info',
      });
    }
    const openDocs = invoicesBills.filter((d) => d.status !== 'settled');
    if (openDocs.length > 0) {
      items.push({
        id: 'open-docs',
        title: `${openDocs.length} open invoice(s)/bill(s)`,
        detail: 'Track outstanding payables and receivables.',
        target: 'operations',
        tone: 'info',
      });
    }
    if (trialBalance && !trialBalance.is_balanced) {
      items.push({
        id: 'tb-unbal',
        title: 'Trial Balance variance detected',
        detail: 'Debits do not equal Credits — verify ledger integrity.',
        target: 'periods',
        tone: 'danger',
      });
    }
    return items;
  }, [entries, bankTxs, invoicesBills, trialBalance]);

  const filteredAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return auditEvents;
    return auditEvents.filter(
      (ev) =>
        ev.action.toLowerCase().includes(q) ||
        ev.entity_type.toLowerCase().includes(q) ||
        ev.row_hash.toLowerCase().includes(q)
    );
  }, [auditEvents, auditSearch]);

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAuthMessage(null);
    try {
      if (authMode === 'signup') {
        await apiClient.signup(email, password, displayName);
        setAuthMessage('Check your email to verify your account before signing in.');
        setAuthMode('login');
      } else {
        const loggedIn = await apiClient.login(email, password);
        setUser(loggedIn);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  }

  async function handleCreateOrg(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await apiClient.createOrganization({
        name: orgName,
        base_currency: baseCurrency.toUpperCase(),
        country: country.toUpperCase(),
        fiscal_year_start_month: 1,
      });
      setOrgs((prev) => [...prev, created]);
      setActiveOrgId(created.id);
      setOrgName('');
      pushToast('Organization created', `${created.name} (${created.base_currency})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!activeOrg) return;
    setError(null);
    try {
      const member = await apiClient.inviteMember(activeOrg.id, {
        email: inviteEmail,
        role: inviteRole,
      });
      setMembers((prev) => [...prev, member]);
      setInviteEmail('');
      pushToast('Invitation recorded', `${member.email ?? inviteEmail} (${member.role})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member');
    }
  }

  async function handleVerifyChain() {
    if (!activeOrg) return;
    setError(null);
    try {
      const valid = await apiClient.verifyAuditChain(activeOrg.id);
      setChainValid(valid);
      pushToast(
        valid ? 'Audit hash chain verified' : 'Audit hash chain mismatch',
        valid ? 'All records cryptographically intact' : undefined,
        valid ? 'success' : 'error'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  }

  if (loadingSession) {
    return (
      <main className="auth-shell">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="lc-brand-mark" style={{ margin: '0 auto 0.75rem' }}>
            <ShieldCheck size={22} />
          </div>
          <p className="muted">Initializing secure session…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="auth-heading">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
            <div className="lc-brand-mark">
              <ShieldCheck size={20} aria-hidden="true" />
            </div>
            <div>
              <h1 id="auth-heading" style={{ margin: 0, fontSize: '1.25rem' }}>
                LedgerCore SaaS
              </h1>
              <div className="muted">Enterprise Double-Entry Finance</div>
            </div>
          </div>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            Multi-tenant financial control protected by BFF HttpOnly sessions and Postgres RLS.
          </p>
          {error && (
            <div role="alert" className="alert-error">
              {error}
            </div>
          )}
          {authMessage && (
            <div style={{ marginBottom: '0.75rem' }}>
              <StatusBadge tone="success">{authMessage}</StatusBadge>
            </div>
          )}
          <form className="form-grid" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' && (
              <label>
                Full Name
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            <label>
              Work Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@company.com"
              />
            </label>
            <label>
              Password (min 12 characters)
              <input
                type="password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit" className="btn">
              {authMode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <div style={{ marginTop: '0.85rem', display: 'grid', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
            >
              {authMode === 'login' ? 'Need an account? Sign up' : 'Back to sign in'}
            </button>
            {devAutoLoginAvailable && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => {
                  void apiClient.tryDevAutoLogin().then((devUser) => {
                    if (devUser) setUser(devUser);
                  });
                }}
              >
                Open Demo Dashboard (Local Mode)
              </button>
            )}
          </div>
        </section>
      </main>
    );
  }

  const navItem = (id: ActiveTab, label: string, Icon: typeof Building2) => (
    <button
      key={id}
      type="button"
      className={`nav-btn ${tab === id ? 'active' : ''}`}
      onClick={() => {
        setTab(id);
        setMobileMenuOpen(false);
      }}
    >
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );

  const initials = user.email.slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      {mobileMenuOpen && (
        <div
          className="lc-drawer-backdrop"
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="lc-sidebar-top">
          <div className="brand">
            <div className="lc-brand-mark">
              <ShieldCheck size={18} aria-hidden="true" />
            </div>
            <div>
              <div className="lc-brand-name">LedgerCore</div>
              <div className="lc-brand-sub">Financial OS</div>
            </div>
          </div>
          {mobileMenuOpen && (
            <button
              type="button"
              className="mobile-menu-btn"
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <nav className="nav-list">
          <div className="lc-nav-group">
            <div className="lc-nav-label">Overview</div>
            {activeOrg &&
              (hasRolePermission(activeOrg.role, 'reports:read') ||
                hasRolePermission(activeOrg.role, 'reports:read_scoped')) &&
              navItem('dashboard', 'Dashboard', BarChart3)}
            {navItem('overview', 'Organizations', Building2)}
          </div>

          {activeOrg && (
            <div className="lc-nav-group">
              <div className="lc-nav-label">Accounting</div>
              {hasRolePermission(activeOrg.role, 'accounts:read') &&
                navItem('coa', 'Chart of Accounts', Layers)}
              {hasRolePermission(activeOrg.role, 'reports:read') &&
                navItem('journals', 'Journal & Ledger', BookOpen)}
              {hasRolePermission(activeOrg.role, 'reports:read') &&
                navItem('periods', 'Periods & Trial Bal.', CalendarClock)}
            </div>
          )}

          {activeOrg && (
            <div className="lc-nav-group">
              <div className="lc-nav-label">Cash &amp; Operations</div>
              {hasRolePermission(activeOrg.role, 'banking:read') &&
                navItem('banking', 'Banking & Import', Landmark)}
              {hasRolePermission(activeOrg.role, 'reports:read') &&
                navItem('operations', 'Expenses, AP/AR & eBay', Briefcase)}
            </div>
          )}

          {activeOrg && (
            <div className="lc-nav-group">
              <div className="lc-nav-label">Capital &amp; Governance</div>
              {hasRolePermission(activeOrg.role, 'profit_sharing:read') &&
                navItem('investors', 'Investors & Payroll', PieChart)}
              {(hasRolePermission(activeOrg.role, 'reports:read') ||
                hasRolePermission(activeOrg.role, 'reports:read_scoped')) &&
                navItem('reports', 'Statements & Exports', FileSpreadsheet)}
              {hasRolePermission(activeOrg.role, 'members:read') &&
                navItem('members', 'Team & Roles', Users)}
              {hasRolePermission(activeOrg.role, 'audit:read') &&
                navItem('audit', 'Audit Trail', CheckCircle2)}
            </div>
          )}
        </nav>

        {activeOrg && (
          <div className="lc-sidebar-foot">
            <div className="lc-sidebar-org">{activeOrg.name}</div>
            <div className="lc-sidebar-meta">
              <span>{activeOrg.base_currency}</span>
              <span>·</span>
              <span style={{ textTransform: 'capitalize' }}>{activeOrg.role}</span>
            </div>
          </div>
        )}
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar-group">
            <button
              type="button"
              className="mobile-menu-btn"
              aria-label="Open menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={18} />
            </button>
            {orgs.length > 0 && (
              <select
                className="lc-org-select"
                aria-label="Active organization"
                value={activeOrgId ?? ''}
                onChange={(e) => setActiveOrgId(e.target.value)}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.base_currency}) — {o.role}
                  </option>
                ))}
              </select>
            )}
            {activeOrg && (
              <button
                type="button"
                className="lc-date-chip"
                title="Jump to dashboard date filters"
                onClick={() => setTab('dashboard')}
              >
                <Calendar size={14} aria-hidden="true" />
                <span>{startDate} → {endDate}</span>
              </button>
            )}
          </div>

          <div className="topbar-group">
            <div className="lc-popover-wrap" ref={notifRef}>
              <button
                type="button"
                className="lc-topbar-icon-btn"
                aria-label="Notifications"
                aria-expanded={notifOpen}
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setProfileOpen(false);
                }}
              >
                <Bell size={17} />
                {alerts.length > 0 && <span className="lc-notif-count">{alerts.length}</span>}
              </button>
              {notifOpen && (
                <div className="lc-popover lc-popover-wide" role="menu">
                  <div className="lc-popover-head">
                    <strong>Workspace Alerts</strong>
                    <span className="muted">{alerts.length} active</span>
                  </div>
                  {alerts.length === 0 ? (
                    <div className="lc-popover-empty">All ledger &amp; banking checks look clean.</div>
                  ) : (
                    <div className="lc-popover-list">
                      {alerts.map((al) => (
                        <button
                          key={al.id}
                          type="button"
                          className="lc-notif-item"
                          onClick={() => {
                            setTab(al.target);
                            setNotifOpen(false);
                          }}
                        >
                          <div className="lc-notif-title">{al.title}</div>
                          <div className="muted">{al.detail}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="lc-popover-wrap" ref={profileRef}>
              <button
                type="button"
                className="lc-profile-trigger"
                aria-expanded={profileOpen}
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotifOpen(false);
                }}
              >
                <span className="lc-avatar">{initials}</span>
                <span className="lc-profile-email">{user.email}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {profileOpen && (
                <div className="lc-popover" role="menu">
                  <div className="lc-popover-head" style={{ display: 'block' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{user.email}</div>
                    <div className="muted">
                      Session AAL: {user.aal.toUpperCase()} {activeOrg ? `· Role: ${activeOrg.role}` : ''}
                    </div>
                  </div>
                  <div className="lc-popover-list">
                    <button
                      type="button"
                      className="lc-menu-item"
                      onClick={() => {
                        setTab('overview');
                        setProfileOpen(false);
                      }}
                    >
                      <Building2 size={15} /> Switch / Manage Organizations
                    </button>
                    <button
                      type="button"
                      className="lc-menu-item lc-menu-danger"
                      onClick={() => {
                        setProfileOpen(false);
                        void apiClient.logout().then(() => {
                          setUser(null);
                          setOrgs([]);
                          setActiveOrgId(null);
                        });
                      }}
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content">
          {error && (
            <div role="alert" className="alert-error">
              <span>{error}</span>
              <button type="button" className="lc-icon-btn" onClick={() => setError(null)} aria-label="Dismiss error">
                <X size={14} />
              </button>
            </div>
          )}

          {activeOrg && tab === 'dashboard' && (
            <DashboardPanel
              org={activeOrg}
              summary={dashboardSummary}
              pnl={pnlReport}
              balanceSheet={balanceSheet}
              cashFlow={cashFlow}
              accounts={accounts}
              bankAccounts={bankAccounts}
              parties={parties}
              entries={entries}
              invoicesBills={invoicesBills}
              agreements={agreements}
              auditEvents={auditEvents}
              loading={loadingOrgData}
              startDate={startDate}
              endDate={endDate}
              filterAccountId={filterAccountId}
              filterPartyId={filterPartyId}
              onFilterChange={(next) => {
                setStartDate(next.startDate);
                setEndDate(next.endDate);
                setFilterAccountId(next.accountId);
                setFilterPartyId(next.partyId);
              }}
              onNavigateTab={setTab}
            />
          )}

          {activeOrg && tab === 'reports' && (
            <ReportsPanel
              org={activeOrg}
              startDate={startDate}
              endDate={endDate}
              pnl={pnlReport}
              balanceSheet={balanceSheet}
              cashFlow={cashFlow}
              trialBalance={trialBalance}
              parties={parties}
              onError={setError}
              onNotify={(title, detail) => pushToast(title, detail)}
            />
          )}

          {tab === 'overview' && (
            <div className="lc-stack-lg">
              <section className="lc-card">
                <div className="lc-page-head">
                  <div>
                    <div className="lc-eyebrow">Multi-Tenant Isolation</div>
                    <h1 className="lc-page-title">Organizations &amp; Workspaces</h1>
                    <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                      Each workspace is strictly isolated via forced Postgres RLS and maintains an independent Chart of Accounts, base currency, and audit chain.
                    </p>
                  </div>
                </div>

                <form className="lc-subpanel lc-grid-form" onSubmit={handleCreateOrg}>
                  <label>
                    Organization Name
                    <input
                      required
                      minLength={2}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Acme eCommerce LLC"
                    />
                  </label>
                  <label>
                    Base Currency (ISO 4217)
                    <input
                      required
                      maxLength={3}
                      value={baseCurrency}
                      onChange={(e) => setBaseCurrency(e.target.value)}
                    />
                  </label>
                  <label>
                    Country (ISO 3166-1)
                    <input
                      required
                      maxLength={2}
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    />
                  </label>
                  <div className="lc-form-action">
                    <button type="submit" className="btn">
                      Create Organization
                    </button>
                  </div>
                </form>
              </section>

              {activeOrg && (
                <section className="lc-card">
                  <header className="lc-card-head">
                    <div>
                      <h3 className="lc-card-title">{activeOrg.name} — Active Workspace Summary</h3>
                      <p className="lc-card-sub">Current fiscal engine configuration</p>
                    </div>
                    <StatusBadge tone="success">Active</StatusBadge>
                  </header>
                  <div className="lc-position-strip">
                    <div className="lc-strip-item">
                      <span className="muted">Base Currency</span>
                      <strong>{activeOrg.base_currency}</strong>
                    </div>
                    <div className="lc-strip-item">
                      <span className="muted">Country</span>
                      <strong>{activeOrg.country}</strong>
                    </div>
                    <div className="lc-strip-item">
                      <span className="muted">Your Role</span>
                      <StatusBadge tone="accent">{activeOrg.role}</StatusBadge>
                    </div>
                    <div className="lc-strip-item">
                      <span className="muted">Accounts / Posted Entries</span>
                      <strong className="mono-num">
                        {accounts.length} accounts · {entries.filter((e) => e.status === 'posted').length} posted
                      </strong>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {activeOrg && (tab === 'coa' || tab === 'journals' || tab === 'periods') && (
            <LedgerPanel
              org={activeOrg}
              mode={tab}
              accounts={accounts}
              entries={entries}
              periods={periods}
              trialBalance={trialBalance}
              onRefresh={refreshActiveOrgData}
              onError={setError}
              onNotify={(title, detail) => pushToast(title, detail)}
            />
          )}

          {activeOrg && tab === 'banking' && (
            <BankingPanel
              org={activeOrg}
              accounts={accounts}
              bankAccounts={bankAccounts}
              transactions={bankTxs}
              entries={entries}
              reconciliations={reconciliations}
              onRefresh={refreshActiveOrgData}
              onError={setError}
              onNotify={(title, detail) => pushToast(title, detail)}
            />
          )}

          {activeOrg && tab === 'operations' && (
            <OperationsPanel
              org={activeOrg}
              accounts={accounts}
              parties={parties}
              invoicesBills={invoicesBills}
              assets={assets}
              liabilities={liabilities}
              onRefresh={refreshActiveOrgData}
              onError={setError}
              onNotify={(title, detail) => pushToast(title, detail)}
            />
          )}

          {activeOrg && tab === 'investors' && (
            <InvestorsPayrollPanel
              org={activeOrg}
              accounts={accounts}
              parties={parties}
              periods={periods}
              agreements={agreements}
              distributions={distributions}
              salaryRuns={salaryRuns}
              onRefresh={refreshActiveOrgData}
              onError={setError}
              onNotify={(title, detail) => pushToast(title, detail)}
            />
          )}

          {tab === 'members' && activeOrg && (
            <div className="lc-stack-lg">
              <section className="lc-card">
                <div className="lc-page-head">
                  <div>
                    <div className="lc-eyebrow">RBAC Access Governance</div>
                    <h1 className="lc-page-title">Team &amp; Permissions</h1>
                    <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                      Role checks are enforced both in the BFF API and Postgres RLS (`OWNER`, `ADMIN`, `ACCOUNTANT`, `MANAGER`, `INVESTOR`, `VIEWER`).
                    </p>
                  </div>
                </div>

                {hasRolePermission(activeOrg.role, 'members:write') && (
                  <form className="lc-subpanel lc-grid-form" onSubmit={handleInvite}>
                    <label>
                      Member Email
                      <input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="bookkeeper@company.com"
                      />
                    </label>
                    <label>
                      Role
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                      >
                        {ORG_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="lc-form-action">
                      <button type="submit" className="btn">
                        Send Invite
                      </button>
                    </div>
                  </form>
                )}
              </section>

              <section className="lc-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Email / User ID</th>
                        <th>Assigned Role</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.id}>
                          <td><strong>{m.email ?? m.user_id}</strong></td>
                          <td>
                            <StatusBadge tone="accent">{m.role}</StatusBadge>
                          </td>
                          <td>
                            <StatusBadge tone={badgeToneForStatus(m.status)}>{m.status}</StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {tab === 'audit' && activeOrg && (
            <div className="lc-stack-lg">
              <section className="lc-card">
                <div className="lc-page-head">
                  <div>
                    <div className="lc-eyebrow">Cryptographic Integrity</div>
                    <h1 className="lc-page-title">Tamper-Evident Audit Trail</h1>
                    <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                      Every write operation appends a SHA-256 hash-linked row (`prev_hash → row_hash`) to guarantee immutability.
                    </p>
                  </div>
                  <div className="lc-btn-group">
                    <button type="button" className="btn" onClick={handleVerifyChain}>
                      <CheckCircle2 size={15} /> Verify Hash Chain
                    </button>
                  </div>
                </div>
                {chainValid !== null && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <StatusBadge tone={chainValid ? 'success' : 'danger'}>
                      {chainValid ? 'Hash chain verified (intact)' : 'Hash chain verification failed'}
                    </StatusBadge>
                  </div>
                )}
              </section>

              <section className="lc-card">
                <div className="lc-toolbar">
                  <div>
                    <h3 className="lc-card-title">Audit Events</h3>
                    <p className="lc-card-sub">{auditEvents.length} recorded event(s)</p>
                  </div>
                  <div className="lc-search-box">
                    <Search size={15} aria-hidden="true" />
                    <input
                      type="search"
                      placeholder="Filter action, entity, or hash…"
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                    />
                  </div>
                </div>
                {filteredAudit.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle2 size={20} />}
                    title="No audit events match"
                    description="Adjust your search filter or perform an operation."
                  />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Action</th>
                          <th>Entity Type</th>
                          <th>Row Hash</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAudit.map((ev) => (
                          <tr key={ev.id}>
                            <td className="mono">{ev.created_at}</td>
                            <td><strong>{ev.action}</strong></td>
                            <td><StatusBadge tone="neutral">{ev.entity_type}</StatusBadge></td>
                            <td className="mono">{ev.row_hash.slice(0, 18)}…</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

      <ToastHost
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
