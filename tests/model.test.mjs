import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, parseFeed, parseExactJSON, integer, formatRaw, parseDecimal, previewToken, selectTokens } from '../src/model.mjs';
const NOW = 1795496738705, HASH = 'a'.repeat(64);
export function snapshot(tokens = []) {
  return { schema_version: '2', chain_id: CONFIG.chainId, status: 'ready', observed_at_ms: String(NOW), expires_at_ms: String(NOW + 20000),
    as_of: { slot: '31613', block_hash: HASH }, coverage: { complete: true }, blocks: [{ slot: '31613', hash: HASH, timestamp_ms: String(NOW - 1000) }],
    policy: { id: 'xeris-mainnet-circulation-v2', sha256: 'b'.repeat(64) }, market: { price_pool_id: CONFIG.poolId, quote_token_id: CONFIG.quoteToken,
      quote_decimals: '6', valuation_basis: 'circulating_supply', price_basis: 'pool_spot', price_quote_raw_numerator: '1000000', price_xrs_raw_denominator: '1000000000' }, launchpad_tokens: tokens };
}
function token() {
  return { token_id: 'lp_test', name: 'Synthetic fixture', symbol: 'TEST', status: 'ready', decimals: '9', quote_decimals: '6', quote_token_id: CONFIG.quoteToken,
    quote_symbol: 'xUSDC', valuation_basis: 'circulating_supply', circulating_raw: '1000000000', market_cap_quote_raw: '1000000',
    price_xrs_raw_numerator: '1000000000', price_token_raw_denominator: '1000000000', supply: { status: 'available', basis: 'unlocked_on_chain_v2',
      token_id: 'lp_test', decimals: '9', circulating_raw: '1000000000', issued_supply_raw: '10000000000', components_raw: { wallets: '1000000000', company_wallets: '0', amm_inventory: '0' } } };
}
const clone = object => JSON.parse(JSON.stringify(object));

test('fresh complete verified feed can truthfully be empty; missing or unavailable data cannot', () => {
  assert.deepEqual(parseFeed(snapshot(), NOW).tokens, []);
  for (const mutate of [data => delete data.launchpad_tokens, data => data.status = 'unavailable', data => data.coverage.complete = false,
    data => data.chain_id = 'xeris-testnet-v2', data => data.expires_at_ms = String(NOW), data => data.observed_at_ms = String(NOW + 6000),
    data => data.as_of.block_hash = 'wrong', data => data.blocks[0].slot = '1', data => data.policy.id = 'unknown']) {
    const data = snapshot(); mutate(data); assert.throws(() => parseFeed(data, NOW));
  }
  assert.equal(CONFIG.dexUrl, null);
});

test('circulating valuation uses exact integer components and pool ratios, never old summary fields', () => {
  const row = token(); row.current_price_lamports = 900000000; row.tokens_sold = '999999999999999999';
  const data = parseFeed(snapshot([row]), NOW);
  assert.equal(data.tokens[0].circulatingRaw, 1000000000n); assert.equal(data.tokens[0].marketCapRaw, 1000000n);
  for (const mutate of [row => row.market_cap_quote_raw = '1000001', row => row.supply.components_raw.wallets = '999999999',
    row => row.supply.issued_supply_raw = '1', row => row.quote_token_id = 'wrong', row => row.supply.basis = 'estimated']) {
    const changed = token(); mutate(changed); assert.throws(() => parseFeed(snapshot([changed]), NOW));
  }
  assert.throws(() => parseFeed(snapshot([token(), token()]), NOW));
});

test('unavailable token valuations stay unavailable instead of becoming zero or invented prices', () => {
  const row = { token_id: 'lp_missing', name: 'Synthetic unavailable fixture', symbol: 'NONE', status: 'unavailable', market_cap_quote_raw: null };
  const parsed = parseFeed(snapshot([row]), NOW).tokens;
  assert.equal(parsed[0].marketCapRaw, null); assert.equal(parsed[0].circulatingRaw, null);
  assert.equal(selectTokens(parsed, '', 'valued').length, 0); assert.equal(selectTokens(parsed, 'NONE').length, 1);
  assert.throws(() => parseFeed(snapshot([{ ...row, market_cap_quote_raw: '0' }]), NOW));
});

test('JSON integer lexemes, u64 boundaries, decimals and displayed tiny values remain exact', () => {
  assert.equal(parseExactJSON('{"raw":9007199254740993,"complete":true}').raw, '9007199254740993');
  assert.equal(integer('18446744073709551615'), (1n << 64n) - 1n);
  for (const value of [9007199254740993, '01', '1e9', '18446744073709551616', '-1']) assert.throws(() => integer(value));
  assert.equal(parseDecimal('9007199254.740993', 6), 9007199254740993n);
  assert.equal(formatRaw(1n, 6, 2), '<0.01'); assert.equal(formatRaw(1000000000000000000n, 9), '1,000,000,000');
  assert.throws(() => parseDecimal('0.0000000001', 9)); assert.throws(() => parseDecimal('1e9', 9));
});

test('local token preview follows supply reservations and exact retained-metadata fee; vesting stays disabled', () => {
  const input = { name: 'Local idea', ticker: 'IDEA', contractId: 'local-idea', description: '', imageUrl: '', totalSupply: '1000000000', targetXrs: '10000', liquidityPercent: '20' };
  const result = previewToken(input);
  assert.equal(result.supplyRaw, 1000000000000000000n); assert.equal(result.reservedRaw, 200000000000000000n);
  assert.equal(result.saleRaw, 800000000000000000n); assert.equal(result.targetRaw, 10000000000000n); assert.equal(result.vestingEnabled, false);
  const bytes = 64 + 3 + 'local-idea'.length + 'Local idea'.length + 'IDEA'.length + '__launchpad_managed__'.length;
  assert.equal(result.metadataBytes, bytes); assert.equal(result.creationFeeRaw, BigInt(bytes + 1) * 1000000n);
  assert.equal(previewToken({ ...input, description: '星' }).creationFeeRaw - result.creationFeeRaw, 3000000n);
  for (const change of [{ name: '🌟'.repeat(9) }, { ticker: 'BAD SYMBOL' }, { contractId: 'xeris_usdc' }, { contractId: '../bad' },
    { liquidityPercent: '4.99' }, { liquidityPercent: '40.01' }, { imageUrl: 'javascript:alert(1)' }, { imageUrl: 'https://user:pass@example.com/a.png' }, { totalSupply: '0' }]) {
    assert.throws(() => previewToken({ ...input, ...change }));
  }
  assert.equal('transaction' in result, false); assert.equal('signature' in result, false);
});
