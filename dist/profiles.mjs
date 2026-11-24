import { integer } from './model.mjs';
import { safeImageURL } from './images.mjs';
const TOKEN = /^lp_[A-Za-z0-9_-]{1,116}$/;
const forbidden = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
function text(value, max, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || new TextEncoder().encode(value).length > max || forbidden.test(value)) throw new Error('Coin metadata is unavailable.');
  return value;
}
function address(value) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  if (typeof value !== 'string' || value.length > 44 || value.length < 32) throw new Error('Creator identity is unavailable.');
  let number = 0n;
  for (const character of value) { const digit = alphabet.indexOf(character); if (digit < 0) throw new Error('Creator identity is unavailable.'); number = number * 58n + BigInt(digit); }
  let count = 0, rest = number; while (rest) { count++; rest >>= 8n; }
  for (const character of value) { if (character !== '1') break; count++; }
  if (count !== 32 || number === 0n) throw new Error('Creator identity is unavailable.');
  return value;
}
export function coinRoute(tokenId) {
  if (!TOKEN.test(tokenId)) throw new Error('Invalid coin identifier.');
  return '#coin/' + tokenId;
}
export function parseProfileRoute(hash) {
  if (hash === '#preview/local') return Object.freeze({ kind: 'draft' });
  if (hash.startsWith('#coin/')) return TOKEN.test(hash.slice(6)) ? Object.freeze({ kind: 'coin', tokenId: hash.slice(6) }) : Object.freeze({ kind: 'invalid' });
  if (hash.startsWith('#preview/')) return Object.freeze({ kind: 'invalid' });
  return null;
}
export function createDraftStore() {
  let current = null;
  return Object.freeze({
    set(preview, photo = null) {
      current?.photo?.release();
      current = Object.freeze({ kind: 'draft', preview, photo: photo?.fork() ?? null, href: '#preview/local' }); return current;
    },
    get() { return current; },
    clear() { current?.photo?.release(); current = null; },
  });
}
export function parseCoinProfile(data, token) {
  if (!TOKEN.test(token?.id)) throw new Error('Coin is not in the verified feed.');
  const contractId = token.id.slice(3), contract = data?.contract, state = contract?.state?.Launchpad;
  if (data?.success !== true || contract?.contract_id !== contractId || contract.contract_type !== 'Launchpad' || !state
    || state.token_id !== token.id || state.name !== token.name || state.symbol !== token.symbol) throw new Error('Coin metadata does not match the verified listing.');
  const description = typeof state.description === 'string' ? text(state.description, 1024, true) : null;
  let creator = null;
  try { if (address(state.creator) === address(contract.owner)) creator = state.creator; } catch { /* Missing/invalid creator remains unavailable. */ }
  let imageURL = null;
  try { if (state.image_url) imageURL = safeImageURL(state.image_url); } catch { /* Unsafe image does not invalidate the token's text identity. */ }
  let economics = null;
  try {
    const totalRaw = integer(state.total_supply, true), saleRaw = integer(state.sale_supply), liquidityRaw = integer(state.dex_liquidity_supply), remainingRaw = integer(state.tokens_remaining);
    const targetRaw = integer(state.target_liquidity_xrs, true), collectedRaw = integer(state.xrs_collected);
    if (saleRaw + liquidityRaw !== totalRaw || remainingRaw > saleRaw || String(state.creator_reward_bps) !== '100'
      || typeof state.finalized !== 'boolean') throw new Error();
    economics = Object.freeze({ totalRaw, saleRaw, liquidityRaw, targetRaw, collectedRaw, finalized: state.finalized });
  } catch { /* Do not substitute rounded summary counters or invented economics. */ }
  return Object.freeze({ kind: 'coin', tokenId: token.id, contractId, name: text(token.name, 256), symbol: text(token.symbol, 32),
    description, creator, imageURL, economics, valuation: token, metadataAvailable: true });
}
