import { selectedNetwork, networkURL } from '/network.mjs';
const loader = document.getElementById('testnet-startup-loader'), root = document.getElementById('root');
const networkBar = document.querySelector('.legacy-network-bar');
const updateNavigationOffset = () => {
  document.body.style.setProperty('--legacy-network-height', `${networkBar.getBoundingClientRect().height}px`);
};
updateNavigationOffset();
new ResizeObserver(updateNavigationOffset).observe(networkBar);
function failed(message = 'The Testnet application could not load. Retry to restore the existing Testnet experience.') {
  loader.hidden = false; root.hidden = true; loader.replaceChildren();
  const title = document.createElement('h1'); title.textContent = 'Testnet launchpad is unavailable';
  const detail = document.createElement('p'); detail.textContent = message;
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry Testnet'; retry.onclick = () => location.reload();
  loader.append(title, detail, retry);
}
let mode;
try { mode = selectedNetwork(location.href); } catch { failed('Choose Testnet or Mainnet Beta using the network selector.'); }
if (mode === 'mainnet') location.replace(networkURL(location.href, 'mainnet'));
if (mode === 'testnet') {
  root.hidden = false;
  // Full-page BrowserRouter keeps the native wallet in its top-level document.
  const canonical = networkURL(location.href, 'testnet');
  if (location.href !== canonical) history.replaceState(history.state, '', canonical);
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name].bind(history);
    history[name] = (state, unused, target) => {
      if (target != null) {
        const url = new URL(target, location.href);
        if (url.origin === location.origin && /^\/testnet(?:\/|$)/.test(url.pathname)) { url.searchParams.set('network', 'testnet'); target = url.href; }
      }
      return original(state, unused, target);
    };
  }
  const timeout = setTimeout(() => { observer.disconnect(); if (!root.childElementCount) failed(); }, 10000);
  const observer = new MutationObserver(() => {
    if (root.childElementCount) { clearTimeout(timeout); observer.disconnect(); loader.hidden = true; root.hidden = false; }
  });
  observer.observe(root, { childList: true });
  try { await import('/testnet/assets/index-8rysgo_r.js'); }
  catch { clearTimeout(timeout); observer.disconnect(); failed(); }
}
