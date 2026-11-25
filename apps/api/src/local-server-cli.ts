import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { startLocalApiServer } from './local-server.js';

const envLocalPath = resolve(process.cwd(), '.env.local');
if (existsSync(envLocalPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envLocalPath);
}

const localDevMode = process.env['LOCAL_DEV_MODE'] !== 'false';

void startLocalApiServer({
  localDevMode,
}).then(({ url }) => {
  const modeLabel = localDevMode
    ? 'offline in-memory mode (LOCAL_DEV_MODE=true)'
    : `live Supabase mode (${process.env['SUPABASE_URL'] ?? 'unconfigured'})`;
  console.log(`Financial SaaS local API listening on ${url} [${modeLabel}]`);
});
