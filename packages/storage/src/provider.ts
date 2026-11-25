export const ALLOWED_ATTACHMENT_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/csv',
]);

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MiB

export interface StoredObjectMeta {
  readonly key: string;
  readonly sizeBytes: number;
  readonly contentType: string;
  readonly sha256Hex: string;
}

export interface StorageProvider {
  putObject(params: {
    organizationId: string;
    objectId: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<StoredObjectMeta>;
  getObject(params: { organizationId: string; key: string }): Promise<{
    body: Uint8Array;
    contentType: string;
  } | null>;
  deleteObject(params: { organizationId: string; key: string }): Promise<void>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Builds and validates an organization-scoped object key so path traversal
 * and cross-tenant key access are structurally blocked (T-09, T-11).
 */
export function buildOrgStorageKey(organizationId: string, objectId: string): string {
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(objectId)) {
    throw new Error('Storage keys require valid UUID organizationId and objectId');
  }
  return `${organizationId.toLowerCase()}/${objectId.toLowerCase()}`;
}

export function assertKeyBelongsToOrg(organizationId: string, key: string): void {
  if (!UUID_RE.test(organizationId)) {
    throw new Error('Invalid organizationId');
  }
  const expectedPrefix = `${organizationId.toLowerCase()}/`;
  if (!key.startsWith(expectedPrefix) || key.includes('..') || key.includes('\\')) {
    throw new Error('Storage key does not belong to organization');
  }
}

/**
 * Validates file content using magic bytes for binary types (T-11, ST-11).
 */
export function validateUploadBytes(contentType: string, body: Uint8Array): void {
  if (!ALLOWED_ATTACHMENT_MIMES.has(contentType)) {
    throw new Error(`Unsupported file type: ${contentType}`);
  }
  if (body.byteLength === 0 || body.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File size must be between 1 byte and ${MAX_ATTACHMENT_BYTES} bytes`);
  }
  if (contentType === 'application/pdf') {
    const header = new TextDecoder().decode(body.subarray(0, 5));
    if (header !== '%PDF-') {
      throw new Error('File content does not match PDF signature');
    }
  } else if (contentType === 'image/png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (body.length < 8 || !sig.every((b, idx) => body[idx] === b)) {
      throw new Error('File content does not match PNG signature');
    }
  } else if (contentType === 'image/jpeg') {
    if (body.length < 3 || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) {
      throw new Error('File content does not match JPEG signature');
    }
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * In-memory storage adapter for local development and deterministic tests.
 */
export class InMemoryStorageProvider implements StorageProvider {
  private readonly store = new Map<string, { body: Uint8Array; contentType: string }>();

  async putObject(params: {
    organizationId: string;
    objectId: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<StoredObjectMeta> {
    validateUploadBytes(params.contentType, params.body);
    const key = buildOrgStorageKey(params.organizationId, params.objectId);
    const copy = new Uint8Array(params.body);
    this.store.set(key, { body: copy, contentType: params.contentType });
    return {
      key,
      sizeBytes: copy.byteLength,
      contentType: params.contentType,
      sha256Hex: await sha256Hex(copy),
    };
  }

  async getObject(params: { organizationId: string; key: string }) {
    assertKeyBelongsToOrg(params.organizationId, params.key);
    const entry = this.store.get(params.key);
    return entry ? { body: new Uint8Array(entry.body), contentType: entry.contentType } : null;
  }

  async deleteObject(params: { organizationId: string; key: string }): Promise<void> {
    assertKeyBelongsToOrg(params.organizationId, params.key);
    this.store.delete(params.key);
  }
}

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}

/**
 * Cloudflare R2 storage adapter (CLOUDFLARE R2 FILE STORAGE, Section 10).
 */
export class R2StorageProvider implements StorageProvider {
  constructor(private readonly bucket: R2BucketLike) {}

  async putObject(params: {
    organizationId: string;
    objectId: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<StoredObjectMeta> {
    validateUploadBytes(params.contentType, params.body);
    const key = buildOrgStorageKey(params.organizationId, params.objectId);
    const copy = new Uint8Array(params.body);
    await this.bucket.put(key, copy, {
      httpMetadata: { contentType: params.contentType },
    });
    return {
      key,
      sizeBytes: copy.byteLength,
      contentType: params.contentType,
      sha256Hex: await sha256Hex(copy),
    };
  }

  async getObject(params: { organizationId: string; key: string }) {
    assertKeyBelongsToOrg(params.organizationId, params.key);
    const obj = await this.bucket.get(params.key);
    if (!obj) return null;
    const buf = await obj.arrayBuffer();
    return {
      body: new Uint8Array(buf),
      contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
    };
  }

  async deleteObject(params: { organizationId: string; key: string }): Promise<void> {
    assertKeyBelongsToOrg(params.organizationId, params.key);
    await this.bucket.delete(params.key);
  }
}
