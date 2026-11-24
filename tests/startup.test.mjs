import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { boot, showStartupFailure } from '../src/startup.mjs';
test('a failed application import invokes recovery instead of leaving an endless spinner', async () => {
  let recoveries = 0;
  assert.equal(await boot({ load: async () => { throw new Error('module unavailable'); }, recover: () => recoveries++ }), false);
  assert.equal(recoveries, 1);
  assert.equal(await boot({ load: async () => {}, recover: () => recoveries++ }), true); assert.equal(recoveries, 1);
});
test('recovery page exposes retry without transaction or wallet APIs', () => {
  const make = () => ({ children: [], hidden: false, setAttribute() {}, replaceChildren(...nodes) { this.children = nodes; } });
  const nodes = new Map(['startup-loader', 'main', 'network-status'].map(id => [id, make()]));
  let retries = 0;
  showStartupFailure({ getElementById: id => nodes.get(id), createElement: make }, () => retries++);
  assert.equal(nodes.get('main').hidden, true); assert.equal(nodes.get('startup-loader').hidden, false);
  const button = nodes.get('startup-loader').children[2]; assert.equal(button.textContent, 'Retry launchpad'); button.onclick(); assert.equal(retries, 1);
});
test('built page includes local startup, reduced motion and safe unavailable destination defaults', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../dist/launchpad.css', import.meta.url), 'utf8');
  assert.ok(html.includes('src="./startup.mjs"')); assert.ok(css.includes('prefers-reduced-motion:reduce'));
  assert.equal(html.includes('href="https://dex.xerisweb.com"'), false);
  assert.equal(css.includes('#network-status::before'), false);
  assert.ok(html.includes('Mainnet DEX unavailable'));
});
