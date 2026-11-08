import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, unlink, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createClient, parseRpc, loadAuth, saveAuth, EsthmrOff,
  ESTHMR_URL, TOKEN_URL, CALL_TIMEOUT_MS, MAX_IN_FLIGHT, REFRESH_EARLY_MS, USER_AGENT,
} from '../services/esthmrClient.js';

const NOW = 1_800_000_000_000;
const leaks = []; // every log line and error message seen, checked for token leaks at the end

async function authFile(over = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'esthmr-'));
  const file = path.join(dir, 'esthmr_auth.json');
  await writeFile(file, JSON.stringify({ client_id: 'cid', access_token: 'tok-A', refresh_token: 'ref-A', expires_at: NOW + 3600_000, ...over }));
  return file;
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const ok = (id, sc) => json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'x' }], structuredContent: sc } });

// A fake ESTHMR: initialize → session S1; tools/call answered by `onCall`; token endpoint by `onToken`.
function fake({ onCall = (msg) => ok(msg.id, { tool: msg.params.name }), onToken } = {}) {
  const reqs = [];
  const fetchImpl = async (url, init) => {
    const r = { url, headers: init.headers, body: init.body, method: init.method };
    reqs.push(r);
    if (url === TOKEN_URL) {
      return onToken ? onToken(r) : json({ access_token: 'tok-B', refresh_token: 'ref-B', expires_in: 3600 });
    }
    const msg = JSON.parse(init.body);
    r.rpc = msg.method;
    if (msg.method === 'initialize') return json({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18' } }, 200, { 'mcp-session-id': 'S1' });
    if (msg.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return onCall(msg, init, r);
  };
  return { reqs, fetchImpl, calls: () => reqs.filter((r) => r.rpc === 'tools/call'), tokenHits: () => reqs.filter((r) => r.url === TOKEN_URL).length };
}

const client = async (f, over = {}, opts = {}) => {
  const logs = [];
  const c = createClient({ authFile: await authFile(over), fetchImpl: f.fetchImpl, now: () => NOW, log: (m) => { logs.push(m); leaks.push(m); }, ...opts });
  return { c, logs };
};
const rejects = async (p, cls) => {
  try { await p; } catch (e) { leaks.push(e.message); if (cls) assert.ok(e instanceof cls, `${e.name}: ${e.message}`); return e; }
  assert.fail('expected a rejection');
};

test('constants', () => {
  assert.equal(ESTHMR_URL, 'https://esthmr.com/mcp');
  assert.equal(TOKEN_URL, 'https://esthmr.com/oauth/token');
  assert.deepEqual([CALL_TIMEOUT_MS, MAX_IN_FLIGHT, REFRESH_EARLY_MS], [8000, 4, 60000]);
  assert.match(USER_AGENT, /^egx-dashboard\/\d+\.\d+\.\d+$/);
});

test('parseRpc reads JSON and SSE answers', () => {
  assert.deepEqual(parseRpc('{"jsonrpc":"2.0","id":3,"result":{}}', 'application/json'), { jsonrpc: '2.0', id: 3, result: {} });
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"x":1}}\n\n';
  assert.deepEqual(parseRpc(sse, 'text/event-stream'), { jsonrpc: '2.0', id: 3, result: { x: 1 } });
  assert.equal(parseRpc('', 'application/json'), null);
});

test('happy path: initialize, initialized, tools/call with honest headers; returns structuredContent', async () => {
  const f = fake();
  const { c } = await client(f);
  assert.deepEqual(await c.callTool('what_moved', { count: 5 }), { tool: 'what_moved' });
  assert.deepEqual(f.reqs.map((r) => r.rpc), ['initialize', 'notifications/initialized', 'tools/call']);
  for (const r of f.reqs) {
    assert.equal(r.url, ESTHMR_URL);
    assert.match(r.headers['User-Agent'], /^egx-dashboard\/\d+\.\d+\.\d+$/);
    assert.equal(r.headers.Authorization, 'Bearer tok-A');
    assert.equal(r.headers['MCP-Protocol-Version'], '2025-06-18');
    assert.equal(r.headers.Accept, 'application/json, text/event-stream');
  }
  assert.equal(f.reqs[2].headers['Mcp-Session-Id'], 'S1');
  assert.deepEqual(JSON.parse(f.reqs[2].body).params, { name: 'what_moved', arguments: { count: 5 } });
});

test('SSE tool answers work end to end', async () => {
  const f = fake({ onCall: (msg) => new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { structuredContent: { a: 1 } } })}\n\n`, { headers: { 'content-type': 'text/event-stream' } }) });
  const { c } = await client(f);
  assert.deepEqual(await c.callTool('x', {}), { a: 1 });
});

test('one session for concurrent calls', async () => {
  const f = fake();
  const { c } = await client(f);
  await Promise.all([c.callTool('a', {}), c.callTool('b', {}), c.callTool('c', {})]);
  assert.equal(f.reqs.filter((r) => r.rpc === 'initialize').length, 1);
  assert.equal(f.calls().length, 3);
});

test('error answers throw: isError, text only (allowance used up), HTTP 500/429, JSON-RPC error', async () => {
  const answers = [
    (msg) => json({ jsonrpc: '2.0', id: msg.id, result: { isError: true, content: [{ type: 'text', text: 'limit reached' }] } }),
    (msg) => json({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: 'You have used today\'s 300 requests' }] } }),
    () => new Response('oops', { status: 500 }),
    () => new Response('slow down', { status: 429 }),
    (msg) => json({ jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'bad args' } }),
  ];
  for (const onCall of answers) {
    const { c } = await client(fake({ onCall }));
    const e = await rejects(c.callTool('x', {}));
    assert.ok(!(e instanceof EsthmrOff));
  }
});

test('no auth file → EsthmrOff without any request', async () => {
  const f = fake();
  const c = createClient({ authFile: path.join(os.tmpdir(), 'no-such-dir-esthmr', 'esthmr_auth.json'), fetchImpl: f.fetchImpl, now: () => NOW, log: () => {} });
  await rejects(c.callTool('x', {}), EsthmrOff);
  assert.equal(f.reqs.length, 0);
});

test('a token about to expire is refreshed first, and the rotated tokens are saved atomically', async () => {
  const f = fake();
  const file = await authFile({ expires_at: NOW + 30_000 });
  const c = createClient({ authFile: file, fetchImpl: f.fetchImpl, now: () => NOW, log: () => {} });
  await c.callTool('x', {});
  assert.equal(f.reqs[0].url, TOKEN_URL);
  const form = new URLSearchParams(f.reqs[0].body);
  assert.deepEqual([form.get('grant_type'), form.get('refresh_token'), form.get('client_id')], ['refresh_token', 'ref-A', 'cid']);
  assert.match(f.reqs[0].headers['User-Agent'], /^egx-dashboard\//);
  assert.equal(f.calls()[0].headers.Authorization, 'Bearer tok-B');
  const saved = JSON.parse(await readFile(file, 'utf-8'));
  assert.deepEqual([saved.access_token, saved.refresh_token, saved.expires_at, saved.client_id], ['tok-B', 'ref-B', NOW + 3600_000, 'cid']);
  assert.deepEqual(await readdir(path.dirname(file)), ['esthmr_auth.json']); // no .tmp left behind
});

test('an expired token with 4 concurrent calls is refreshed exactly once (Review Focus 1)', async () => {
  const f = fake();
  const { c } = await client(f, { expires_at: NOW - 1000 });
  await Promise.all([1, 2, 3, 4].map((i) => c.callTool(`t${i}`, {})));
  assert.equal(f.tokenHits(), 1);
  assert.ok(f.calls().every((r) => r.headers.Authorization === 'Bearer tok-B'));
});

test('401 → one refresh and a retry', async () => {
  const f = fake({ onCall: (msg, init) => (init.headers.Authorization === 'Bearer tok-A' ? new Response('', { status: 401 }) : ok(msg.id, { fine: true })) });
  const { c } = await client(f);
  assert.deepEqual(await c.callTool('x', {}), { fine: true });
  assert.equal(f.tokenHits(), 1);
});

test('401 again after the refresh throws, without looping', async () => {
  const f = fake({ onCall: () => new Response('', { status: 401 }) });
  const { c } = await client(f);
  await rejects(c.callTool('x', {}));
  assert.equal(f.tokenHits(), 1);
});

test('a failed refresh turns ESTHMR off and logs the sign-in message once', async () => {
  const f = fake({ onToken: () => json({ error: 'invalid_grant' }, 400) });
  const { c, logs } = await client(f, { expires_at: NOW - 1000 });
  await rejects(c.callTool('x', {}), EsthmrOff);
  await rejects(c.callTool('y', {}), EsthmrOff);
  assert.deepEqual(logs, ['ESTHMR sign-in expired: run npm run esthmr:login']);
  assert.equal(f.calls().length, 0);
});

test('an expired session (404) is re-initialized once', async () => {
  let first = true;
  const f = fake({ onCall: (msg) => { if (first) { first = false; return new Response('', { status: 404 }); } return ok(msg.id, { again: true }); } });
  const { c } = await client(f);
  assert.deepEqual(await c.callTool('x', {}), { again: true });
  assert.equal(f.reqs.filter((r) => r.rpc === 'initialize').length, 2);
});

test('at most 4 tool calls in flight', async () => {
  let open;
  const gate = new Promise((r) => { open = r; });
  let inFlight = 0;
  let max = 0;
  const f = fake({ onCall: async (msg) => { inFlight++; max = Math.max(max, inFlight); await gate; inFlight--; return ok(msg.id, {}); } });
  const { c } = await client(f);
  const all = Promise.all(Array.from({ length: 10 }, (_, i) => c.callTool(`t${i}`, {})));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(max, 4);
  open();
  await all;
  assert.equal(f.calls().length, 10);
  assert.equal(max, 4);
});

test('a call that hangs times out', async () => {
  const f = fake({ onCall: (msg, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason))) });
  const { c } = await client(f, {}, { callTimeoutMs: 30 });
  const t0 = Date.now();
  await rejects(c.callTool('x', {}));
  assert.ok(Date.now() - t0 < 200);
});

test('loadAuth / saveAuth round trip; a missing or broken file loads as null', async () => {
  const file = await authFile();
  const a = await loadAuth(file);
  await saveAuth({ ...a, access_token: 'tok-C' }, file);
  assert.equal((await loadAuth(file)).access_token, 'tok-C');
  await writeFile(file, '{not json');
  assert.equal(await loadAuth(file), null);
  assert.equal(await loadAuth(path.join(os.tmpdir(), 'nope-esthmr.json')), null);
});

// ── final-review fixes ────────────────────────────────────────────────────────────────────────────────────────
test('kill switch: deleting the auth file turns ESTHMR off on the next call', async () => {
  const f = fake();
  const file = await authFile();
  const c = createClient({ authFile: file, fetchImpl: f.fetchImpl, now: () => NOW, log: () => {} });
  await c.callTool('x', {});
  const before = f.reqs.length;
  await unlink(file);
  await rejects(c.callTool('y', {}), EsthmrOff);
  assert.equal(f.reqs.length, before);
});

test('a refresh never writes back an auth file that was deleted meanwhile', async () => {
  let file;
  const f = fake({ onToken: async () => { await unlink(file); return json({ access_token: 'tok-B', refresh_token: 'ref-B', expires_in: 3600 }); } });
  file = await authFile({ expires_at: NOW - 1000 });
  const c = createClient({ authFile: file, fetchImpl: f.fetchImpl, now: () => NOW, log: () => {} });
  await rejects(c.callTool('x', {}), EsthmrOff);
  assert.equal(await loadAuth(file), null);
  assert.equal(f.calls().length, 0);
});

const rewrite = async (file, tok) => {
  await writeFile(file, JSON.stringify({ client_id: 'cid2', access_token: tok, refresh_token: 'ref-N', expires_at: NOW + 3600_000 }));
  const later = new Date(Date.now() + 60_000);
  await utimes(file, later, later); // a new sign-in always looks newer, even on a coarse clock
};

test('a new sign-in while the server runs is picked up on the next call', async () => {
  const f = fake();
  const file = await authFile();
  const c = createClient({ authFile: file, fetchImpl: f.fetchImpl, now: () => NOW, log: () => {} });
  await c.callTool('x', {});
  await rewrite(file, 'tok-N');
  await c.callTool('y', {});
  assert.equal(f.calls().at(-1).headers.Authorization, 'Bearer tok-N');
});

test('a refresh does not overwrite a new sign-in made meanwhile', async () => {
  let file;
  const f = fake({ onToken: async () => { await rewrite(file, 'tok-N'); return json({ access_token: 'tok-B', refresh_token: 'ref-B', expires_in: 3600 }); } });
  file = await authFile({ expires_at: NOW - 1000 });
  const c = createClient({ authFile: file, fetchImpl: f.fetchImpl, now: () => NOW, log: () => {} });
  await c.callTool('x', {});
  assert.equal(f.calls()[0].headers.Authorization, 'Bearer tok-N');
  assert.equal((await loadAuth(file)).access_token, 'tok-N');
});

test('a call whose signal is already aborted is skipped without a request', async () => {
  const f = fake();
  const { c } = await client(f);
  const ctl = new AbortController();
  ctl.abort();
  await rejects(c.callTool('x', {}, { signal: ctl.signal }));
  assert.equal(f.reqs.length, 0);
});

test('aborting the signal stops queued and in-flight calls', async () => {
  let open;
  const gate = new Promise((r) => { open = r; });
  const f = fake({
    onCall: (msg, init) => new Promise((res, rej) => {
      init.signal.addEventListener('abort', () => rej(init.signal.reason));
      gate.then(() => res(ok(msg.id, {})));
    }),
  });
  const { c } = await client(f);
  const ctl = new AbortController();
  const all = Array.from({ length: 6 }, (_, i) => c.callTool(`t${i}`, {}, { signal: ctl.signal }).then(() => 'ok', () => 'stopped'));
  await new Promise((r) => setTimeout(r, 30));
  ctl.abort();
  open();
  assert.deepEqual(await Promise.all(all), Array(6).fill('stopped'));
  assert.equal(f.calls().length, 4); // the 2 queued calls never reached ESTHMR
});

test('no token ever appears in a log line or error message', () => {
  assert.ok(leaks.length > 5);
  for (const m of leaks) assert.ok(!/tok-|ref-/.test(String(m)), m);
});
