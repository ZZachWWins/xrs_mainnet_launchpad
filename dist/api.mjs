import { CONFIG, parseExactJSON, parseFeed } from './model.mjs';
export class ReadError extends Error { constructor(code) { super('Mainnet data is unavailable.'); this.code = code; } }
export function createLaunchpadAPI({ fetcher = globalThis.fetch, now = Date.now, timeout = 8000 } = {}) {
  async function read(path) {
    if (!['/market/supply', '/v2/block/slot/' + CONFIG.checkpointSlot].includes(path)) throw new ReadError('BLOCKED_ROUTE');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetcher(CONFIG.rpc + path, { method: 'GET', signal: controller.signal, credentials: 'omit',
        redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new ReadError([403, 404, 405].includes(response.status) ? 'UNAVAILABLE_ROUTE' : response.status === 429 ? 'RATE_LIMITED' : 'NETWORK');
      const length = response.headers.get('content-length');
      const max = path === '/market/supply' ? 2 * 1024 * 1024 : 64 * 1024;
      if (length !== null && (!/^[0-9]+$/.test(length) || BigInt(length) > BigInt(max))) throw new ReadError('INVALID_DATA');
      const reader = response.body?.getReader();
      if (!reader) throw new ReadError('INVALID_DATA');
      const decoder = new TextDecoder('utf-8', { fatal: true }); let text = '', size = 0;
      try {
        while (true) { const chunk = await reader.read(); if (chunk.done) break;
          if (chunk.value.byteLength > max - size) throw new ReadError('INVALID_DATA');
          size += chunk.value.byteLength; text += decoder.decode(chunk.value, { stream: true }); }
        text += decoder.decode();
      } finally { try { await reader.cancel(); } catch {} }
      return parseExactJSON(text);
    } catch (error) { if (error instanceof ReadError) throw error; throw new ReadError('NETWORK'); }
    finally { clearTimeout(timer); }
  }
  let verified = false;
  return Object.freeze({
    async verifyNetwork() {
      verified = false;
      const result = await read('/v2/block/slot/' + CONFIG.checkpointSlot);
      if (result.success !== true || result.data?.slot !== CONFIG.checkpointSlot || result.data.hash !== CONFIG.checkpointHash) throw new ReadError('NETWORK_MISMATCH');
      verified = true; return true;
    },
    async getFeed() {
      if (!verified) throw new ReadError('NETWORK_UNVERIFIED');
      try { return parseFeed(await read('/market/supply'), now()); }
      catch (error) { if (error instanceof ReadError) throw error; throw new ReadError('INVALID_DATA'); }
    },
  });
}
