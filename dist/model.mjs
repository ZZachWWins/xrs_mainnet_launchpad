import { safeImageURL } from './images.mjs';
export const CONFIG = Object.freeze({ rpc: 'https://mainnetrpc.xerisweb.com', chainId: 'xeris-mainnet-v4',
  checkpointSlot: '27201', checkpointHash: '0a401c139eef73f049010450d4aa13ef38636799784d01bbc0ecdb9c71facaf3',
  poolId: 'xrs-xusdc-mainnet-v1', quoteToken: 'xeris_usdc',
  // Enable only after the destination is confirmed to serve the mainnet DEX.
  dexUrl: null });
const U64 = (1n << 64n) - 1n, HASH = /^[0-9a-f]{64}$/;
const fail = () => { throw new Error('The launchpad feed could not be verified.'); };
export function integer(value, positive = false, wide = false) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || value.length > (wide ? 78 : 20)) fail();
  const number = BigInt(value);
  if ((!wide && number > U64) || (positive && number === 0n)) fail();
  return number;
}
export function parseExactJSON(text) {
  JSON.parse(text);
  return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (token, number) => number ? JSON.stringify(number) : token));
}
function label(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)) fail();
  return value;
}
export function parseFeed(data, now = Date.now()) {
  if (data?.schema_version !== '2' || data.chain_id !== CONFIG.chainId || data.status !== 'ready' || data.coverage?.complete !== true) fail();
  const observedAt = integer(data.observed_at_ms, true), expiresAt = integer(data.expires_at_ms, true), clock = BigInt(now);
  if (expiresAt <= clock || observedAt > clock + 5000n || expiresAt <= observedAt || expiresAt - observedAt > 60000n) fail();
  const slot = integer(data.as_of?.slot, true), hash = data.as_of?.block_hash;
  if (slot < BigInt(CONFIG.checkpointSlot) || !HASH.test(hash) || !Array.isArray(data.blocks) || data.blocks.length < 1
    || data.blocks[0]?.slot !== slot.toString() || data.blocks[0]?.hash !== hash) fail();
  const blockTime = integer(data.blocks[0].timestamp_ms, true);
  if (blockTime > observedAt + 30000n || observedAt - blockTime > 120000n) fail();
  const market = data.market;
  if (market?.price_pool_id !== CONFIG.poolId || market.quote_token_id !== CONFIG.quoteToken || market.quote_decimals !== '6'
    || market.valuation_basis !== 'circulating_supply' || market.price_basis !== 'pool_spot'
    || data.policy?.id !== 'xeris-mainnet-circulation-v2' || !HASH.test(data.policy.sha256)) fail();
  const priceNumerator = integer(market.price_quote_raw_numerator, true), priceDenominator = integer(market.price_xrs_raw_denominator, true);
  if (!Array.isArray(data.launchpad_tokens) || data.launchpad_tokens.length > 800) fail();
  const seen = new Set();
  const tokens = data.launchpad_tokens.map(row => {
    const id = label(row?.token_id, 128), name = label(row?.name, 256), symbol = label(row?.symbol, 32);
    if (!/^lp_[A-Za-z0-9_-]{1,116}$/.test(id) || seen.has(id)) fail();
    seen.add(id);
    if (row.status !== 'ready') {
      if (row.market_cap_quote_raw !== null) fail();
      return Object.freeze({ id, name, symbol, status: 'unavailable', circulatingRaw: null, marketCapRaw: null });
    }
    if (row.decimals !== '9' || row.quote_decimals !== '6' || row.quote_token_id !== CONFIG.quoteToken || row.quote_symbol !== 'xUSDC'
      || row.valuation_basis !== 'circulating_supply' || row.supply?.status !== 'available' || row.supply.basis !== 'unlocked_on_chain_v2'
      || row.supply.token_id !== id || String(row.supply.decimals) !== '9') fail();
    const circulatingRaw = integer(row.circulating_raw), marketCapRaw = integer(row.market_cap_quote_raw, false, true);
    const components = row.supply.components_raw;
    if (!components || ['wallets', 'company_wallets', 'amm_inventory'].reduce((sum, field) => sum + integer(components[field]), 0n) !== circulatingRaw
      || integer(row.supply.circulating_raw) !== circulatingRaw || circulatingRaw > integer(row.supply.issued_supply_raw)) fail();
    const tokenNumerator = integer(row.price_xrs_raw_numerator, true), tokenDenominator = integer(row.price_token_raw_denominator, true);
    if (marketCapRaw !== circulatingRaw * tokenNumerator * priceNumerator / (tokenDenominator * priceDenominator)) fail();
    return Object.freeze({ id, name, symbol, status: 'ready', circulatingRaw, marketCapRaw });
  });
  return Object.freeze({ tokens: Object.freeze(tokens), slot: slot.toString(), hash, observedAt: Number(observedAt), expiresAt: Number(expiresAt) });
}
export function formatRaw(raw, decimals, places = decimals) {
  const value = typeof raw === 'bigint' ? raw : integer(raw), base = 10n ** BigInt(decimals);
  const whole = (value / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = (value % base).toString().padStart(decimals, '0').slice(0, places).replace(/0+$/, '');
  if (value > 0n && value < 10n ** BigInt(decimals - places)) return `<0.${'0'.repeat(places - 1)}1`;
  return `${whole}${fraction ? '.' + fraction : ''}`;
}
export function selectTokens(tokens, query = '', filter = 'all') {
  const search = query.trim().toLowerCase();
  return tokens.filter(token => (filter !== 'valued' || token.status === 'ready')
    && [token.name, token.symbol, token.id].some(value => value.toLowerCase().includes(search)));
}
export function parseDecimal(text, decimals) {
  if (typeof text !== 'string' || text.length > 80 || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text.trim())) throw new Error('Use a positive decimal amount with a decimal point.');
  const [whole, fraction = ''] = text.trim().split('.');
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const raw = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (raw < 1n || raw > U64) throw new Error('The amount must fit the protocol’s unsigned 64-bit range.');
  return raw;
}
export function previewToken(input) {
  const byteLength = value => new TextEncoder().encode(value).length;
  const name = input.name.trim(), ticker = input.ticker.trim(), contractId = input.contractId.trim();
  const description = input.description.trim(); let imageUrl = input.imageUrl.trim();
  if (!name || byteLength(name) > 32 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Enter a token name of at most 32 UTF-8 bytes.');
  if (!ticker || byteLength(ticker) > 10 || !/^[A-Za-z0-9]+$/.test(ticker)) throw new Error('Enter a symbol using at most 10 ASCII letters or numbers.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,115}$/.test(contractId) || /^(xeris_|identity_|agent_registry_|system|__)/i.test(contractId) || /_xrs_pool$/i.test(contractId)
    || ['xrs_native', 'xeris_usdc'].includes(contractId)) throw new Error('Enter a portable, nonreserved contract ID of at most 116 characters.');
  if (byteLength(description) > 1024 || byteLength(imageUrl) > 512) throw new Error('Keep the description within 1,024 bytes and image URL within 512 bytes.');
  if (imageUrl) {
    imageUrl = safeImageURL(imageUrl);
  }
  const supplyRaw = parseDecimal(input.totalSupply, 9), targetRaw = parseDecimal(input.targetXrs, 9), liquidityBps = parseDecimal(input.liquidityPercent, 2);
  if (liquidityBps < 500n || liquidityBps > 4000n) throw new Error('Reserve between 5% and 40% for graduated liquidity.');
  const reservedRaw = supplyRaw * liquidityBps / 10000n;
  if (reservedRaw === 0n) throw new Error('The total supply is too small to reserve liquidity.');
  const metadataBytes = 64 + 3 + byteLength(contractId) + byteLength(name) + byteLength(ticker)
    + byteLength('__launchpad_managed__') + byteLength(description) + byteLength(imageUrl);
  return Object.freeze({ name, ticker, contractId, tokenId: 'lp_' + contractId, description, imageUrl, supplyRaw, targetRaw,
    reservedRaw, saleRaw: supplyRaw - reservedRaw, liquidityBps, metadataBytes, creationFeeRaw: 1000000n * BigInt(metadataBytes + 1), vestingEnabled: false });
}
