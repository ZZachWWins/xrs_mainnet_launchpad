import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { prepareLegacy } from './tools/prepare-legacy.mjs';

// This intentionally accepts only the configuration features this site uses.
// New TOML tables, conditions or value types must not silently disappear from
// an artifact-only deploy. netlify.toml remains the authoritative policy.
export function renderNetlifyPublishFiles(source) {
  const headers = [], redirects = [], seenTables = new Set();
  let section, record;
  const fail = (line, message) => { throw new Error(`Unsupported netlify.toml at line ${line}: ${message}`); };
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = index + 1, text = raw.trim();
    if (!text || text.startsWith('#')) continue;
    if (text === '[[headers]]' || text === '[[redirects]]') {
      section = text === '[[headers]]' ? 'header' : 'redirect';
      record = Object.create(null);
      (section === 'header' ? headers : redirects).push(record);
      continue;
    }
    if (text === '[headers.values]') {
      if (section !== 'header' || record.values) fail(line, 'headers.values must follow one headers table');
      record.values = Object.create(null); section = 'header-values'; continue;
    }
    if (text === '[build]' || text === '[build.environment]') {
      if (seenTables.has(text)) fail(line, 'duplicate build table');
      seenTables.add(text); section = text; record = Object.create(null); continue;
    }
    const assignment = text.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!assignment || !section) fail(line, 'expected a supported table or assignment');
    const [, key, literal] = assignment;
    let value;
    // Unicode escape semantics differ between JSON and TOML (surrogates in
    // particular). Require literal UTF-8 text instead of accepting those escapes.
    if (/^"(?:[^"\\\u0000-\u001f]|\\["\\bfnrt])*"$/.test(literal)) value = JSON.parse(literal);
    else if (/^(?:true|false)$/.test(literal)) value = literal === 'true';
    else if (/^(?:0|[1-9]\d*)$/.test(literal) && Number.isSafeInteger(Number(literal))) value = Number(literal);
    else fail(line, 'only single-line quoted strings, integers and booleans are supported');
    const target = section === 'header-values' ? record.values : record;
    if (Object.keys(target).some(existing => existing.toLowerCase() === key.toLowerCase())) fail(line, `duplicate ${key}`);
    const allowed = section === '[build]' ? ['command', 'publish', 'base']
      : section === 'header' ? ['for'] : section === 'redirect' ? ['from', 'to', 'status', 'force'] : null;
    if (allowed && !allowed.includes(key)) fail(line, `unsupported ${section} field ${key}`);
    const expected = section === 'redirect' && key === 'status' ? 'number'
      : section === 'redirect' && key === 'force' ? 'boolean' : 'string';
    if (typeof value !== expected || typeof value === 'string' && /[\u0000-\u001f\u007f]/.test(value)) fail(line, `invalid ${key} value`);
    target[key] = value;
  }
  const path = value => typeof value === 'string' && value.startsWith('/') && !/\s/.test(value);
  if (!headers.length || !redirects.length) throw new Error('netlify.toml must include headers and redirects');
  const headerLines = ['# Generated from netlify.toml by build.mjs. Do not edit.'];
  for (const header of headers) {
    if (!path(header.for) || !header.values || !Object.keys(header.values).length) throw new Error('Invalid Netlify header rule');
    headerLines.push(header.for, ...Object.entries(header.values).map(([key, value]) => `  ${key}: ${value}`), '');
  }
  const redirectLines = ['# Generated from netlify.toml by build.mjs. Do not edit.'];
  for (const redirect of redirects) {
    if (!path(redirect.from) || typeof redirect.to !== 'string' || /\s/.test(redirect.to)
      || !(/^(?:\/|https:\/\/)/.test(redirect.to))
      || ![200, 301, 302, 303, 307, 308, 404, 410].includes(redirect.status)) throw new Error('Invalid Netlify redirect rule');
    redirectLines.push(`${redirect.from} ${redirect.to} ${redirect.status}${redirect.force ? '!' : ''}`);
  }
  return { headers: headerLines.join('\n') + '\n', redirects: redirectLines.join('\n') + '\n' };
}

async function copyChanged(source, destination) {
  const bytes = await readFile(source);
  try { if (bytes.equals(await readFile(destination))) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await copyFile(source, destination);
}
async function writeChanged(text, destination) {
  try { if (text === await readFile(destination, 'utf8')) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(destination, text);
}

async function build() {
  // Validate deploy policy before touching any output files.
  const deploy = renderNetlifyPublishFiles(await readFile(new URL('./netlify.toml', import.meta.url), 'utf8'));
  const output = new URL('./dist/', import.meta.url);
  await mkdir(output, { recursive: true });
  for (const name of ['index.html', 'launchpad.css', 'model.mjs', 'api.mjs', 'app.mjs', 'startup.mjs', 'images.mjs', 'profiles.mjs', 'network.mjs', 'network.css', 'legacy-safety.mjs']) {
    await copyChanged(new URL('./src/' + name, import.meta.url), new URL(name, output));
  }
  await prepareLegacy(new URL('./', import.meta.url), output);
  await mkdir(new URL('./assets/licenses/', output), { recursive: true });
  for (const name of ['xeris.png', 'inter.woff2', 'jakarta.woff2', 'licenses/Inter-OFL.txt', 'licenses/Plus-Jakarta-Sans-OFL.txt']) {
    await copyChanged(new URL('./public/assets/' + name, import.meta.url), new URL('./assets/' + name, output));
  }
  await writeChanged(deploy.headers, new URL('_headers', output));
  await writeChanged(deploy.redirects, new URL('_redirects', output));
  console.log('Built static launchpad and Netlify routing policy into dist/. No keys, signing or network calls.');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await build();
