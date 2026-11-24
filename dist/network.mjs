const MODES = new Set(['testnet', 'mainnet']);
export const DEFAULT_NETWORK = 'testnet';
export function selectedNetwork(href) {
  const url = new URL(href), values = url.searchParams.getAll('network');
  const selected = values[0] ?? DEFAULT_NETWORK;
  if (values.length > 1 || !MODES.has(selected)) throw new Error('Choose Testnet or Mainnet Beta.');
  return selected;
}
export function networkURL(href, network) {
  if (!MODES.has(network)) throw new Error('Unsupported network.');
  const current = new URL(href), destination = new URL(current.origin);
  if (network === 'testnet') {
    const oldRoute = current.pathname.replace(/^\/testnet(?=\/|$)/, '');
    destination.pathname = /^\/(?:create|features|ecosystem|docs|dashboard|token\/[^/?#]{1,350})\/?$/.test(oldRoute)
      ? '/testnet' + oldRoute : '/testnet/';
  } else { destination.pathname = '/'; destination.hash = current.pathname.startsWith('/testnet') ? '#discover' : current.hash; }
  destination.searchParams.set('network', network); return destination.href;
}
export function mainnetLink(hash, href) {
  if (typeof hash !== 'string' || !/^#(?:discover|launches|main|create|guide|preview\/local|coin\/lp_[A-Za-z0-9_-]{1,116})$/.test(hash)) throw new Error('Invalid Mainnet view.');
  const url = new URL(networkURL(href, 'mainnet')); url.hash = hash; return url.pathname + url.search + url.hash;
}
