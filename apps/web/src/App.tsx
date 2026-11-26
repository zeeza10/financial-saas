import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileSpreadsheet,
  Landmark,
  Layers,
  Menu,
  PieChart,
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
  const [devAutoLoginAvailable, setDevAutoLoginAvailable] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<OrganizationDto[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [tab, setTab] = useState<ActiveTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Create org form
  const [orgName, setOrgName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [country, setCountry] = useState('US');

  // Phase 3 & 4 org data
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('accountant');
  const [auditEvents, setAuditEvents] = useState<AuditEventDto[]>([]);
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
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load organizations');
      }
    })();
  }, [user, activeOrgId]);

  const refreshActiveOrgData = useCallback(async () => {
    if (!activeOrg) return;
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
    await Promise.all(tasks);
  }, [activeOrg, startDate, endDate, filterAccountId, filterPartyId]);

  useEffect(() => {
    if (!activeOrg) return;
    setError(null);
    void refreshActiveOrgData().catch((e) =>
      setError(e instanceof Error ? e.message : 'Unable to load organization data')
    );
  }, [activeOrg, tab, refreshActiveOrgData]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  }

  if (loadingSession) {
    return (
      <main className="auth-shell">
        <p className="muted">Verifying session...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="auth-heading">
          <h1 id="auth-heading" style={{ marginTop: 0 }}>
            LedgerCore SaaS
          </h1>
          <p className="muted">
            Multi-tenant double-entry financial management. Sessions use BFF httpOnly cookies.
          </p>
          {error && (
            <div role="alert" className="alert-error">
              {error}
            </div>
          )}
          {authMessage && <p className="badge badge-ok">{authMessage}</p>}
          <form className="form-grid" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' && (
              <label>
                Full name
                <input
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            <label>
              Work email
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
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
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

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="brand">
            <ShieldCheck size={20} aria-hidden="true" />
            <span>LedgerCore</span>
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
          {activeOrg && (hasRolePermission(activeOrg.role, 'reports:read') || hasRolePermission(activeOrg.role, 'reports:read_scoped')) &&
            navItem('dashboard', 'Dashboard', BarChart3)}
          {navItem('overview', 'Organizations', Building2)}
          {activeOrg && hasRolePermission(activeOrg.role, 'accounts:read') &&
            navItem('coa', 'Chart of Accounts', Layers)}
          {activeOrg && hasRolePermission(activeOrg.role, 'reports:read') &&
            navItem('journals', 'Journal & Ledger', BookOpen)}
          {activeOrg && hasRolePermission(activeOrg.role, 'banking:read') &&
            navItem('banking', 'Banking & Import', Landmark)}
          {activeOrg && hasRolePermission(activeOrg.role, 'reports:read') &&
            navItem('operations', 'Expenses, AP/AR & eBay', Briefcase)}
          {activeOrg && hasRolePermission(activeOrg.role, 'profit_sharing:read') &&
            navItem('investors', 'Investors & Payroll', PieChart)}
          {activeOrg && (hasRolePermission(activeOrg.role, 'reports:read') || hasRolePermission(activeOrg.role, 'reports:read_scoped')) &&
            navItem('reports', 'Statements & Exports', FileSpreadsheet)}
          {activeOrg && hasRolePermission(activeOrg.role, 'reports:read') &&
            navItem('periods', 'Periods & Trial Bal.', CalendarClock)}
          {activeOrg && hasRolePermission(activeOrg.role, 'members:read') &&
            navItem('members', 'Team & Roles', Users)}
          {activeOrg && hasRolePermission(activeOrg.role, 'audit:read') &&
            navItem('audit', 'Audit Trail', CheckCircle2)}
        </nav>
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
          </div>
          <div className="topbar-group">
            <span className="muted">{user.email}</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                void apiClient.logout().then(() => {
                  setUser(null);
                  setOrgs([]);
                  setActiveOrgId(null);
                });
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="content">
          {error && (
            <div role="alert" className="alert-error">
              {error}
            </div>
          )}

          {activeOrg && tab === 'dashboard' && (
            <DashboardPanel
              org={activeOrg}
              summary={dashboardSummary}
              accounts={accounts}
              parties={parties}
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
            />
          )}

          {tab === 'overview' && (
            <>
              <section className="card">
                <h2 style={{ marginTop: 0 }}>Create Organization</h2>
                <p className="muted">
                  Each organization is isolated via forced Postgres RLS and has its own base currency.
                </p>
                <form className="grid-3" onSubmit={handleCreateOrg}>
                  <label>
                    Organization name
                    <input
                      required
                      minLength={2}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Acme eCommerce LLC"
                    />
                  </label>
                  <label>
                    Base currency (ISO 4217)
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
                  <div>
                    <button type="submit" className="btn">
                      Create Organization
                    </button>
                  </div>
                </form>
              </section>

              {activeOrg && (
                <section className="card">
                  <h2 style={{ marginTop: 0 }}>{activeOrg.name} — Core Financial Engine</h2>
                  <div className="grid-3">
                    <div>
                      <div className="muted">Base Currency</div>
                      <strong>{activeOrg.base_currency}</strong>
                    </div>
                    <div>
                      <div className="muted">Your Role</div>
                      <span className="badge">{activeOrg.role}</span>
                    </div>
                    <div>
                      <div className="muted">Accounts / Posted Entries</div>
                      <strong>{accounts.length} accounts · {entries.filter((e) => e.status === 'posted').length} posted</strong>
                    </div>
                  </div>
                </section>
              )}
            </>
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
            />
          )}

          {tab === 'members' && activeOrg && (
            <section className="card">
              <h2 style={{ marginTop: 0 }}>Team & Permissions</h2>
              {hasRolePermission(activeOrg.role, 'members:write') && (
                <form className="grid-3" onSubmit={handleInvite} style={{ marginBottom: '1rem' }}>
                  <label>
                    Member email
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
                  <div style={{ alignSelf: 'end' }}>
                    <button type="submit" className="btn">
                      Send Invite
                    </button>
                  </div>
                </form>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Email / User</th>
                      <th>Role</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td>{m.email ?? m.user_id}</td>
                        <td>
                          <span className="badge">{m.role}</span>
                        </td>
                        <td>{m.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'audit' && activeOrg && (
            <section className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <h2 style={{ margin: 0 }}>Tamper-Evident Audit Trail</h2>
                <button type="button" className="btn" onClick={handleVerifyChain}>
                  Verify Hash Chain
                </button>
              </div>
              {chainValid !== null && (
                <p className={`badge ${chainValid ? 'badge-ok' : 'badge-warn'}`}>
                  {chainValid ? 'Hash chain verified (intact)' : 'Hash chain verification failed'}
                </p>
              )}
              <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Row Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEvents.map((ev) => (
                      <tr key={ev.id}>
                        <td>{ev.created_at}</td>
                        <td>{ev.action}</td>
                        <td>{ev.entity_type}</td>
                        <td className="mono">{ev.row_hash.slice(0, 16)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
