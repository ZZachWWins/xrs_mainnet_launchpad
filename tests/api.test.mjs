import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaunchpadAPI } from '../src/api.mjs';
import { CONFIG } from '../src/model.mjs';
const NOW = 1795496738705;
function feed() {
  return { schema_version: '2', chain_id: CONFIG.chainId, status: 'ready', observed_at_ms: String(NOW), expires_at_ms: String(NOW + 20000),
    as_of: { slot: '31613', block_hash: 'a'.repeat(64) }, coverage: { complete: true }, blocks: [{ slot: '31613', hash: 'a'.repeat(64), timestamp_ms: String(NOW - 1000) }],
    policy: { id: 'xeris-mainnet-circulation-v2', sha256: 'b'.repeat(64) }, market: { price_pool_id: CONFIG.poolId, quote_token_id: CONFIG.quoteToken,
      quote_decimals: '6', valuation_basis: 'circulating_supply', price_basis: 'pool_spot', price_quote_raw_numerator: '1000000', price_xrs_raw_denominator: '1000000000' }, launchpad_tokens: [] };
}
function setup(handler) {
  const calls = [];
  const api = createLaunchpadAPI({ now: () => NOW, fetcher: async (url, options) => {
    calls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store'); assert.ok(url.startsWith(CONFIG.rpc + '/'));
    if (handler) { const result = handler(url); if (result) return result; }
    return new Response(JSON.stringify(url.endsWith(CONFIG.checkpointSlot) ? { success: true, data: { slot: 27201, hash: CONFIG.checkpointHash } } : feed()));
  } });
  return { api, calls };
}
test('checkpoint identity must pass before any feed display and requests stay fixed-origin GET only', async () => {
  const { api, calls } = setup();
  await assert.rejects(api.getFeed(), error => error.code === 'NETWORK_UNVERIFIED'); assert.equal(calls.length, 0);
  await api.verifyNetwork(); assert.equal((await api.getFeed()).tokens.length, 0);
  assert.deepEqual(calls, [CONFIG.rpc + '/v2/block/slot/27201', CONFIG.rpc + '/market/supply']);
});
test('wrong checkpoint stops feed reads', async () => {
  const { api, calls } = setup(() => new Response(JSON.stringify({ success: true, data: { slot: 27201, hash: 'wrong' } })));
  await assert.rejects(api.verifyNetwork(), error => error.code === 'NETWORK_MISMATCH');
  await assert.rejects(api.getFeed(), error => error.code === 'NETWORK_UNVERIFIED'); assert.equal(calls.length, 1);
});
test('blocked routes, rate limits, network failures and malformed feeds never become an empty launch list', async () => {
  for (const code of [403, 404, 405, 429, 500]) {
    const { api } = setup(url => url.endsWith('/market/supply') ? new Response('{}', { status: code }) : null);
    await api.verifyNetwork(); await assert.rejects(api.getFeed());
  }
  const invalid = setup(url => url.endsWith('/market/supply') ? new Response('{}') : null);
  await invalid.api.verifyNetwork(); await assert.rejects(invalid.api.getFeed(), error => error.code === 'INVALID_DATA');
  const failed = setup(() => { throw new Error('untrusted transport details'); });
  await assert.rejects(failed.api.verifyNetwork(), error => error.code === 'NETWORK');
});
test('oversized response headers and streamed bodies are bounded', async () => {
  const largeHeader = setup(() => new Response('{}', { headers: { 'Content-Length': '65537' } }));
  await assert.rejects(largeHeader.api.verifyNetwork(), error => error.code === 'INVALID_DATA');
  const largeBody = setup(() => new Response('x'.repeat(65537)));
  await assert.rejects(largeBody.api.verifyNetwork(), error => error.code === 'INVALID_DATA');
});
