import type { R2BucketLike } from '@financial-saas/storage';

export interface ApiEnv {
  APP_ORIGIN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_JWKS_URL?: string;
  COOKIE_SIGNING_SECRET: string;
  CSRF_SECRET: string;
  STORAGE_DRIVER?: string;
  ATTACHMENTS_BUCKET?: R2BucketLike;
  /** Used only in automated tests with local HS256 test tokens */
  TEST_JWT_SECRET?: string;
}
