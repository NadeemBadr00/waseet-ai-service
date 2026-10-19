import test from 'node:test';
import assert from 'node:assert/strict';
import {BeboAudioCache} from '../../src/features/bebo/audio-cache.js';

const DAY = Date.UTC(2026, 9, 2, 12);
const WAV = Buffer.alloc(100);
WAV.write('RIFF'); WAV.write('WAVE', 8);
const PARAMS = {text: 'Hello friend', dialect: 'english', voice: 'Puck', model: 'flash', style: 'cartoon'};
const tokenResponse = () => Response.json({access_token: 'masked-test-token', expires_in: 3_600});
const asFetch = (callback: (input: string | URL | Request, init?: RequestInit) => Promise<Response>) => callback as typeof globalThis.fetch;

test('audio cache without configuration has no network side effects', async () => {
  let calls = 0;
  const cache = new BeboAudioCache({bucket: '', now: () => DAY, fetch: asFetch(async () => {calls++; throw new Error('unexpected');})});
  const key = cache.key(PARAMS);
  assert.equal(await cache.get(key), undefined);
  await cache.put(key, WAV);
  assert.equal(calls, 0);
});

test('exact parameters use canonical private SHA keys; token refresh is deduplicated', async () => {
  let now = DAY; let tokenCalls = 0; let audioCalls = 0;
  const cache = new BeboAudioCache({bucket: 'private-test-bucket', now: () => now, fetch: asFetch(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'metadata.google.internal') {
      tokenCalls++;
      assert.equal(new Headers(init?.headers).get('Metadata-Flavor'), 'Google');
      return tokenResponse();
    }
    audioCalls++;
    assert.equal(new Headers(init?.headers).get('Authorization')?.startsWith('Bearer '), true);
    assert.equal(url.hostname, 'storage.googleapis.com');
    assert.equal(url.pathname, `/storage/v1/b/private-test-bucket/o/${encodeURIComponent(cache.key(PARAMS))}`);
    assert.equal(url.searchParams.get('alt'), 'media');
    assert.equal(init?.redirect, 'error');
    assert.ok(!url.toString().includes('Hello'));
    return new Response(WAV);
  })});
  const key = cache.key(PARAMS);
  assert.match(key, /^v2\/2026-10-02\/[a-f0-9]{64}\.wav$/);
  assert.equal(key, cache.key({...PARAMS, text: PARAMS.text}));
  assert.equal(key, cache.key({style: 'cartoon', model: 'flash', voice: 'Puck', dialect: 'english', text: 'Hello friend'}));
  assert.notEqual(key, cache.key({...PARAMS, voice: 'Kore'}));
  assert.notEqual(key, cache.key({...PARAMS, style: 'quiet'}));
  const results = await Promise.all([cache.get(key), cache.get(key)]);
  results.forEach(audio => assert.deepEqual(audio, WAV));
  assert.equal(tokenCalls, 1); assert.equal(audioCalls, 2);
  now += 3_580_000;
  assert.deepEqual(await cache.get(key), WAV);
  assert.equal(tokenCalls, 2);
  now += 86_400_000;
  assert.equal(await cache.get(key), undefined);
  assert.equal(audioCalls, 3);
  assert.notEqual(cache.key(PARAMS), key);
});

test('bad audio, HTTP misses, oversize content and network failures fail open', async () => {
  const responses = [
    () => new Response('missing', {status: 404}),
    () => new Response(Buffer.alloc(100)),
    () => new Response(WAV, {headers: {'content-length': '4000001'}}),
    () => new Response(new Uint8Array(4_000_001)),
    () => new Response(Buffer.alloc(47)),
    () => {throw new Error('private upstream diagnostics');},
  ];
  for (const response of responses) {
    const cache = new BeboAudioCache({bucket: 'private-test-bucket', now: () => DAY, fetch: asFetch(async input => String(input).includes('metadata.google.internal') ? tokenResponse() : response())});
    assert.equal(await cache.get(cache.key(PARAMS)), undefined);
  }
  const cache = new BeboAudioCache({bucket: 'private-test-bucket', now: () => DAY, fetch: asFetch(async () => Response.json({access_token: '', expires_in: 3_600}))});
  assert.equal(await cache.get(cache.key(PARAMS)), undefined);
});

test('uploads use private media insert with immutable object precondition and reject bad bytes', async () => {
  let tokenCalls = 0; let uploads = 0;
  const cache = new BeboAudioCache({bucket: 'private-test-bucket', now: () => DAY, fetch: asFetch(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'metadata.google.internal') {tokenCalls++; return tokenResponse();}
    uploads++;
    assert.equal(url.hostname, 'storage.googleapis.com');
    assert.equal(url.pathname, '/upload/storage/v1/b/private-test-bucket/o');
    assert.equal(url.searchParams.get('uploadType'), 'media');
    assert.equal(url.searchParams.get('ifGenerationMatch'), '0');
    assert.equal(url.searchParams.get('name'), cache.key(PARAMS));
    assert.equal(url.searchParams.has('predefinedAcl'), false);
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'audio/wav');
    assert.deepEqual(init?.body, WAV);
    return new Response(null, {status: 412});
  })});
  const key = cache.key(PARAMS);
  await cache.put(key, WAV);
  await cache.put(key, Buffer.alloc(100));
  await cache.put('v2/2026-10-01/' + 'a'.repeat(64) + '.wav', WAV);
  assert.equal(tokenCalls, 1); assert.equal(uploads, 1);
});

test('metadata deadline returns a miss even when a mocked fetch ignores abort', async () => {
  const cache = new BeboAudioCache({bucket: 'private-test-bucket', now: () => DAY, fetch: asFetch(async () => new Promise<Response>(() => {}))});
  const started = performance.now();
  assert.equal(await cache.get(cache.key(PARAMS)), undefined);
  assert.ok(performance.now() - started < 1_200);
});

test('storage get and put deadlines fail open after authentication', async () => {
  const cache = new BeboAudioCache({bucket: 'private-test-bucket', now: () => DAY, fetch: asFetch(async input => {
    if (String(input).includes('metadata.google.internal')) return tokenResponse();
    return new Promise<Response>(() => {});
  })});
  const key = cache.key(PARAMS);
  const started = performance.now();
  const [read, written] = await Promise.all([cache.get(key), cache.put(key, WAV)]);
  assert.equal(read, undefined); assert.equal(written, undefined);
  assert.ok(performance.now() - started < 2_600);
});
