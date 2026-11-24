export function showStartupFailure(documentObject = document, reload = () => location.reload()) {
  const startup = documentObject.getElementById('startup-loader');
  startup.hidden = false; startup.setAttribute('role', 'alert');
  const title = documentObject.createElement('h1'); title.textContent = 'The launchpad could not load';
  const detail = documentObject.createElement('p'); detail.textContent = 'Refresh the page to recover. No wallet action or transaction has started.';
  const button = documentObject.createElement('button'); button.type = 'button'; button.className = 'button primary'; button.textContent = 'Retry launchpad'; button.onclick = reload;
  startup.replaceChildren(title, detail, button);
  documentObject.getElementById('main').hidden = true;
  documentObject.getElementById('network-status').textContent = 'Launchpad unavailable';
}
export async function loadSelectedApplication({ href = location.href, replace = value => location.replace(value), loadMainnet = () => import('./app.mjs') } = {}) {
  const network = selectedNetwork(href);
  if (network === 'testnet') { replace(networkURL(href, 'testnet')); return 'testnet'; }
  await loadMainnet(); return 'mainnet';
}
export async function boot({ load = loadSelectedApplication, recover = showStartupFailure } = {}) {
  try { await load(); return true; } catch { recover(); return false; }
}
if (typeof document !== 'undefined') boot();
import { selectedNetwork, networkURL } from './network.mjs';
