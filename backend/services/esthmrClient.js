// esthmrClient.js — a small, dependency-free MCP client for ESTHMR (esthmr.com/mcp), v2.11.0.
// ESTHMR is an optional helper run by one person: every failure throws and the caller carries on without it.
// No auth file (backend/data/esthmr_auth.json, written by `npm run esthmr:login`) means ESTHMR is off.
// Tokens never appear in logs or error messages.
import { readFileSync } from 'node:fs';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ESTHMR_URL = 'https://esthmr.com/mcp';
export const TOKEN_URL = 'https://esthmr.com/oauth/token';
export const AUTH_FILE = path.join(__dirname, '..', 'data', 'esthmr_auth.json');
export const CALL_TIMEOUT_MS = 8000;
export const MAX_IN_FLIGHT = 4;
export const REFRESH_EARLY_MS = 60000;
const PROTOCOL = '2025-06-18';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
export const USER_AGENT = `egx-dashboard/${version}`; // honest client name: Cloudflare bans the default one
const EXPIRED = 'ESTHMR sign-in expired: run npm run esthmr:login';

export class EsthmrOff extends Error {
  constructor(message) { super(message); this.name = 'EsthmrOff'; }
}
class HttpError extends Error {
  constructor(status) { super(`ESTHMR HTTP ${status}`); this.status = status; }
}

export async function loadAuth(file = AUTH_FILE) {
  try {
    const a = JSON.parse(await readFile(file, 'utf-8'));
    return a && typeof a.access_token === 'string' && typeof a.refresh_token === 'string' ? a : null;
  } catch {
    return null;
  }
}

export async function saveAuth(auth, file = AUTH_FILE) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(auth, null, 2), 'utf-8');
  await rename(tmp, file);
}

export function parseRpc(text, contentType = '') {
  if (!text || !text.trim()) return null;
  if (contentType.includes('text/event-stream')) {
    const msgs = text.split(/\r?\n/)
      .filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).filter(Boolean)
      .map((s) => JSON.parse(s));
    return msgs.find((m) => m && 'id' in m) ?? msgs[msgs.length - 1] ?? null;
  }
  return JSON.parse(text);
}

function unwrap(name, msg) {
  if (!msg) throw new Error(`ESTHMR ${name}: empty answer`);
  if (msg.error) throw new Error(`ESTHMR ${name}: ${String(msg.error.message ?? 'error').slice(0, 200)}`);
  const r = msg.result;
  if (r?.isError) throw new Error(`ESTHMR ${name}: the tool answered with an error`);
  const sc = r?.structuredContent;
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) throw new Error(`ESTHMR ${name}: no structured answer`);
  return sc;
}

