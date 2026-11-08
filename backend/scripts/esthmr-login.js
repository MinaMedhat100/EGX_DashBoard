// esthmr-login.js — the dashboard's own one-time ESTHMR sign-in (v2.11.0): `npm run esthmr:login` in backend/.
// OAuth 2.1 with PKCE (S256) and dynamic client registration; the code comes back to a local loopback server.
// Writes backend/data/esthmr_auth.json (gitignored), or the path after --auth-file. Delete that file to turn ESTHMR off.
// Never prints a token.
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { saveAuth, AUTH_FILE, USER_AGENT, ESTHMR_URL } from '../services/esthmrClient.js';

const METADATA_URL = 'https://esthmr.com/.well-known/oauth-authorization-server';
const SCOPE = 'esthmr';
const WAIT_MS = 5 * 60 * 1000;

export function pkcePair() {
  const verifier = randomBytes(48).toString('base64url'); // 64 characters
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export function authorizeUrl(meta, { clientId, redirectUri, challenge, state }) {
  const u = new URL(meta.authorization_endpoint);
  const params = {
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
    code_challenge: challenge, code_challenge_method: 'S256', state, scope: SCOPE, resource: ESTHMR_URL,
  };
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export function tokensToAuth(tok, { clientId, tokenEndpoint, now }) {
  if (typeof tok?.access_token !== 'string' || typeof tok?.refresh_token !== 'string') {
    throw new Error('the token answer has no access or refresh token');
  }
  return {
    client_id: clientId,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: now + (Number(tok.expires_in) || 3600) * 1000,
    token_endpoint: tokenEndpoint,
  };
}

async function request(url, { form, json } = {}) {
  const res = await fetch(url, {
    method: form || json ? 'POST' : 'GET',
    headers: {
      Accept: 'application/json', 'User-Agent': USER_AGENT,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : json ? { 'Content-Type': 'application/json' } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : json ? JSON.stringify(json) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${new URL(url).pathname} answered ${res.status}${body.error ? ` (${body.error})` : ''}`);
  return body;
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* the URL is printed too */ }
}

function waitForCode(server, state) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no sign-in within 5 minutes')), WAIT_MS);
    server.on('request', (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const fail = u.searchParams.get('error') || (u.searchParams.get('state') !== state ? 'state mismatch' : null);
      const code = u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fail || !code ? '<p>ESTHMR sign-in failed. You can close this tab.</p>' : '<p>Signed in to ESTHMR. You can close this tab.</p>');
      clearTimeout(timer);
      if (fail || !code) reject(new Error(`sign-in refused: ${fail || 'no code'}`));
      else resolve(code);
    });
  });
}

async function main() {
  const i = process.argv.indexOf('--auth-file');
  const authFile = i > 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : AUTH_FILE;

  const meta = await request(METADATA_URL);
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
    const reg = await request(meta.registration_endpoint, {
      json: {
        client_name: 'egx-dashboard', redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        token_endpoint_auth_method: 'none', scope: SCOPE,
      },
    });
    const { verifier, challenge } = pkcePair();
    const state = randomBytes(16).toString('base64url');
    const url = authorizeUrl(meta, { clientId: reg.client_id, redirectUri, challenge, state });
    console.log(`Opening the ESTHMR sign-in page. If it doesn't open, paste this into your browser:\n${url}\n`);
    openBrowser(url);

    const code = await waitForCode(server, state);
    const tok = await request(meta.token_endpoint, {
      form: { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: reg.client_id, code_verifier: verifier, resource: ESTHMR_URL },
    });
    const auth = tokensToAuth(tok, { clientId: reg.client_id, tokenEndpoint: meta.token_endpoint, now: Date.now() });
    await saveAuth(auth, authFile);
    console.log(`ESTHMR sign-in saved (expires ${new Date(auth.expires_at).toISOString()})`);
  } finally {
    server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`ESTHMR sign-in failed: ${e.message}`); process.exit(1); });
}
