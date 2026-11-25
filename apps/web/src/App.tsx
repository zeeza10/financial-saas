import { useEffect, useState, type FormEvent } from 'react';
import {
  Building2,
  CheckCircle2,
  Menu,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  ORG_ROLES,
  hasRolePermission,
  type AuditEventDto,
  type MemberDto,
  type OrganizationDto,
  type OrgRole,
} from '@financial-saas/contracts';
import { apiClient, type SessionUser } from './apiClient.js';

type ActiveTab = 'overview' | 'members' | 'audit';

export function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<OrganizationDto[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Create org form
  const [orgName, setOrgName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [country, setCountry] = useState('US');

  // Members & audit
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('accountant');
  const [auditEvents, setAuditEvents] = useState<AuditEventDto[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;

  useEffect(() => {
    void (async () => {
      try {
        const session = await apiClient.getSession();
        if (session?.authenticated) {
          setUser(session.user);
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

  useEffect(() => {
    if (!activeOrg) return;
    setError(null);
    if (tab === 'members' && hasRolePermission(activeOrg.role, 'members:read')) {
      void apiClient.listMembers(activeOrg.id).then(setMembers).catch((e) => setError(e.message));
    }
    if (tab === 'audit' && hasRolePermission(activeOrg.role, 'audit:read')) {
      void apiClient
        .listAuditEvents(activeOrg.id)
        .then(setAuditEvents)
        .catch((e) => setError(e.message));
    }
  }, [activeOrg, tab]);

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
          <div style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
            >
              {authMode === 'login' ? 'Need an account? Sign up' : 'Back to sign in'}
            </button>
          </div>
        </section>
      </main>
    );
  }

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
          <button
            type="button"
            className={`nav-btn ${tab === 'overview' ? 'active' : ''}`}
            onClick={() => {
              setTab('overview');
              setMobileMenuOpen(false);
            }}
          >
            <Building2 size={16} aria-hidden="true" />
            <span>Organizations</span>
          </button>
          {activeOrg && hasRolePermission(activeOrg.role, 'members:read') && (
            <button
              type="button"
              className={`nav-btn ${tab === 'members' ? 'active' : ''}`}
              onClick={() => {
                setTab('members');
                setMobileMenuOpen(false);
              }}
            >
              <Users size={16} aria-hidden="true" />
              <span>Team & Roles</span>
            </button>
          )}
          {activeOrg && hasRolePermission(activeOrg.role, 'audit:read') && (
            <button
              type="button"
              className={`nav-btn ${tab === 'audit' ? 'active' : ''}`}
              onClick={() => {
                setTab('audit');
                setMobileMenuOpen(false);
              }}
            >
              <CheckCircle2 size={16} aria-hidden="true" />
              <span>Audit Trail</span>
            </button>
          )}
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
                  <h2 style={{ marginTop: 0 }}>{activeOrg.name} — Phase 3 Foundation</h2>
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
                      <div className="muted">Plan</div>
                      <span className="badge badge-ok">{activeOrg.plan_code}</span>
                    </div>
                  </div>
                </section>
              )}
            </>
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
