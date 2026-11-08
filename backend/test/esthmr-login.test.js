import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pkcePair, authorizeUrl, tokensToAuth } from '../scripts/esthmr-login.js';

test('pkcePair: a base64url verifier and its S256 challenge', () => {
  const { verifier, challenge } = pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(challenge, createHash('sha256').update(verifier).digest('base64url'));
  assert.notEqual(pkcePair().verifier, verifier);
});

test('authorizeUrl carries every OAuth parameter', () => {
  const u = new URL(authorizeUrl({ authorization_endpoint: 'https://esthmr.com/oauth/authorize' },
    { clientId: 'c id', redirectUri: 'http://127.0.0.1:5555/callback', challenge: 'ch', state: 's&t' }));
  assert.equal(u.origin + u.pathname, 'https://esthmr.com/oauth/authorize');
  assert.deepEqual(Object.fromEntries(u.searchParams), {
    response_type: 'code', client_id: 'c id', redirect_uri: 'http://127.0.0.1:5555/callback',
    code_challenge: 'ch', code_challenge_method: 'S256', state: 's&t', scope: 'esthmr', resource: 'https://esthmr.com/mcp',
  });
});

test('tokensToAuth builds the auth file; both tokens are required', () => {
  assert.deepEqual(tokensToAuth({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, { clientId: 'c', tokenEndpoint: 't', now: 1000 }),
    { client_id: 'c', access_token: 'a', refresh_token: 'r', expires_at: 3601000, token_endpoint: 't' });
  assert.throws(() => tokensToAuth({ access_token: 'a', expires_in: 3600 }, { clientId: 'c', tokenEndpoint: 't', now: 0 }));
  assert.throws(() => tokensToAuth({ refresh_token: 'r' }, { clientId: 'c', tokenEndpoint: 't', now: 0 }));
});
