import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderNetlifyPublishFiles } from '../build.mjs';

const configuration = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const readOutput = name => readFile(new URL('../dist/' + name, import.meta.url), 'utf8');

test('published redirect rules preserve Testnet proxies, deep links and root bookmarks', async () => {
  const artifact = await readOutput('_redirects');
  assert.equal(artifact, renderNetlifyPublishFiles(configuration).redirects);
  const lines = artifact.split('\n').filter(line => line && !line.startsWith('#'));
  const expected = [
    '/testnet/rpc/* https://rpc.xerisweb.com/:splat 200!',
    '/testnet/rpc https://rpc.xerisweb.com/ 200!',
    '/testnet/jsonrpc/* https://rpc.xerisweb.com/:splat 200!',
    '/testnet/jsonrpc https://rpc.xerisweb.com/ 200!',
    '/testnet/* /testnet/index.html 200',
    ...['create', 'features', 'ecosystem', 'docs', 'dashboard'].map(route => `/${route} /testnet/${route}?network=testnet 302`),
    '/token/:id /testnet/token/:id?network=testnet 302',
  ];
  assert.deepEqual(lines, expected, 'forced proxies must precede the Testnet SPA fallback');
});

test('published headers support Testnet and image previews while Mainnet page CSP stays restricted', async () => {
  const artifact = await readOutput('_headers');
  assert.equal(artifact, renderNetlifyPublishFiles(configuration).headers);
  assert.match(artifact, /\n\/\*\n/);
  for (const line of ['X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Cache-Control: no-cache', 'Permissions-Policy: camera=(), microphone=(), geolocation=()']) {
    assert.ok(artifact.includes('  ' + line + '\n'));
  }
  const csp = artifact.match(/^  Content-Security-Policy: (.+)$/m)?.[1];
  assert.ok(csp);
  const directives = policy => Object.fromEntries(policy.split(';').map(part => part.trim().split(/\s+/)).filter(([name]) => name).map(([name, ...values]) => [name, values]));
  const header = directives(csp);
  assert.deepEqual(header['img-src'], ["'self'", 'https:', 'blob:', 'data:']);
  assert.deepEqual(header['connect-src'], ["'self'", 'https://mainnetrpc.xerisweb.com', 'https://rpc.xerisweb.com', 'https://api.binance.com']);
  assert.deepEqual(header['script-src'], ["'self'"]);
  assert.deepEqual(header['style-src'], ["'self'", "'unsafe-inline'"]);
  const source = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
  assert.equal(await readOutput('index.html'), source);
  const page = directives(source.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] || '');
  assert.deepEqual(page['connect-src'], ['https://mainnetrpc.xerisweb.com']);
  assert.deepEqual(page['script-src'], ["'self'"]);
  assert.deepEqual(page['style-src'], ["'self'"]);
  assert.deepEqual(page['img-src'], ["'self'", 'https:', 'blob:']);
});

test('unsupported deployment configuration fails instead of silently dropping rules', () => {
  for (const extra of [
    '\n[context.production]\ncommand = "other build"\n',
    '\n[[redirects]]\nfrom = "/conditional"\nto = "/"\nstatus = 302\nconditions = {Country = ["US"]}\n',
    '\n[[redirects]]\nfrom = "/conditional"\nto = "/"\nstatus = 302\n[redirects.headers]\nX-Test = "value"\n',
    '\n[[headers]]\nfor = "/other/*"\n[headers.values]\nX-Test = "value"\nx-test = "duplicate"\n',
    '\n[[headers]]\nfor = "/other/*"\n[headers.values]\nX-Test = "\\uD800"\n',
  ]) assert.throws(() => renderNetlifyPublishFiles(configuration + extra), /Unsupported netlify\.toml/);
  for (const changed of [
    configuration.replace('force = true', 'force = "true"'),
    configuration.replace('status = 200', 'status = 999'),
    configuration.replace('status = 200', 'status = 200 # inline comments are outside this subset'),
    configuration.replace('Cache-Control = "no-cache"', 'Cache-Control = "no-cache\\nX-Injected: yes"'),
    configuration.replace('to = "/testnet/index.html"', 'to = "relative/path"'),
  ]) assert.throws(() => renderNetlifyPublishFiles(changed), /Unsupported netlify\.toml|Invalid Netlify/);
});
