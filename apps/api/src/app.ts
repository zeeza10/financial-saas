import { Hono } from 'hono';
import {
  CreateOrganizationRequestSchema,
  CursorPageQuerySchema,
  InviteMemberRequestSchema,
  LoginRequestSchema,
  SignupRequestSchema,
  UpdateMemberRoleRequestSchema,
  UuidSchema,
  createProblemDetails,
  hasRolePermission,
  roleRequiresMfa,
  type Permission,
} from '@financial-saas/contracts';
import type { ApiEnv } from './env.js';
import {
  InMemoryRateLimiter,
  buildCookieHeader,
  csrfMiddleware,
  getCsrfCookieName,
  getSessionCookieName,
  isHttpsOrigin,
  parseCookieHeader,
  securityHeadersMiddleware,
  sha256Hex,
  signCookieValue,
  strictCorsMiddleware,
  verifyCookieValue,
  verifyUserJwt,
  type SessionPayload,
} from './security.js';
import {
  ApiDomainError,
  SupabaseRpcStore,
  type AuthUser,
  type DataStore,
} from './store.js';

export interface AuthGatewayResult {
  userId: string;
  email: string;
  accessToken: string;
  aal: 'aal1' | 'aal2';
}

export interface AuthGateway {
  signup(email: string, password: string, displayName: string): Promise<void>;
  loginWithPassword(email: string, password: string): Promise<AuthGatewayResult>;
}

export class SupabaseAuthGateway implements AuthGateway {
  constructor(private readonly env: ApiEnv) {}

