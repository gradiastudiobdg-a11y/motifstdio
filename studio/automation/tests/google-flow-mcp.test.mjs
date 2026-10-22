import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleFlowMcp } from '../google-flow-mcp.mjs';

function fixture(accounts = []) {
  const calls = [];
  const client = {
    async listTools() { return { tools: ['flow_help', 'flow_list_accounts', 'flow_begin_account_connection', 'flow_complete_account_connection'].map(name => ({ name })) }; },
    async callTool({ name, arguments: args }) {
      calls.push({ name, args });
      const result = name === 'flow_list_accounts' ? { accounts, readyForGeneration: accounts.length > 0 }
        : name === 'flow_begin_account_connection' ? { status: 'USER_ACTION_REQUIRED', connectionId: 'test-memory-only' } : {};
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
    async close() {},
  };
  return { client, calls, mcp: new GoogleFlowMcp({ studioDir: process.cwd(), dataDir: process.cwd(), clientFactory: async () => client }) };
}

test('MCP account handoff requires explicit confirmation and retains the same in-memory token', async () => {
  const { mcp, calls } = fixture();
  await assert.rejects(mcp.complete({ userConfirmedSessionSent: true }), /kedaluwarsa/);
  const begin = await mcp.begin();
  assert.equal(begin.connectionPending, true);
  assert.equal(JSON.stringify(begin).includes('test-memory-only'), false);
  await assert.rejects(mcp.complete({}), /Konfirmasi/);
  assert.equal(calls.filter(call => call.name === 'flow_complete_account_connection').length, 0);
  await mcp.complete({ userConfirmedSessionSent: true });
  assert.equal(calls.find(call => call.name === 'flow_complete_account_connection').args.connectionId, 'test-memory-only');
  assert.equal(calls.some(call => /generate/.test(call.name)), false);
});

test('MCP status hides account identity and refuses another connection when accounts exist', async () => {
  const { mcp, calls } = fixture([{ id: 'private-id', label: 'private@example.test', connectionStatus: 'connected' }]);
  assert.equal((await mcp.status()).connected, true);
  const result = await mcp.begin();
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(calls.some(call => call.name === 'flow_begin_account_connection'), false);
});

test('MCP upstream errors do not disclose session identity or URLs', async () => {
  const { mcp, client } = fixture();
  client.callTool = async () => ({ isError: true, content: [{ type: 'text', text: 'login_required private@example.test https://secret.test/token' }] });
  await assert.rejects(mcp.call('flow_list_accounts'), error => error.code === 'LOGIN_REQUIRED' && !/private|secret/.test(error.message));
});
