import {createHash} from 'node:crypto';

const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const CACHE_VERSION = 'v2';
const MAX_AUDIO_BYTES = 4_000_000;

type CacheOptions = {bucket?: string; fetch?: typeof globalThis.fetch; now?: () => number};
type AccessToken = {value: string; expiresAt: number};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function isWav(audio: Buffer): boolean {
  return audio.length >= 48 && audio.length <= MAX_AUDIO_BYTES
    && audio.toString('ascii', 0, 4) === 'RIFF' && audio.toString('ascii', 8, 12) === 'WAVE';
}

async function readBounded(response: Response, limit: number): Promise<Buffer> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > limit)) {
    await response.body?.cancel();
    throw new Error('cache body limit');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new Error('cache body limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, total);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Optional private storage cache. Failures always behave as cache misses. */
export class BeboAudioCache {
  private readonly bucket: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly now: () => number;
  private token?: AccessToken;
  private tokenPending?: Promise<string | undefined>;

  constructor(options: CacheOptions = {}) {
    this.bucket = (options.bucket ?? process.env.BEBO_AUDIO_CACHE_BUCKET ?? '').trim();
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  key(parameters: Record<string, unknown>): string {
    const hash = createHash('sha256').update(canonical({version: CACHE_VERSION, parameters})).digest('hex');
    return `${CACHE_VERSION}/${this.day()}/${hash}.wav`;
  }

  async get(key: string): Promise<Buffer | undefined> {
    if (!this.enabled(key)) return undefined;
    const token = await this.accessToken();
    if (!token) return undefined;
    return this.deadline(1_200, async signal => {
      const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(key)}?alt=media`;
      const response = await this.fetcher(url, {headers: {Authorization: `Bearer ${token}`}, signal, redirect: 'error'});
      if (!response.ok) {
        await response.body?.cancel();
        return undefined;
      }
      const audio = await readBounded(response, MAX_AUDIO_BYTES);
      return isWav(audio) ? audio : undefined;
    });
  }

  async put(key: string, audio: Buffer): Promise<void> {
    if (!this.enabled(key) || !isWav(audio)) return;
    const token = await this.accessToken();
    if (!token) return;
    await this.deadline(2_000, async signal => {
      const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o`);
      url.searchParams.set('uploadType', 'media');
      url.searchParams.set('name', key);
      url.searchParams.set('ifGenerationMatch', '0');
      const response = await this.fetcher(url, {
        method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav'},
        body: audio, signal, redirect: 'error',
      });
      await response.body?.cancel();
    });
  }

  private day(): string { return new Date(this.now()).toISOString().slice(0, 10); }

  private enabled(key: string): boolean {
    return this.bucket.length > 0 && new RegExp(`^${CACHE_VERSION}/${this.day()}/[a-f0-9]{64}\\.wav$`).test(key);
  }

  private async accessToken(): Promise<string | undefined> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    if (this.tokenPending) return this.tokenPending;
    this.tokenPending = this.loadToken();
    try { return await this.tokenPending; }
    finally { this.tokenPending = undefined; }
  }

  private async loadToken(): Promise<string | undefined> {
    const token = await this.deadline(700, async signal => {
      const response = await this.fetcher(METADATA_TOKEN_URL, {headers: {'Metadata-Flavor': 'Google'}, signal, redirect: 'error'});
      if (!response.ok) { await response.body?.cancel(); return undefined; }
      const value: unknown = JSON.parse((await readBounded(response, 8_192)).toString('utf8'));
      if (!value || typeof value !== 'object') return undefined;
      const body = value as Record<string, unknown>;
      if (typeof body.access_token !== 'string' || !body.access_token || body.access_token.length > 4_096 || /[\r\n]/.test(body.access_token)
        || typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in) || body.expires_in <= 0) return undefined;
      return {value: body.access_token, expiresAt: this.now() + Math.max(0, Math.min(body.expires_in, 3_600) - 30) * 1_000};
    });
    if (token) this.token = token;
    return token?.value;
  }

  private async deadline<T>(milliseconds: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(undefined); }, milliseconds);
    });
    try { return await Promise.race([operation(controller.signal), timeout]); }
    catch { return undefined; }
    finally { clearTimeout(timer); }
  }
}