  async signup(email: string, password: string, displayName: string): Promise<void> {
    const base = this.env.SUPABASE_URL.replace(/\/$/, '');
    const res = await fetch(`${base}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: this.env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        data: { display_name: displayName },
      }),
    });
    if (!res.ok) {
      throw new ApiDomainError(400, 'Unable to register account');
    }
  }

  async loginWithPassword(email: string, password: string): Promise<AuthGatewayResult> {
    const base = this.env.SUPABASE_URL.replace(/\/$/, '');
    const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: this.env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      throw new ApiDomainError(401, 'Invalid email or password');
    }
    const data = (await res.json()) as {
      access_token?: string;
      user?: { id?: string; email?: string };
    };
    if (!data.access_token || !data.user?.id) {
      throw new ApiDomainError(401, 'Invalid email or password');
    }
    const verified = await verifyUserJwt(data.access_token, this.env);
    return {
      userId: verified.userId,
      email: verified.email || email,
      accessToken: data.access_token,
      aal: verified.aal,
    };
  }
}

export interface ApiDeps {
  getEnv?: (cEnv: ApiEnv) => ApiEnv;
  createStore?: (env: ApiEnv) => DataStore;
  createAuthGateway?: (env: ApiEnv) => AuthGateway;
  rateLimiter?: InMemoryRateLimiter;
  enforceMfaForPrivileged?: boolean;
}

type HonoVariables = {
  requestId: string;
  user: AuthUser;
};

export function createApiApp(deps: ApiDeps = {}) {
  const app = new Hono<{ Bindings: ApiEnv; Variables: HonoVariables }>();
  const rateLimiter = deps.rateLimiter ?? new InMemoryRateLimiter();
  const resolveEnv = (cEnv: ApiEnv) => (deps.getEnv ? deps.getEnv(cEnv) : cEnv);

  app.use('*', securityHeadersMiddleware());
  app.use(
    '*',
    strictCorsMiddleware((c) => resolveEnv(c.env).APP_ORIGIN)
  );
  app.use(
    '*',
    csrfMiddleware((c) => resolveEnv(c.env), {
      exemptPaths: ['/v1/auth/login', '/v1/auth/signup'],
    })
  );

  app.onError((err, c) => {
    const requestId = c.get('requestId') ?? 'unknown';
    if (err instanceof ApiDomainError) {
      return c.json(
        createProblemDetails({
          status: err.status,
          title: err.title,
          requestId,
          ...(err.detail !== undefined ? { detail: err.detail } : {}),
        }),
        err.status as 400,
        { 'Content-Type': 'application/problem+json' }
      );
    }
    return c.json(
      createProblemDetails({
        status: 500,
        title: 'Internal server error',
        requestId,
      }),
      500,
      { 'Content-Type': 'application/problem+json' }
    );
  });

  async function requireSession(c: {
    env: ApiEnv;
    req: { header: (name: string) => string | undefined };
  }): Promise<AuthUser> {
    const env = resolveEnv(c.env);
    const cookies = parseCookieHeader(c.req.header('cookie'));
    const rawCookie = cookies[getSessionCookieName(env)];
    if (!rawCookie) {
      throw new ApiDomainError(401, 'Authentication required');
    }
    const verifiedJson = await verifyCookieValue(rawCookie, env.COOKIE_SIGNING_SECRET);
    if (!verifiedJson) {
      throw new ApiDomainError(401, 'Invalid session');
    }
    let session: SessionPayload;
    try {
      session = JSON.parse(verifiedJson) as SessionPayload;
    } catch {
      throw new ApiDomainError(401, 'Invalid session');
    }
    if (session.exp <= Math.floor(Date.now() / 1000)) {
      throw new ApiDomainError(401, 'Session expired');
    }
    const verifiedJwt = await verifyUserJwt(session.accessToken, env).catch(() => null);
    if (!verifiedJwt || verifiedJwt.userId !== session.userId) {
      throw new ApiDomainError(401, 'Session token rejected');
    }
    return {
      userId: verifiedJwt.userId,
      email: verifiedJwt.email || session.email,
      aal: verifiedJwt.aal,
      accessToken: session.accessToken,
    };
  }

  async function requireOrgPermission(
    c: { env: ApiEnv; req: { header: (name: string) => string | undefined } },
    store: DataStore,
    user: AuthUser,
    permission: Permission
  ): Promise<string> {
    const orgHeader = c.req.header('x-organization-id');
    const parsedOrg = UuidSchema.safeParse(orgHeader);
    if (!parsedOrg.success) {
      throw new ApiDomainError(400, 'Missing or invalid X-Organization-Id header');
    }
    const orgId = parsedOrg.data;
    const membership = await store.getMembership(user, orgId);
    if (!membership || membership.status !== 'active') {
      // IDOR/BOLA: foreign org returns 404 (ST-05)
      throw new ApiDomainError(404, 'Organization not found');
    }
    if (!hasRolePermission(membership.role, permission)) {
      throw new ApiDomainError(403, 'Insufficient permissions');
    }
    if (deps.enforceMfaForPrivileged && roleRequiresMfa(membership.role) && user.aal !== 'aal2') {
      throw new ApiDomainError(403, 'MFA verification required for this role');
    }
    return orgId;
  }

  async function parseStrictJson<T>(
    req: { text: () => Promise<string> },
    schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } }
  ): Promise<{ rawText: string; data: T }> {
    const rawText = await req.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new ApiDomainError(400, 'Malformed JSON body');
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new ApiDomainError(422, 'Request validation failed');
    }
    return { rawText, data: result.data };
  }

  // Health
  app.get('/v1/health', (c) => {
    return c.json({ status: 'ok', version: 'v1' });
  });

  // Auth: Signup (F1)
  app.post('/v1/auth/signup', async (c) => {
    const env = resolveEnv(c.env);
    const ip = c.req.header('cf-connecting-ip') ?? 'local';
    const rl = rateLimiter.check(`signup:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return c.json(
        createProblemDetails({ status: 429, title: 'Too many requests', requestId: c.get('requestId') }),
        429,
        { 'Retry-After': String(rl.retryAfterSeconds), 'Content-Type': 'application/problem+json' }
      );
    }

    const { data } = await parseStrictJson(c.req, SignupRequestSchema);
    const auth = deps.createAuthGateway ? deps.createAuthGateway(env) : new SupabaseAuthGateway(env);
    await auth.signup(data.email, data.password, data.display_name);
    return c.json({ message: 'If the email is eligible, a verification message has been sent.' }, 202);
  });

  // Auth: Login (BFF httpOnly cookie session + CSRF cookie per ADR-0004)
  app.post('/v1/auth/login', async (c) => {
    const env = resolveEnv(c.env);
    const ip = c.req.header('cf-connecting-ip') ?? 'local';
    const rl = rateLimiter.check(`login:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      return c.json(
        createProblemDetails({ status: 429, title: 'Too many login attempts', requestId: c.get('requestId') }),
        429,
        { 'Retry-After': String(rl.retryAfterSeconds), 'Content-Type': 'application/problem+json' }
      );
    }

    const { data } = await parseStrictJson(c.req, LoginRequestSchema);
    const auth = deps.createAuthGateway ? deps.createAuthGateway(env) : new SupabaseAuthGateway(env);
    const result = await auth.loginWithPassword(data.email, data.password);

    const ttlSeconds = 3600;
    const sessionPayload: SessionPayload = {
      userId: result.userId,
      email: result.email,
      accessToken: result.accessToken,
      aal: result.aal,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    };

    const signedSession = await signCookieValue(JSON.stringify(sessionPayload), env.COOKIE_SIGNING_SECRET);
    const signedCsrf = await signCookieValue(crypto.randomUUID(), env.CSRF_SECRET);
    const secure = isHttpsOrigin(env.APP_ORIGIN);

    c.header(
      'Set-Cookie',
      buildCookieHeader({
        name: getSessionCookieName(env),
        value: signedSession,
        httpOnly: true,
        secure,
        maxAgeSeconds: ttlSeconds,
      }),
      { append: true }
    );
    c.header(
      'Set-Cookie',
      buildCookieHeader({
        name: getCsrfCookieName(env),
        value: signedCsrf,
        httpOnly: false,
        secure,
        maxAgeSeconds: ttlSeconds,
      }),
      { append: true }
    );

    return c.json({
      user: { id: result.userId, email: result.email, aal: result.aal },
      csrf_token: signedCsrf,
    });
  });

  app.post('/v1/auth/logout', async (c) => {
    const env = resolveEnv(c.env);
    const secure = isHttpsOrigin(env.APP_ORIGIN);
    c.header(
      'Set-Cookie',
      buildCookieHeader({
        name: getSessionCookieName(env),
        value: '',
        httpOnly: true,
        secure,
        maxAgeSeconds: 0,
      }),
      { append: true }
    );
    c.header(
      'Set-Cookie',
      buildCookieHeader({
        name: getCsrfCookieName(env),
        value: '',
        httpOnly: false,
        secure,
        maxAgeSeconds: 0,
      }),
      { append: true }
    );
    return c.json({ ok: true });
  });

  app.get('/v1/auth/session', async (c) => {
    const env = resolveEnv(c.env);
    const user = await requireSession(c);
    const cookies = parseCookieHeader(c.req.header('cookie'));
    const csrfCookie = cookies[getCsrfCookieName(env)];
    return c.json({
      authenticated: true,
      user: { id: user.userId, email: user.email, aal: user.aal },
      csrf_token: csrfCookie ?? null,
    });
  });

  // Organizations
  app.get('/v1/organizations', async (c) => {
    const env = resolveEnv(c.env);
    const user = await requireSession(c);
    const store = deps.createStore ? deps.createStore(env) : new SupabaseRpcStore(env);
    const items = await store.listOrganizations(user);
    return c.json({ items });
  });

  app.post('/v1/organizations', async (c) => {
    const env = resolveEnv(c.env);
    const user = await requireSession(c);
    const store = deps.createStore ? deps.createStore(env) : new SupabaseRpcStore(env);
    const requestId = c.get('requestId');
    const idempotencyKey = c.req.header('idempotency-key');
    if (!idempotencyKey) {
      throw new ApiDomainError(400, 'Idempotency-Key header is required');
    }

    const { rawText, data } = await parseStrictJson(c.req, CreateOrganizationRequestSchema);
    const requestHash = await sha256Hex(rawText);
    const route = 'POST /v1/organizations';
    const existing = await store.getIdempotencyRecord({
      user,
      organizationId: 'global',
      route,
      key: idempotencyKey,
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ApiDomainError(422, 'Idempotency-Key reused with different request body');
      }
      return c.json(existing.responseBody, existing.statusCode as 201);
    }

    const org = await store.createOrganization(user, data, requestId);
    const responseBody = { organization: org };
    await store.saveIdempotencyRecord({
      user,
      organizationId: 'global',
      route,
      key: idempotencyKey,
      requestHash,
      statusCode: 201,
      responseBody,
    });
    return c.json(responseBody, 201);
  });

  // Members & Roles
  app.get('/v1/members', async (c) => {
    const env = resolveEnv(c.env);
    const user = await requireSession(c);
    const store = deps.createStore ? deps.createStore(env) : new SupabaseRpcStore(env);
    const orgId = await requireOrgPermission(c, store, user, 'members:read');
    const items = await store.listMembers(user, orgId);
    return c.json({ items });
  });

  app.post('/v1/members/invite', async (c) => {
    const env = resolveEnv(c.env);
    const user = await requireSession(c);
    const store = deps.createStore ? deps.createStore(env) : new SupabaseRpcStore(env);
    const orgId = await requireOrgPermission(c, store, user, 'members:write');
    const idempotencyKey = c.req.header('idempotency-key');
    if (!idempotencyKey) {
      throw new ApiDomainError(400, 'Idempotency-Key header is required');
    }

    const { rawText, data } = await parseStrictJson(c.req, InviteMemberRequestSchema);
    const requestHash = await sha256Hex(rawText);
    const route = 'POST /v1/members/invite';
    const existing = await store.getIdempotencyRecord({
      user,
      organizationId: orgId,
      route,
      key: idempotencyKey,
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ApiDomainError(422, 'Idempotency-Key reused with different request body');
      }
      return c.json(existing.responseBody, existing.statusCode as 201);
    }

    const member = await store.inviteMember(user, orgId, data, c.get('requestId'));
    const responseBody = { member };
    await store.saveIdempotencyRecord({
      user,
      organizationId: orgId,
      route,
      key: idempotencyKey,
      requestHash,
      statusCode: 201,
      responseBody,
    });
    return c.json(responseBody, 201);
  });

  app.patch('/v1/members/:memberId', async (c) => {
    const env = resolveEnv(c.env);
    const user = await requireSession(c);
    const store = deps.createStore ? deps.createStore(env) : new SupabaseRpcStore(env);
    const orgId = await requireOrgPermission(c, store, user, 'members:write');
    const memberId = UuidSchema.safeParse(c.req.param('memberId'));
    if (!memberId.success) {
      throw new ApiDomainError(404, 'Member not found');
    }
    const { data } = await parseStrictJson(c.req, UpdateMemberRoleRequestSchema);
    const member = await store.updateMemberRole(
      user,
      orgId,
      memberId.data,
      data.role,
      c.get('requestId')
    );
    return c.json({ member });
  });

  app.delete('/v1/members/:memberId', async (c) => {
    const env = resolveEnv(c.env);
    const user = await requireSession(c);
    const store = deps.createStore ? deps.createStore(env) : new SupabaseRpcStore(env);
    const orgId = await requireOrgPermission(c, store, user, 'members:write');
    const memberId = UuidSchema.safeParse(c.req.param('memberId'));
    if (!memberId.success) {
      throw new ApiDomainError(404, 'Member not found');
    }
    await store.removeMember(user, orgId, memberId.data, c.get('requestId'));
    return c.json({ ok: true });
  });

  // Audit Log
  app.get('/v1/audit-events', async (c) => {
    const env = resolveEnv(c.env);
    const user = await requireSession(c);
    const store = deps.createStore ? deps.createStore(env) : new SupabaseRpcStore(env);
    const orgId = await requireOrgPermission(c, store, user, 'audit:read');
    const page = CursorPageQuerySchema.safeParse({
      limit: c.req.query('limit'),
      cursor: c.req.query('cursor'),
    });
    if (!page.success) {
      throw new ApiDomainError(422, 'Invalid pagination query');
    }
    const items = await store.listAuditEvents(user, orgId, page.data.limit);
    return c.json({ items });
  });

  app.post('/v1/audit-events/verify', async (c) => {
    const env = resolveEnv(c.env);
    const user = await requireSession(c);
    const store = deps.createStore ? deps.createStore(env) : new SupabaseRpcStore(env);
    const orgId = await requireOrgPermission(c, store, user, 'audit:read');
    const valid = await store.verifyAuditChain(user, orgId);
    return c.json({ valid });
  });

  return app;
}
