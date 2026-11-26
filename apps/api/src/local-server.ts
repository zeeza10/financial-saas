import http from 'node:http';
import { Hono } from 'hono';
import { SignJWT } from 'jose';
import type { AccountDto, JournalEntryDto, OrganizationDto } from '@financial-saas/contracts';
import { createApiApp, type AuthGateway } from './app.js';
import type { ApiEnv } from './env.js';
import { InMemoryRateLimiter } from './security.js';
import { ApiDomainError, InMemoryDataStore } from './store.js';

const DEMO_EMAIL = 'demo@ledgercore.local';
const DEMO_PASSWORD = 'DemoLocalOwner#2026';
const DEMO_NAME = 'Demo Business Owner';

class LocalDevAuthGateway implements AuthGateway {
  private readonly users = new Map<string, { id: string; email: string; password: string }>();

  constructor(private readonly jwtSecret: string) {}

  async signup(email: string, password: string): Promise<void> {
    const key = email.toLowerCase();
    if (this.users.has(key)) return;
    this.users.set(key, { id: crypto.randomUUID(), email: key, password });
  }

  async loginWithPassword(email: string, password: string) {
    const key = email.toLowerCase();
    const user = this.users.get(key);
    if (!user || user.password !== password) {
      throw new ApiDomainError(401, 'Invalid email or password');
    }
    const token = await new SignJWT({ email: user.email, aal: 'aal2' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(new TextEncoder().encode(this.jwtSecret));
    return {
      userId: user.id,
      email: user.email,
      accessToken: token,
      aal: 'aal2' as const,
    };
  }
}

export function buildLocalEnvFromProcess(
  overrides?: Partial<ApiEnv>,
  localDevModeOverride?: boolean
): {
  env: ApiEnv;
  localDevMode: boolean;
} {
  const localDevMode =
    (localDevModeOverride ?? process.env['LOCAL_DEV_MODE'] === 'true') &&
    process.env['NODE_ENV'] !== 'production';

  const testSecret =
    process.env['TEST_JWT_SECRET'] ??
    (localDevMode ? 'local-dev-only-jwt-secret-minimum-32-bytes' : undefined);

  const env: ApiEnv = {
    APP_ORIGIN: overrides?.APP_ORIGIN ?? process.env['APP_ORIGIN'] ?? 'http://127.0.0.1:5173',
    SUPABASE_URL: overrides?.SUPABASE_URL ?? process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321',
    SUPABASE_ANON_KEY:
      overrides?.SUPABASE_ANON_KEY ?? process.env['SUPABASE_ANON_KEY'] ?? 'local-anon-placeholder',
    COOKIE_SIGNING_SECRET:
      overrides?.COOKIE_SIGNING_SECRET ??
      process.env['COOKIE_SIGNING_SECRET'] ??
      'local-dev-cookie-secret-do-not-use-in-production-32b',
    CSRF_SECRET:
      overrides?.CSRF_SECRET ??
      process.env['CSRF_SECRET'] ??
      'local-dev-csrf-secret-do-not-use-in-production-32b',
    ...(testSecret ? { TEST_JWT_SECRET: testSecret } : {}),
  };

  return { env, localDevMode };
}

async function seedDemoWorkspaceData(
  coreApp: ReturnType<typeof createApiApp>,
  env: ApiEnv
): Promise<void> {
  const call = (path: string, init?: RequestInit) =>
    coreApp.fetch(new Request(`http://127.0.0.1:8787${path}`, init), env);

  await call('/v1/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: env.APP_ORIGIN },
    body: JSON.stringify({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      display_name: DEMO_NAME,
    }),
  });

  const loginRes = await call('/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: env.APP_ORIGIN },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });
  if (!loginRes.ok) return;

  const cookie = loginRes.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ');
  const { csrf_token: csrf } = (await loginRes.json()) as { csrf_token: string };

  const orgRes = await call('/v1/organizations', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: env.APP_ORIGIN,
      'X-CSRF-Token': csrf,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'local-demo-org-1',
    },
    body: JSON.stringify({
      name: 'Demo eBay & Trading LLC',
      base_currency: 'USD',
      country: 'US',
      fiscal_year_start_month: 1,
    }),
  });
  if (!orgRes.ok) return;
  const { organization: org } = (await orgRes.json()) as { organization: OrganizationDto };

  const orgHeaders = {
    Cookie: cookie,
    Origin: env.APP_ORIGIN,
    'X-CSRF-Token': csrf,
    'X-Organization-Id': org.id,
    'Content-Type': 'application/json',
  };

  const seedRes = await call('/v1/accounts/seed-template', {
    method: 'POST',
    headers: { ...orgHeaders, 'Idempotency-Key': 'local-demo-coa-1' },
    body: '{}',
  });
  if (!seedRes.ok) return;
  const { items: accounts } = (await seedRes.json()) as { items: AccountDto[] };
  const coa = (code: string) => accounts.find((a) => a.code === code);

