import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { config } from '../config';

// ── Interface ─────────────────────────────────────────────────────────────────

export interface StorageDriver {
  /** Persist `buffer` and return the stored path/key used to retrieve it later. */
  save(buffer: Buffer, filename: string, mimeType: string): Promise<string>;
  /** Retrieve file by the path/key returned from save(). Returns a Buffer. */
  read(storedPath: string): Promise<Buffer>;
  /** Delete file by the path/key returned from save(). */
  delete(storedPath: string): Promise<void>;
}

// ── Local driver ──────────────────────────────────────────────────────────────

export class LocalStorageDriver implements StorageDriver {
  private readonly basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  private datePath(): string {
    const now = new Date();
    return path.join(
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0')
    );
  }

  async save(buffer: Buffer, filename: string, _mimeType: string): Promise<string> {
    const datePart = this.datePath();
    const dir = path.join(this.basePath, datePart);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const ext = path.extname(filename) || '';
    const storedName = `${randomUUID()}${ext}`;
    const storedPath = path.join(datePart, storedName);
    const fullPath = path.join(this.basePath, storedPath);

    await fs.promises.writeFile(fullPath, buffer);
    return storedPath; // relative path used as key
  }

  async read(storedPath: string): Promise<Buffer> {
    const fullPath = path.join(this.basePath, storedPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${storedPath}`);
    }
    return fs.promises.readFile(fullPath);
  }

  async delete(storedPath: string): Promise<void> {
    const fullPath = path.join(this.basePath, storedPath);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }
}

// ── S3 driver (AWS Signature V4 via fetch) ────────────────────────────────────

type AwsCredentials = {
  accessKey: string;
  secretKey: string;
  region: string;
  bucket: string;
  endpoint?: string;
  forcePathStyle: boolean;
};

async function sha256Hex(data: string | Buffer): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(data).digest('hex');
}

async function hmacSha256(key: Buffer, data: string): Promise<Buffer> {
  const { createHmac } = await import('crypto');
  return createHmac('sha256', key).update(data).digest();
}

async function getSigningKey(secretKey: string, date: string, region: string, service: string): Promise<Buffer> {
  const dateKey = await hmacSha256(Buffer.from(`AWS4${secretKey}`), date);
  const regionKey = await hmacSha256(dateKey, region);
  const serviceKey = await hmacSha256(regionKey, service);
  return hmacSha256(serviceKey, 'aws4_request');
}

export class S3StorageDriver implements StorageDriver {
  private readonly creds: AwsCredentials;

  constructor(creds: AwsCredentials) {
    this.creds = creds;
  }

  private getBaseUrl(): string {
    if (this.creds.endpoint) {
      if (this.creds.forcePathStyle) {
        return `${this.creds.endpoint}/${this.creds.bucket}`;
      }
      return `${this.creds.endpoint}`;
    }
    return `https://s3.${this.creds.region}.amazonaws.com/${this.creds.bucket}`;
  }

  private getObjectUrl(key: string): string {
    if (this.creds.endpoint) {
      if (this.creds.forcePathStyle) {
        return `${this.creds.endpoint}/${this.creds.bucket}/${key}`;
      }
      return `${this.creds.endpoint}/${key}`;
    }
    return `https://${this.creds.bucket}.s3.${this.creds.region}.amazonaws.com/${key}`;
  }

  private async signRequest(method: string, key: string, headers: Record<string, string>, payloadHash: string): Promise<Record<string, string>> {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);

    const host = this.creds.endpoint
      ? new URL(this.creds.endpoint).host
      : `${this.creds.bucket}.s3.${this.creds.region}.amazonaws.com`;

    const allHeaders: Record<string, string> = {
      ...headers,
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    const sortedKeys = Object.keys(allHeaders).sort();
    const canonicalHeaders = sortedKeys.map((k) => `${k.toLowerCase()}:${allHeaders[k].trim()}`).join('\n') + '\n';
    const signedHeaders = sortedKeys.map((k) => k.toLowerCase()).join(';');

    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const canonicalPath = this.creds.forcePathStyle ? `/${this.creds.bucket}/${encodedKey}` : `/${encodedKey}`;

    const canonicalRequest = [method, canonicalPath, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/${this.creds.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

    const signingKey = await getSigningKey(this.creds.secretKey, dateStamp, this.creds.region, 's3');
    const { createHmac } = await import('crypto');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${this.creds.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return { ...allHeaders, authorization, 'x-amz-date': amzDate };
  }

  async save(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const now = new Date();
    const datePart = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ext = path.extname(filename) || '';
    const key = `uploads/${datePart}/${randomUUID()}${ext}`;

    const payloadHash = await sha256Hex(buffer);
    const headers: Record<string, string> = { 'content-type': mimeType, 'content-length': String(buffer.length) };
    const signedHeaders = await this.signRequest('PUT', key, headers, payloadHash);

    const url = this.getObjectUrl(key);
    const res = await fetch(url, {
      method: 'PUT',
      headers: signedHeaders,
      body: buffer,
    });

    if (!res.ok) {
      throw new Error(`S3 upload failed: ${res.status} ${await res.text()}`);
    }

    return key;
  }

  async read(storedPath: string): Promise<Buffer> {
    const payloadHash = await sha256Hex('');
    const signedHeaders = await this.signRequest('GET', storedPath, {}, payloadHash);

    const url = this.getObjectUrl(storedPath);
    const res = await fetch(url, { method: 'GET', headers: signedHeaders });

    if (!res.ok) {
      throw new Error(`S3 download failed: ${res.status} ${await res.text()}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(storedPath: string): Promise<void> {
    const payloadHash = await sha256Hex('');
    const signedHeaders = await this.signRequest('DELETE', storedPath, {}, payloadHash);

    const url = this.getObjectUrl(storedPath);
    const res = await fetch(url, { method: 'DELETE', headers: signedHeaders });

    if (!res.ok && res.status !== 204 && res.status !== 404) {
      throw new Error(`S3 delete failed: ${res.status} ${await res.text()}`);
    }
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

let _storage: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (_storage) return _storage;

  if (config.STORAGE_DRIVER === 's3') {
    if (!config.S3_BUCKET || !config.S3_REGION || !config.S3_ACCESS_KEY || !config.S3_SECRET_KEY) {
      throw new Error('S3 storage driver requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY, and S3_SECRET_KEY env vars');
    }
    _storage = new S3StorageDriver({
      accessKey: config.S3_ACCESS_KEY,
      secretKey: config.S3_SECRET_KEY,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    });
  } else {
    _storage = new LocalStorageDriver(path.resolve(config.STORAGE_LOCAL_PATH));
  }

  return _storage;
}

// ── Convenience helper ────────────────────────────────────────────────────────

export async function saveUploadedFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<{ filename: string; path: string; url: string }> {
  const storage = getStorage();
  const storedPath = await storage.save(buffer, originalName, mimeType);

  // Derive a public URL
  let url: string;
  if (config.STORAGE_DRIVER === 's3') {
    const bucket = config.S3_BUCKET!;
    const region = config.S3_REGION!;
    if (config.S3_ENDPOINT) {
      url = config.S3_FORCE_PATH_STYLE
        ? `${config.S3_ENDPOINT}/${bucket}/${storedPath}`
        : `${config.S3_ENDPOINT}/${storedPath}`;
    } else {
      url = `https://${bucket}.s3.${region}.amazonaws.com/${storedPath}`;
    }
  } else {
    // Local: serve from /uploads/... (assumes a static file route is registered)
    url = `/uploads/${storedPath.replace(/\\/g, '/')}`;
  }

  return { filename: storedPath, path: storedPath, url };
}
