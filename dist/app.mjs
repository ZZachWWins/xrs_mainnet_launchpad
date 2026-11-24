import { createLaunchpadAPI } from './api.mjs';
import { CONFIG, formatRaw, selectTokens, previewToken } from './model.mjs';
const $ = id => document.getElementById(id), api = createLaunchpadAPI();
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
if (CONFIG.dexUrl) {
  const destination = new URL(CONFIG.dexUrl);
  if (destination.protocol === 'https:' && !destination.username && !destination.password) {
    $('dex-link').href = destination.href; $('dex-link').hidden = false; $('dex-unavailable').hidden = true;
  }
}
let feed = null, filter = 'all', loading = false, verified = false, generation = 0;
function loadingView(container, message) {
  container.setAttribute('aria-busy', 'true');
  const panel = element('div', undefined, 'view-loading'), spinner = element('span', undefined, 'loading-circle'); spinner.setAttribute('aria-hidden', 'true');
  panel.append(spinner, element('span', message)); container.replaceChildren(panel);
}
function emptyState(title, detail, action = null) {
  const panel = element('div', undefined, 'empty-state');
  const icon = element('span', '✳', 'empty-icon'); icon.setAttribute('aria-hidden', 'true');
  panel.append(icon, element('h3', title), element('p', detail));
  if (action) panel.append(action); return panel;
}
function retryButton() { const button = element('button', 'Retry launchpad feed', 'button small'); button.type = 'button'; button.onclick = () => verified ? refreshFeed() : connect(); return button; }
function feedError(error) {
  const text = error?.code === 'UNAVAILABLE_ROUTE' ? 'The launchpad feed is not available from the public endpoint. This does not mean there are no tokens.'
    : error?.code === 'RATE_LIMITED' ? 'The network is handling many requests. Please retry shortly.'
      : 'Current launchpad data could not be verified. No token count or valuation is shown until the feed recovers.';
  $('feed-content').setAttribute('aria-busy', 'false');
  $('feed-content').replaceChildren(emptyState('Launchpad discovery is unavailable', text, retryButton()));
  $('feed-subtitle').textContent = 'Current listings are unavailable.'; $('feed-as-of').textContent = 'No current feed snapshot.';
}
function renderFeed() {
  if (!feed || feed.expiresAt <= Date.now()) { feed = null; feedError(); return; }
  const content = $('feed-content'); content.setAttribute('aria-busy', 'false');
  const tokens = selectTokens(feed.tokens, $('token-search').value, filter);
  $('feed-subtitle').textContent = `${feed.tokens.length.toLocaleString()} ${feed.tokens.length === 1 ? 'token' : 'tokens'} listed in the current verified feed.`;
  $('feed-as-of').textContent = `Feed observed ${new Date(feed.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · Slot ${feed.slot}`;
  if (!feed.tokens.length) {
    const action = element('a', 'Prepare a local token preview ↗', 'text-link'); action.href = '#create';
    content.replaceChildren(emptyState('No launchpad tokens in this feed', 'The current mainnet feed contains no listed launchpad tokens. Token creation and trading remain unavailable in this beta.', action)); return;
  }
  if (!tokens.length) { content.replaceChildren(emptyState('No matching listed tokens', 'Try another name or symbol, or choose All listed.')); return; }
  const wrapper = element('div', undefined, 'table-scroll'), table = element('table', undefined, 'token-table'), head = element('thead'), row = element('tr');
  for (const text of ['Token', 'Circulating supply', 'Market value · xUSDC', 'Access']) row.append(element('th', text)); head.append(row); table.append(head);
  const body = element('tbody');
  for (const token of tokens) {
    const tr = element('tr'), identity = element('td'), grouping = element('div', undefined, 'token-identity'), labels = element('div');
    const avatar = element('span', token.symbol.slice(0, 2).toUpperCase(), 'token-avatar'); avatar.setAttribute('aria-hidden', 'true');
    labels.append(element('span', token.name, 'token-name'), element('span', token.symbol, 'token-symbol'), element('span', token.id, 'token-id'));
    grouping.append(avatar, labels); identity.append(grouping); tr.append(identity);
    tr.append(element('td', token.status === 'ready' ? formatRaw(token.circulatingRaw, 9, 4) : 'Unavailable', 'number'));
    tr.append(element('td', token.status === 'ready' ? formatRaw(token.marketCapRaw, 6, 2) : 'Unavailable', 'number'));
    const access = element('td'); access.append(element('span', 'Read only', 'status-tag muted')); tr.append(access); body.append(tr);
  }
  table.append(body); wrapper.append(table); content.replaceChildren(wrapper);
}
async function refreshFeed({ quiet = false } = {}) {
  if (loading || !verified) return;
  loading = true; const attempt = generation;
  $('refresh-feed').disabled = true;
  const spinner = element('span', undefined, 'loading-circle button-spinner'); spinner.setAttribute('aria-hidden', 'true');
  $('refresh-feed').replaceChildren(spinner, document.createTextNode('Loading launches…'));
  $('feed-content').setAttribute('aria-busy', 'true');
  if (!quiet || !feed) loadingView($('feed-content'), 'Loading launchpad tokens…');
  try { const result = await api.getFeed(); if (attempt !== generation) return; feed = result; renderFeed(); }
  catch (error) { if (attempt !== generation) return; feed = null; feedError(error); }
  finally { if (attempt === generation) { loading = false; $('refresh-feed').disabled = false; $('refresh-feed').textContent = 'Refresh launches ↻'; } }
}
async function connect() {
  generation++; loading = false; verified = false; feed = null;
  $('startup-loader').hidden = false; $('main').hidden = true; $('main').setAttribute('aria-busy', 'true');
  $('loading-title').textContent = 'Connecting to Xeris Mainnet…'; $('loading-detail').textContent = 'Verifying the network before displaying launchpad data.';
  $('retry-connection').disabled = true; $('connection-notice').hidden = true;
  $('network-status').textContent = 'Connecting to Xeris Mainnet…'; $('network-status').classList.remove('connected');
  const attempt = generation;
  try {
    await api.verifyNetwork(); if (attempt !== generation) return;
    verified = true; $('network-status').textContent = 'Mainnet identity verified'; $('network-status').classList.add('connected');
    $('loading-title').textContent = 'Loading launchpad tokens…'; $('loading-detail').textContent = 'Retrieving the current mainnet launchpad feed.';
    await refreshFeed();
  } catch (error) {
    if (attempt !== generation) return;
    $('network-status').textContent = 'Mainnet connection unavailable'; $('connection-notice').hidden = false;
    $('connection-message').textContent = error?.code === 'NETWORK_MISMATCH' ? 'The endpoint did not match the pinned Xeris Mainnet checkpoint. Data display has been stopped.' : 'We could not verify Xeris Mainnet. Retry to load discovery; the token form remains a local preview.';
    feedError(error);
  } finally { if (attempt === generation) { $('startup-loader').hidden = true; $('main').hidden = false; $('main').setAttribute('aria-busy', 'false'); $('retry-connection').disabled = false; } }
}
function route() {
  const requested = location.hash.slice(1), view = ['create', 'guide'].includes(requested) ? requested : 'discover';
  for (const name of ['discover', 'create', 'guide']) $(`view-${name}`).hidden = name !== view;
  for (const link of document.querySelectorAll('[data-view]')) { if (link.dataset.view === view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }
  document.title = `${view === 'create' ? 'Create preview' : view === 'guide' ? 'How it works' : 'Discover'} · Xeris Launchpad`;
}
$('refresh-feed').onclick = () => refreshFeed(); $('retry-connection').onclick = connect;
$('token-search').oninput = () => { if (!loading) renderFeed(); };
for (const button of document.querySelectorAll('[data-filter]')) button.onclick = () => {
  filter = button.dataset.filter;
  for (const tab of document.querySelectorAll('[data-filter]')) tab.setAttribute('aria-pressed', String(tab === button));
  if (!loading) renderFeed();
};
let previewGeneration = 0;
$('preview-form').onsubmit = async event => {
  event.preventDefault(); const current = ++previewGeneration, button = $('preview-button');
  const input = Object.fromEntries(new FormData(event.currentTarget));
  button.disabled = true; button.textContent = 'Preparing your token preview…'; $('preview-error').hidden = true;
  loadingView($('token-preview'), 'Preparing your token preview…');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    const preview = previewToken(input), container = $('token-preview');
    if (current !== previewGeneration) return;
    const header = element('div', undefined, 'preview-header'), heading = element('div');
    heading.append(element('h2', preview.name), element('p', preview.ticker));
    header.append(element('span', preview.ticker.slice(0, 2), 'token-avatar'), heading);
    const badge = element('span', 'Local preview · not deployed', 'status-tag');
    const definition = element('dl', undefined, 'preview-data');
    for (const [label, value] of [['Token ID', preview.tokenId], ['Total supply', formatRaw(preview.supplyRaw, 9)], ['Curve sale supply', formatRaw(preview.saleRaw, 9)],
      ['Liquidity reserve', `${formatRaw(preview.liquidityBps, 2)}%`], ['Liquidity target', `${formatRaw(preview.targetRaw, 9)} XRS`],
      ['Retained metadata', `${preview.metadataBytes} bytes`], ['Estimated creation fee', `${formatRaw(preview.creationFeeRaw, 9)} native XRS`], ['Vesting', 'Disabled']]) {
      const row = element('div'); row.append(element('dt', label), element('dd', value)); definition.append(row);
    }
    container.replaceChildren(badge, header);
    if (preview.description) container.append(element('p', preview.description, 'preview-description'));
    container.append(definition, element('p', 'This metadata estimate does not check ID availability, wallet balance or live execution. No transaction has been created.', 'preview-warning'));
    container.setAttribute('aria-busy', 'false');
  } catch (error) {
    $('preview-error').textContent = error.message; $('preview-error').hidden = false;
    $('token-preview').setAttribute('aria-busy', 'false'); $('token-preview').replaceChildren(emptyState('Your preview needs a few details', 'Correct the highlighted message, then build the local preview again.'));
  } finally { button.disabled = false; button.textContent = 'Build local preview ↗'; }
};
window.addEventListener('hashchange', route); route(); connect();
setInterval(() => { if (feed && feed.expiresAt <= Date.now()) { feed = null; feedError(); } }, 1000);
setInterval(() => { if (!document.hidden && verified) refreshFeed({ quiet: true }); }, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && verified) refreshFeed({ quiet: true }); });
