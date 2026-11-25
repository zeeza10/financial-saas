import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('API_SPECIFICATION & ADR-0006 OpenAPI 3.1 Contract Gate', () => {
  it('documents all /v1 routes and intentionally omits update/delete routes on posted journal entries', () => {
    const specPath = path.resolve(process.cwd(), 'docs/architecture/openapi.v1.json');
    const appPath = path.resolve(process.cwd(), 'apps/api/src/app.ts');

    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    expect(spec.openapi).toBe('3.1.0');

    const appSource = fs.readFileSync(appPath, 'utf8');
    const routeRe = /app\.(get|post|patch|delete)\(\s*'\/v1([^']+)'/g;
    let match: RegExpExecArray | null;
    const discovered: Array<{ method: string; openApiPath: string }> = [];

    while ((match = routeRe.exec(appSource)) !== null) {
      const method = match[1]!;
      const rawPath = match[2]!;
      const openApiPath = rawPath.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');
      discovered.push({ method, openApiPath });
    }

    expect(discovered.length).toBeGreaterThanOrEqual(45);
    for (const { method, openApiPath } of discovered) {
      expect(spec.paths[openApiPath], `Missing OpenAPI path ${openApiPath}`).toBeDefined();
      expect(
        spec.paths[openApiPath]?.[method],
        `Missing method ${method.toUpperCase()} on ${openApiPath}`
      ).toBeDefined();
    }

    // Immutability contract check: no PUT/PATCH/DELETE on journal entries (API_SPECIFICATION §3)
    expect(spec.paths['/journal-entries/{entryId}']).toBeUndefined();
  });
});