  const bankAcc = coa('1000');
  const capAcc = coa('3000');
  const salesAcc = coa('4000');
  const cogsAcc = coa('5000');
  const feeAcc = coa('5100');
  if (!bankAcc || !capAcc || !salesAcc || !cogsAcc || !feeAcc) return;

  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);

  await call('/v1/periods', {
    method: 'POST',
    headers: { ...orgHeaders, 'Idempotency-Key': 'local-demo-period-1' },
    body: JSON.stringify({
      name: `FY ${year}`,
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
    }),
  });

  await call('/v1/bank-accounts', {
    method: 'POST',
    headers: { ...orgHeaders, 'Idempotency-Key': 'local-demo-bank-1' },
    body: JSON.stringify({
      account_id: bankAcc.id,
      institution: 'Mercury Business Checking',
      last4: '4821',
      ownership_type: 'business',
      opening_balance_minor: '0',
      currency: 'USD',
    }),
  });

  const postEntry = async (
    key: string,
    description: string,
    lines: Array<{ account_id: string; side: 'debit' | 'credit'; amount_minor: string; currency: string }>
  ) => {
    const draftRes = await call('/v1/journal-entries', {
      method: 'POST',
      headers: { ...orgHeaders, 'Idempotency-Key': `${key}-draft` },
      body: JSON.stringify({ entry_date: today, description, lines }),
    });
    if (!draftRes.ok) return;
    const { entry } = (await draftRes.json()) as { entry: JournalEntryDto };
    await call(`/v1/journal-entries/${entry.id}/post`, {
      method: 'POST',
      headers: { ...orgHeaders, 'Idempotency-Key': `${key}-post` },
      body: '{}',
    });
  };

  await postEntry('local-demo-je-1', 'Initial founder & investor capital deposit', [
    { account_id: bankAcc.id, side: 'debit', amount_minor: '5000000', currency: 'USD' },
    { account_id: capAcc.id, side: 'credit', amount_minor: '5000000', currency: 'USD' },
  ]);

  await postEntry('local-demo-je-2', 'Weekly eBay storefront settlements', [
    { account_id: bankAcc.id, side: 'debit', amount_minor: '1850000', currency: 'USD' },
    { account_id: salesAcc.id, side: 'credit', amount_minor: '1850000', currency: 'USD' },
  ]);

  await postEntry('local-demo-je-3', 'Inventory COGS & marketplace fees', [
    { account_id: cogsAcc.id, side: 'debit', amount_minor: '640000', currency: 'USD' },
    { account_id: feeAcc.id, side: 'debit', amount_minor: '185000', currency: 'USD' },
    { account_id: bankAcc.id, side: 'credit', amount_minor: '825000', currency: 'USD' },
  ]);
}

export function createLocalApiApp(options?: {
  localDevMode?: boolean;
  appOrigin?: string;
  seedDemoWorkspace?: boolean;
}) {
  if (options?.localDevMode && process.env['NODE_ENV'] === 'production') {
    throw new Error('LOCAL_DEV_MODE cannot be enabled when NODE_ENV=production');
  }

  const { env, localDevMode: useLocalMode } = buildLocalEnvFromProcess(
    options?.appOrigin ? { APP_ORIGIN: options.appOrigin } : undefined,
    options?.localDevMode
  );

  const store = useLocalMode ? new InMemoryDataStore() : undefined;
  const authGateway =
    useLocalMode && env.TEST_JWT_SECRET
      ? new LocalDevAuthGateway(env.TEST_JWT_SECRET)
      : undefined;

  const coreApp = createApiApp({
    getEnv: () => env,
    ...(store ? { createStore: () => store } : {}),
    ...(authGateway ? { createAuthGateway: () => authGateway } : {}),
    rateLimiter: new InMemoryRateLimiter(),
  });

  if (!useLocalMode || process.env['NODE_ENV'] === 'production') {
    return { app: coreApp, env };
  }

  let seedPromise: Promise<void> | null = null;
  const ensureSeeded = () => {
    if (!seedPromise) {
      seedPromise = options?.seedDemoWorkspace
        ? seedDemoWorkspaceData(coreApp, env)
        : Promise.resolve();
    }
    return seedPromise;
  };
  if (options?.seedDemoWorkspace) {
    void ensureSeeded();
  }

  const app = new Hono<{ Bindings: ApiEnv }>();

  app.post('/v1/dev/auto-login', async (c) => {
    const origin = c.req.header('origin');
    if (origin && origin !== env.APP_ORIGIN) {
      return c.json({ type: 'about:blank', title: 'Invalid origin', status: 403 }, 403);
    }
    await ensureSeeded();
    if (!options?.seedDemoWorkspace) {
      return c.json({ type: 'about:blank', title: 'Not enabled', status: 404 }, 404);
    }
    return coreApp.fetch(
      new Request('http://127.0.0.1:8787/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: env.APP_ORIGIN,
        },
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      }),
      env
    );
  });

  app.all('*', (c) => coreApp.fetch(c.req.raw, c.env ?? env));

  return { app, env };
}

export async function startLocalApiServer(options?: {
  port?: number;
  host?: string;
  localDevMode?: boolean;
  appOrigin?: string;
  seedDemoWorkspace?: boolean;
}): Promise<{ server: http.Server; url: string; close: () => Promise<void> }> {
  const { app, env } = createLocalApiApp(options);

  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? '127.0.0.1:8787';
      const url = new URL(req.url ?? '/', `http://${host}`);
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const rawBody = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) {
          for (const item of v) headers.append(k, String(item));
        } else if (typeof v === 'string') {
          headers.set(k, v);
        }
      }

      const method = (req.method ?? 'GET').toUpperCase();
      const request = new Request(url.toString(), {
        method,
        headers,
        ...(method !== 'GET' && method !== 'HEAD' ? { body: rawBody } : {}),
      });

      const response = await app.fetch(request, env);
      res.statusCode = response.status;

      const setCookies = response.headers.getSetCookie();
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') {
          res.setHeader(key, value);
        }
      });
      if (setCookies.length > 0) {
        res.setHeader('set-cookie', setCookies);
      }

      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
    } catch {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/problem+json');
      res.end(JSON.stringify({ type: 'about:blank', title: 'Internal server error', status: 500 }));
    }
  });

  const host = options?.host ?? '127.0.0.1';
  const port = options?.port ?? Number(process.env['PORT'] ?? 8787);

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;

  return {
    server,
    url: `http://${host}:${actualPort}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
