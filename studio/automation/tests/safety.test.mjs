import test from 'node:test';
import assert from 'node:assert/strict';
import { redactDiagnostics } from '../common.mjs';

test('persistable adapter diagnostics remove credentials and account identity', () => {
  const input = 'email=user@example.com Authorization: Bearer secret-token-value access_token=abc123 pairingToken=private-pairing sk-abcdefghijklmnop {"accountIdentity":"Private Person Name","user_id":"account-789"}';
  const cleaned = redactDiagnostics(input);
  for (const secret of ['user@example.com', 'secret-token-value', 'abc123', 'private-pairing', 'sk-abcdefghijklmnop', 'Private Person Name', 'account-789']) assert.ok(!cleaned.includes(secret), secret);
  assert.ok(cleaned.includes('[redacted'));
});
