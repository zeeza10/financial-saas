import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { SignJWT } from 'jose';
import { createApiApp, type AuthGateway } from './app.js';
import type { ApiEnv } from './env.js';
import { InMemoryRateLimiter } from './security.js';
import { ApiDomainError, InMemoryDataStore } from './store.js';

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

export function createLocalApiApp(options?: {
  localDevMode?: boolean;
  appOrigin?: string;
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

  const app = createApiApp({
    getEnv: () => env,
    ...(store ? { createStore: () => store } : {}),
    ...(authGateway ? { createAuthGateway: () => authGateway } : {}),
    rateLimiter: new InMemoryRateLimiter(),
  });

  return { app, env };
}

export async function startLocalApiServer(options?: {
  port?: number;
  host?: string;
  localDevMode?: boolean;
  appOrigin?: string;
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

const isEntrypoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  void startLocalApiServer({ localDevMode: process.env['LOCAL_DEV_MODE'] !== 'false' }).then(
    ({ url }) => {
      console.log(`Financial SaaS local API listening on ${url}`);
    }
  );
}
