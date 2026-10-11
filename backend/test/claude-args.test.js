import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeArgs, claudeFailureMessage } from '../services/analystService.js';

test('claudeArgs: existing analyses keep their flags', () => {
  assert.deepEqual(claudeArgs('m'), ['-p', '--output-format', 'json', '--model', 'm', '--permission-mode', 'bypassPermissions']);
});

test('claudeArgs isolated: tools off, no MCP, no settings, no session, no bypassPermissions', () => {
  const a = claudeArgs('m', { isolated: true, systemPrompt: 'SYS' });
  assert.ok(!a.includes('bypassPermissions'));
  assert.ok(!a.includes('--permission-mode'));
  assert.equal(a[a.indexOf('--tools') + 1], '');
  assert.ok(a.includes('--strict-mcp-config'));
  assert.equal(a[a.indexOf('--setting-sources') + 1], '');
  assert.ok(a.includes('--no-session-persistence'));
  assert.equal(a[a.indexOf('--system-prompt') + 1], 'SYS');
  assert.equal(a[a.indexOf('--model') + 1], 'm');
});

test('claudeArgs isolated without a system prompt omits the flag', () => {
  assert.ok(!claudeArgs('m', { isolated: true }).includes('--system-prompt'));
});

test('claudeFailureMessage: the reason from the JSON reply, not its first 300 characters', () => {
  const env = JSON.stringify({ duration_api_ms: 0, usage: { input_tokens: 0 }, total_cost_usd: 0, is_error: true, subtype: 'error_during_execution', result: 'Claude AI usage limit reached|1760000000' });
  assert.equal(claudeFailureMessage(1, env, ''), 'claude exit 1: Claude AI usage limit reached|1760000000');
  const noResult = JSON.stringify({ is_error: true, subtype: 'error_max_turns', errors: ['first', 'second'] });
  assert.equal(claudeFailureMessage(1, noResult, ''), 'claude exit 1: first; second');
  assert.equal(claudeFailureMessage(1, JSON.stringify({ is_error: true, subtype: 'error_during_execution' }), ''), 'claude exit 1: error_during_execution');
  assert.equal(claudeFailureMessage(2, 'not json', 'boom on stderr'), 'claude exit 2: boom on stderr');
  assert.equal(claudeFailureMessage(2, 'plain stdout', ''), 'claude exit 2: plain stdout');
});