export function createClient({
  authFile = AUTH_FILE, fetchImpl = (u, i) => fetch(u, i), now = Date.now, log = console.warn, callTimeoutMs = CALL_TIMEOUT_MS,
} = {}) {
  let auth = null;
  let loadedMtime = null; // the auth file's mtime when `auth` was read or written
  let refreshing = null;
  let session = null;
  let warned = false;
  let nextId = 1;
  let inFlight = 0;
  const waiting = [];

  const fileMtime = async () => {
    try { return (await stat(authFile)).mtimeMs; } catch { return null; }
  };
  const turnOff = (message) => { auth = null; session = null; return new EsthmrOff(message); };

  const acquire = () => (inFlight < MAX_IN_FLIGHT ? (inFlight++, Promise.resolve()) : new Promise((r) => waiting.push(r)));
  const release = () => { const next = waiting.shift(); if (next) next(); else inFlight--; };

  async function doRefresh() {
    const a = auth;
    let tok = null;
    try {
      const res = await fetchImpl(a.token_endpoint ?? TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': USER_AGENT },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a.refresh_token, client_id: a.client_id }).toString(),
        signal: AbortSignal.timeout(callTimeoutMs),
      });
      if (res.ok) tok = await res.json();
    } catch {
      tok = null;
    }
    if (!tok || typeof tok.access_token !== 'string') {
      auth = null;
      session = null;
      if (!warned) { warned = true; log(EXPIRED); }
      throw new EsthmrOff(EXPIRED);
    }
    warned = false;
    // The file is the user's switch: never write back a deleted file, never overwrite a newer sign-in.
    const m = await fileMtime();
    if (m == null) throw turnOff('ESTHMR was turned off');
    if (m !== loadedMtime) {
      auth = await loadAuth(authFile);
      loadedMtime = m;
      if (!auth) throw turnOff('ESTHMR is not signed in');
      return;
    }
    auth = {
      ...a,
      access_token: tok.access_token,
      refresh_token: typeof tok.refresh_token === 'string' ? tok.refresh_token : a.refresh_token,
      expires_at: now() + (Number(tok.expires_in) || 3600) * 1000,
    };
    await saveAuth(auth, authFile);
    loadedMtime = await fileMtime();
  }

  // One refresh at a time: refresh tokens rotate, so two parallel refreshes would cancel each other.
  function refresh(usedToken) {
    if (!auth) return Promise.reject(new EsthmrOff('ESTHMR is not signed in'));
    if (auth.access_token !== usedToken) return Promise.resolve(); // another call already refreshed
    if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
    return refreshing;
  }

  // Re-checks the auth file on every call: deleting it turns ESTHMR off at once; a new sign-in is picked up.
  async function current() {
    const m = await fileMtime();
    if (m == null) throw turnOff('ESTHMR is not signed in');
    if (!auth || m !== loadedMtime) {
      auth = await loadAuth(authFile);
      loadedMtime = m;
      if (!auth) throw turnOff('ESTHMR is not signed in');
    }
    if (now() > auth.expires_at - REFRESH_EARLY_MS) await refresh(auth.access_token);
    if (!auth) throw new EsthmrOff('ESTHMR is not signed in');
    return auth;
  }

  async function send(msg, sid, signal) {
    for (let attempt = 0; ; attempt++) {
      const a = await current();
      const res = await fetchImpl(ESTHMR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${a.access_token}`,
          'MCP-Protocol-Version': PROTOCOL,
          'User-Agent': USER_AGENT,
          ...(sid ? { 'Mcp-Session-Id': sid } : {}),
        },
        body: JSON.stringify(msg),
        signal: signal ? AbortSignal.any([AbortSignal.timeout(callTimeoutMs), signal]) : AbortSignal.timeout(callTimeoutMs),
      });
      if (res.status === 401 && attempt === 0) { await refresh(a.access_token); continue; }
      if (!res.ok) throw new HttpError(res.status);
      return { res, msg: parseRpc(await res.text(), res.headers.get('content-type') || '') };
    }
  }

  function ensureSession() {
    if (!session) {
      const p = (async () => {
        const { res } = await send({
          jsonrpc: '2.0', id: nextId++, method: 'initialize',
          params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'egx-dashboard', version } },
        }, null);
        const sid = res.headers.get('mcp-session-id');
        await send({ jsonrpc: '2.0', method: 'notifications/initialized' }, sid);
        return sid;
      })();
      p.catch(() => { if (session === p) session = null; });
      session = p;
    }
    return session;
  }

  // `signal` (optional) stops the call: a queued call never starts and an in-flight one is aborted, so a caller
  // past its time budget doesn't spend the shared daily allowance on answers nobody will read.
  async function callTool(name, args = {}, { signal } = {}) {
    const stopped = () => new Error(`ESTHMR ${name}: stopped, past the time budget`);
    if (signal?.aborted) throw stopped();
    await acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        if (signal?.aborted) throw stopped();
        const sid = await ensureSession();
        if (signal?.aborted) throw stopped();
        try {
          const { msg } = await send({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } }, sid, signal);
          return unwrap(name, msg);
        } catch (e) {
          if (e instanceof HttpError && e.status === 404 && sid && attempt === 0) { session = null; continue; } // session expired
          throw e;
        }
      }
    } finally {
      release();
    }
  }

  return { callTool };
}

let defaultClient = null;
export const callTool = (name, args, opts) => (defaultClient ??= createClient()).callTool(name, args, opts);
