import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeArgs } from '../services/analystService.js';

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
