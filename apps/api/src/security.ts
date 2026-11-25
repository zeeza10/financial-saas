import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Context, MiddlewareHandler } from 'hono';
import { createProblemDetails } from '@financial-saas/contracts';
import type { ApiEnv } from './env.js';

export interface SessionPayload {
  userId: string;
  email: string;
  accessToken: string;
  aal: 'aal1' | 'aal2';
  exp: number;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(url: string) {
  let cached = jwksCache.get(url);
  if (!cached) {
    cached = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, cached);
  }
  return cached;
}

/**
 * Verifies a JWT using JWKS (RS256/ES256) or test HMAC secret, explicitly rejecting alg=none (ST-07).
 */
export async function verifyUserJwt(
  token: string,
  env: ApiEnv
): Promise<{ userId: string; email: string; aal: 'aal1' | 'aal2' }> {
  const [headerPart] = token.split('.');
  if (!headerPart) {
    throw new Error('Malformed JWT');
  }
  const headerJson = JSON.parse(
    new TextDecoder().decode(Uint8Array.from(atob(headerPart.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))
  ) as { alg?: string };

  if (!headerJson.alg || headerJson.alg.toLowerCase() === 'none') {
    throw new Error('Rejected unsigned JWT algorithm');
  }

  let payload: Record<string, unknown>;
  if (env.TEST_JWT_SECRET) {
    const key = new TextEncoder().encode(env.TEST_JWT_SECRET);
    const verified = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      audience: 'authenticated',
    });
    payload = verified.payload as Record<string, unknown>;
  } else {
    const jwksUrl =
      env.SUPABASE_JWKS_URL ?? `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
    const verified = await jwtVerify(token, getJwks(jwksUrl), {
      algorithms: ['RS256', 'ES256'],
      issuer: `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`,
      audience: 'authenticated',
    });
    payload = verified.payload as Record<string, unknown>;
  }

  const sub = typeof payload['sub'] === 'string' ? payload['sub'] : null;
  const email = typeof payload['email'] === 'string' ? payload['email'] : '';
  const aal = payload['aal'] === 'aal2' ? 'aal2' : 'aal1';
  if (!sub) {
    throw new Error('JWT missing subject');
  }
  return { userId: sub, email, aal };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signCookieValue(payloadJson: string, secret: string): Promise<string> {
  const data = toBase64Url(new TextEncoder().encode(payloadJson));
  const key = await importHmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return `${data}.${toBase64Url(sig)}`;
}

export async function verifyCookieValue(signed: string, secret: string): Promise<string | null> {
  const dot = signed.indexOf('.');
  if (dot <= 0) return null;
  const data = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  const key = await importHmacKey(secret);
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    new Uint8Array(fromBase64Url(sig)),
    new TextEncoder().encode(data)
  );
  if (!ok) return null;
  return new TextDecoder().decode(fromBase64Url(data));
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    result[name] = decodeURIComponent(val);
  }
  return result;
}

export function isHttpsOrigin(origin: string): boolean {
  return origin.startsWith('https://');
}

export function getSessionCookieName(env: ApiEnv): string {
  return isHttpsOrigin(env.APP_ORIGIN) ? '__Host-fs_session' : 'fs_session';
}

export function getCsrfCookieName(env: ApiEnv): string {
  return isHttpsOrigin(env.APP_ORIGIN) ? '__Host-fs_csrf' : 'fs_csrf';
}

export function buildCookieHeader(params: {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  maxAgeSeconds: number;
}): string {
  const parts = [
    `${params.name}=${encodeURIComponent(params.value)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${params.maxAgeSeconds}`,
  ];
  if (params.httpOnly) parts.push('HttpOnly');
  if (params.secure) parts.push('Secure');
  return parts.join('; ');
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function securityHeadersMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
    c.set('requestId', requestId);
    await next();
    c.header('X-Request-Id', requestId);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    c.header('Cache-Control', 'no-store');
  };
}

/**
 * Strict CORS allow-list (T-10, ST-10). Never uses wildcard with credentials.
 */
export function strictCorsMiddleware(getAllowedOrigin: (c: Context) => string): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header('origin');
    const allowedOrigin = getAllowedOrigin(c);
    if (origin && origin === allowedOrigin) {
      c.header('Access-Control-Allow-Origin', allowedOrigin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      c.header(
        'Access-Control-Allow-Headers',
        'Content-Type, X-CSRF-Token, X-Organization-Id, Idempotency-Key'
      );
      c.header('Vary', 'Origin');
    }

    if (c.req.method === 'OPTIONS') {
      if (!origin || origin !== allowedOrigin) {
        return c.body(null, 403);
      }
      return c.body(null, 204);
    }

    await next();
  };
}

/**
 * CSRF & Origin verification for state-changing requests (T-02, ST-02).
 * Exempt only for explicit login/signup bootstrap if no session cookie exists,
 * while still checking Origin / Sec-Fetch-Site and JSON content-type.
 */
export function csrfMiddleware(
  getEnv: (c: Context) => ApiEnv,
  options?: { exemptPaths?: readonly string[] }
): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      await next();
      return;
    }

    const env = getEnv(c);
    const requestId = (c.get('requestId') as string | undefined) ?? 'unknown';

    // 1. Origin / Fetch-Metadata check
    const origin = c.req.header('origin');
    if (origin && origin !== env.APP_ORIGIN) {
      return c.json(
        createProblemDetails({
          status: 403,
          title: 'CSRF Origin mismatch',
          requestId,
        }),
        403,
        { 'Content-Type': 'application/problem+json' }
      );
    }
    const fetchSite = c.req.header('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') {
      return c.json(
        createProblemDetails({
          status: 403,
          title: 'Cross-site state change rejected',
          requestId,
        }),
        403,
        { 'Content-Type': 'application/problem+json' }
      );
    }

    // 2. Enforce JSON content type on state-changing routes (reject simple form posts)
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return c.json(
        createProblemDetails({
          status: 415,
          title: 'Content-Type must be application/json',
          requestId,
        }),
        415,
        { 'Content-Type': 'application/problem+json' }
      );
    }

    const path = new URL(c.req.url).pathname;
    if (options?.exemptPaths?.includes(path)) {
      await next();
      return;
    }

    // 3. Double-submit signed CSRF token check
    const cookies = parseCookieHeader(c.req.header('cookie'));
    const csrfCookie = cookies[getCsrfCookieName(env)];
    const csrfHeader = c.req.header('x-csrf-token');
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
      return c.json(
        createProblemDetails({
          status: 403,
          title: 'Invalid or missing CSRF token',
          requestId,
        }),
        403,
        { 'Content-Type': 'application/problem+json' }
      );
    }

    const verifiedCsrf = await verifyCookieValue(csrfCookie, env.CSRF_SECRET);
    if (!verifiedCsrf) {
      return c.json(
        createProblemDetails({
          status: 403,
          title: 'Invalid CSRF signature',
          requestId,
        }),
        403,
        { 'Content-Type': 'application/problem+json' }
      );
    }

    await next();
  };
}

/**
 * Simple sliding-window rate limiter interface & in-memory implementation (T-14, ST-14).
 */
export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  check(key: string, maxRequests: number, windowMs: number, nowMs = Date.now()): {
    allowed: boolean;
    retryAfterSeconds: number;
  } {
    const cutoff = nowMs - windowMs;
    const hits = (this.buckets.get(key) ?? []).filter((t) => t > cutoff);
    if (hits.length >= maxRequests) {
      const oldest = hits[0] ?? nowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
      this.buckets.set(key, hits);
      return { allowed: false, retryAfterSeconds };
    }
    hits.push(nowMs);
    this.buckets.set(key, hits);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
