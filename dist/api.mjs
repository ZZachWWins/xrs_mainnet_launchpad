import { CONFIG, parseExactJSON, parseFeed } from './model.mjs';
import { coinRoute, parseCoinProfile } from './profiles.mjs';
export class ReadError extends Error { constructor(code) { super('Mainnet data is unavailable.'); this.code = code; } }
export function createLaunchpadAPI({ fetcher = globalThis.fetch, now = Date.now, timeout = 8000 } = {}) {
  async function read(path) {
    if (!['/market/supply', '/v2/block/slot/' + CONFIG.checkpointSlot].includes(path)
      && !/^\/contract\/[A-Za-z0-9_-]{1,116}$/.test(path)) throw new ReadError('BLOCKED_ROUTE');
    const controller = new AbortController(); let timer, reader, response;
    // An abort signal alone cannot bound a stalled/custom transport or reader.
    // The same deadline covers headers and the complete streamed response body.
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(new ReadError('TIMEOUT'));
    }, timeout); });
    try {
      response = await Promise.race([fetcher(CONFIG.rpc + path, { method: 'GET', signal: controller.signal, credentials: 'omit',
        redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } }), deadline]);
      if (!response.ok) throw new ReadError([403, 404, 405].includes(response.status) ? 'UNAVAILABLE_ROUTE' : response.status === 429 ? 'RATE_LIMITED' : 'NETWORK');
      const length = response.headers.get('content-length');
      const max = path === '/market/supply' ? 2 * 1024 * 1024 : 64 * 1024;
      if (length !== null && (!/^[0-9]+$/.test(length) || BigInt(length) > BigInt(max))) throw new ReadError('INVALID_DATA');
      reader = response.body?.getReader();
      if (!reader) throw new ReadError('INVALID_DATA');
      const decoder = new TextDecoder('utf-8', { fatal: true }); let text = '', size = 0;
      while (true) { const chunk = await Promise.race([reader.read(), deadline]); if (chunk.done) break;
        if (chunk.value.byteLength > max - size) throw new ReadError('INVALID_DATA');
        size += chunk.value.byteLength; text += decoder.decode(chunk.value, { stream: true }); }
      text += decoder.decode();
      return parseExactJSON(text);
    } catch (error) { if (error instanceof ReadError) throw error; throw new ReadError(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK'); }
    finally {
      clearTimeout(timer);
      // Cancellation is best effort: waiting for it could undo the read deadline.
      try { void Promise.resolve(reader ? reader.cancel() : response?.body?.cancel()).catch(() => {}); } catch {}
    }
  }
  let verified = false, listedFeed = null, generation = 0, pendingFeed = null;
  const profileCache = new Map();
  function current(run) {
    if (!verified || run !== generation) throw new ReadError('NETWORK_UNVERIFIED');
  }
  function freshToken(tokenId, run) {
    current(run);
    if (!listedFeed || listedFeed.expiresAt <= now()) throw new ReadError('FEED_EXPIRED');
    const token = listedFeed.tokens.find(row => row.id === tokenId);
    if (!token) throw new ReadError('NOT_LISTED');
    return token;
  }
  function getFeed() {
    if (!verified) return Promise.reject(new ReadError('NETWORK_UNVERIFIED'));
    if (pendingFeed) return pendingFeed;
    const run = generation;
    const task = (async () => {
      try {
        const result = parseFeed(await read('/market/supply'), now()); current(run);
        listedFeed = result; return result;
      } catch (error) {
        if (run === generation) listedFeed = null;
        if (error instanceof ReadError) throw error; throw new ReadError('INVALID_DATA');
      }
    })();
    pendingFeed = task;
    task.then(() => { if (pendingFeed === task) pendingFeed = null; }, () => { if (pendingFeed === task) pendingFeed = null; });
    return task;
  }
  return Object.freeze({
    async verifyNetwork() {
      const run = ++generation;
      verified = false; listedFeed = null; pendingFeed = null; profileCache.clear();
      const result = await read('/v2/block/slot/' + CONFIG.checkpointSlot);
      if (run !== generation) throw new ReadError('NETWORK_UNVERIFIED');
      if (result.success !== true || result.data?.slot !== CONFIG.checkpointSlot || result.data.hash !== CONFIG.checkpointHash) throw new ReadError('NETWORK_MISMATCH');
      verified = true; return true;
    },
    getFeed,
    async getProfile(tokenId, { refresh = false } = {}) {
      if (!verified) throw new ReadError('NETWORK_UNVERIFIED');
      const run = generation;
      try { coinRoute(tokenId); } catch { throw new ReadError('INVALID_TOKEN'); }
      const snapshot = listedFeed && listedFeed.expiresAt > now() ? listedFeed : await getFeed();
      let token = freshToken(tokenId, run);
      const cached = profileCache.get(tokenId);
      if (!refresh && cached && cached.expiresAt > now() && cached.token.name === token.name && cached.token.symbol === token.symbol) {
        // Metadata can be reused; valuation must come from the current feed.
        return Object.freeze({ ...cached, token, metadata: cached.metadata && Object.freeze({ ...cached.metadata, valuation: token }), expiresAt: Math.min(snapshot.expiresAt, cached.expiresAt) });
      }
      let result;
      try {
        const data = await read('/contract/' + tokenId.slice(3));
        token = freshToken(tokenId, run);
        const metadata = parseCoinProfile(data, token);
        result = Object.freeze({ token, metadata, expiresAt: snapshot.expiresAt, metadataError: null });
      } catch (error) {
        result = Object.freeze({ token, metadata: null, expiresAt: snapshot.expiresAt, metadataError: error instanceof ReadError ? error.code : 'INVALID_DATA' });
      }
      // A failed re-verification, expired feed or removed listing must also
      // block an older metadata response instead of returning a stale profile.
      token = freshToken(tokenId, run);
      if (snapshot.expiresAt <= now()) throw new ReadError('FEED_EXPIRED');
      result = Object.freeze({ ...result, token, expiresAt: Math.min(snapshot.expiresAt, listedFeed.expiresAt) });
      if (profileCache.size >= 100) profileCache.delete(profileCache.keys().next().value);
      profileCache.set(tokenId, result); return result;
    },
  });
}
