import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Local review only: fixed Testnet origin, public reads, no signing or submission.
const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const upstream = 'https://rpc.xerisweb.com';
const port = Number(process.env.PORT || 8771);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(body);
};

export function createPreviewHandler({ fetchImpl = fetch, rootDirectory = root, timeoutMs = 10000 } = {}) {
  const serveRoot = path.resolve(rootDirectory);
  let active = 0;
  return async (req, res) => {
  try {
    if (typeof req.url !== 'string' || !req.url.startsWith('/') || req.url.startsWith('//') || req.url.length > 4096) return send(res, 400, 'Invalid preview request.');
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.search.length > 2048) return send(res, 400, 'Invalid preview request.');
    if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, 'Local preview supports public reads only.');
    const match = url.pathname.match(/^\/testnet\/(?:rpc|jsonrpc)(\/.*)?$/);
    if (match) {
      const route = match[1] || '/';
      if (!/^\/(?:launchpads|contract\/[A-Za-z0-9_-]{1,128}|launchpad\/[A-Za-z0-9_-]{1,128}\/quote|token\/balance\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}|blocks|block\/[0-9]{1,20}|balance\/[A-Za-z0-9_-]{1,128})\/?$/.test(route)) return send(res, 403, 'This RPC route is unavailable in the local read-only preview.');
      if (active >= 8) return send(res, 429, 'Preview request limit reached.');
      active++;
      let reader, response, timer;
      const controller = new AbortController();
      const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error('Preview read timeout'));
      }, timeoutMs); });
      try {
        response = await Promise.race([fetchImpl(upstream + route + url.search, { method: 'GET', signal: controller.signal, redirect: 'error', cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' } }), deadline]);
        if (!response.ok) return send(res, response.status, 'Testnet RPC temporarily unavailable.');
        const declared = response.headers.get('content-length'), maximum = 2 * 1024 * 1024;
        if (declared !== null && (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(maximum))) return send(res, 502, 'Testnet response exceeds the preview limit.');
        const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (!['application/json', 'text/plain'].includes(contentType)) return send(res, 502, 'Testnet response format is unavailable.');
        reader = response.body.getReader();
        const chunks = []; let size = 0;
        while (true) {
          const { done, value } = await Promise.race([reader.read(), deadline]);
          if (done) break;
          size += value.byteLength;
          if (size > maximum) return send(res, 502, 'Testnet response exceeds the preview limit.');
          chunks.push(Buffer.from(value));
        }
        const body = Buffer.concat(chunks);
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
        return send(res, 200, req.method === 'HEAD' ? '' : body, 'application/json');
      } catch { return send(res, 502, 'Testnet RPC unavailable. Please retry.'); }
      finally {
        clearTimeout(timer); active--;
        try { void Promise.resolve(reader ? reader.cancel() : response?.body?.cancel()).catch(() => {}); } catch {}
      }
    }
    if (/^\/(create|features|ecosystem|docs|dashboard|token\/[^/]+)\/?$/.test(url.pathname)) {
      res.writeHead(302, { Location: `/testnet${url.pathname}?network=testnet`, 'Cache-Control': 'no-store' }); return res.end();
    }
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.includes('\0') || decoded.includes('\\')) return send(res, 400, 'Invalid path.');
    let target = path.resolve(serveRoot, '.' + decoded);
    if (target !== serveRoot && !target.startsWith(serveRoot + path.sep)) return send(res, 403, 'Invalid path.');
    try { if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html'); }
    catch {
      if (decoded.startsWith('/testnet/') && !path.extname(decoded)) target = path.join(serveRoot, 'testnet/index.html');
      else return send(res, 404, 'Not found.');
    }
    // A lexical prefix is insufficient if a build accidentally contains a symlink.
    const [canonicalRoot, canonicalTarget] = await Promise.all([realpath(serveRoot), realpath(target)]);
    if (canonicalTarget !== canonicalRoot && !canonicalTarget.startsWith(canonicalRoot + path.sep)) return send(res, 403, 'Invalid path.');
    const body = await readFile(canonicalTarget);
    return send(res, 200, req.method === 'HEAD' ? '' : body, types[path.extname(target)] || 'application/octet-stream');
  } catch { if (!res.headersSent) send(res, 400, 'Invalid preview request.'); else res.end(); }
  };
}
// Importing the handler for offline review never opens a socket.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = http.createServer(createPreviewHandler());
  server.headersTimeout = 10000; server.requestTimeout = 15000;
  server.listen(port, '127.0.0.1', () => console.log(`Launchpad preview: http://127.0.0.1:${port} (public Testnet reads only)`));
}
