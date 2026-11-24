import { createLaunchpadAPI } from './api.mjs';
import { CONFIG, formatRaw, selectTokens, previewToken } from './model.mjs';
import { IMAGE_LIMITS, safeImageURL, prepareLocalPhoto } from './images.mjs';
import { coinRoute, parseProfileRoute, createDraftStore } from './profiles.mjs';
import { mainnetLink } from './network.mjs';
const $ = id => document.getElementById(id), api = createLaunchpadAPI();
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
function brandImage(className) {
  const image = document.createElement('img'); image.src = './assets/xeris.png'; image.alt = 'Xeris logo'; image.width = 44; image.height = 44; image.className = className; return image;
}
if (CONFIG.dexUrl) {
  const destination = new URL(CONFIG.dexUrl);
  if (destination.protocol === 'https:' && !destination.username && !destination.password) {
    $('dex-link').href = destination.href; $('dex-link').hidden = false; $('dex-unavailable').hidden = true;
  }
}
let feed = null, filter = 'all', loading = false, verified = false, connecting = false, generation = 0;
let selectedPhoto = null, photoGeneration = 0, photoLoading = false, profileGeneration = 0, currentProfile = null, thumbnailGeneration = 0;
const drafts = createDraftStore();
function picture(source, name, symbol, className = 'token-avatar') {
  const box = element('div', undefined, className), fallback = element('span', symbol.slice(0, 2).toUpperCase());
  box.setAttribute('role', 'img'); box.setAttribute('aria-label', `Photo unavailable for ${name}`); fallback.setAttribute('aria-hidden', 'true'); box.append(fallback);
  if (source) {
    const image = document.createElement('img'); image.alt = ''; image.setAttribute('aria-hidden', 'true');
    image.decoding = 'async'; image.loading = 'eager'; image.referrerPolicy = 'no-referrer'; image.hidden = true;
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > IMAGE_LIMITS.dimension || image.naturalHeight > IMAGE_LIMITS.dimension) { image.remove(); return; }
      fallback.hidden = true; image.hidden = false; box.setAttribute('aria-label', `${name} token photo`);
    };
    image.onerror = () => { image.remove(); fallback.hidden = false; };
    image.src = source; box.append(image);
  }
  return box;
}
function definition(rows, className = 'preview-data') {
  const list = element('dl', undefined, className);
  for (const [label, value] of rows) { const row = element('div'); row.append(element('dt', label), element('dd', value)); list.append(row); }
  return list;
}
function loadingView(container, message) {
  container.setAttribute('aria-busy', 'true');
  const panel = element('div', undefined, 'view-loading'), spinner = element('span', undefined, 'loading-circle'); spinner.setAttribute('aria-hidden', 'true');
  panel.append(spinner, element('span', message)); container.replaceChildren(panel);
}
function emptyState(title, detail, action = null) {
  const panel = element('div', undefined, 'empty-state');
  const icon = brandImage('empty-icon brand-image');
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
    const action = element('a', 'Prepare a local token preview ↗', 'text-link'); action.href = mainnetLink('#create', location.href);
    content.replaceChildren(emptyState('No launchpad tokens in this feed', 'The current mainnet feed contains no listed launchpad tokens. Token creation and trading remain unavailable in this beta.', action)); return;
  }
  if (!tokens.length) { content.replaceChildren(emptyState('No matching listed tokens', 'Try another name or symbol, or choose All listed.')); return; }
  const wrapper = element('div', undefined, 'table-scroll'), table = element('table', undefined, 'token-table'), head = element('thead'), row = element('tr');
  for (const text of ['Token', 'Circulating supply', 'Market value · xUSDC', 'Access']) row.append(element('th', text)); head.append(row); table.append(head);
  const body = element('tbody');
  const thumbnails = [], thumbnailAttempt = ++thumbnailGeneration;
  for (const token of tokens) {
    const tr = element('tr'), identity = element('td'), grouping = element('div', undefined, 'token-identity'), labels = element('div');
    const avatar = picture(null, token.name, token.symbol);
    const name = element('a', token.name, 'token-name coin-link'); name.href = mainnetLink(coinRoute(token.id), location.href);
    labels.append(name, element('span', token.symbol, 'token-symbol'), element('span', token.id, 'token-id'));
    grouping.append(avatar, labels); identity.append(grouping); tr.append(identity);
    tr.append(element('td', token.status === 'ready' ? formatRaw(token.circulatingRaw, 9, 4) : 'Unavailable', 'number'));
    tr.append(element('td', token.status === 'ready' ? formatRaw(token.marketCapRaw, 6, 2) : 'Unavailable', 'number'));
    const access = element('td'), profile = element('a', 'View coin ↗', 'text-link'); profile.href = mainnetLink(coinRoute(token.id), location.href); profile.setAttribute('aria-label', `View ${token.name} coin profile`);
    access.append(profile); tr.append(access); body.append(tr);
    if (thumbnails.length < 12) thumbnails.push({ token, avatar });
  }
  table.append(body); wrapper.append(table); content.replaceChildren(wrapper);
  // Only a bounded first group of visible thumbnails is hydrated. Coin pages
  // resolve the selected token independently; no unbounded detail fan-out.
  async function hydrate() {
    while (thumbnails.length && thumbnailAttempt === thumbnailGeneration) {
      const { token, avatar } = thumbnails.shift();
      try { const info = await api.getProfile(token.id); if (thumbnailAttempt === thumbnailGeneration && avatar.isConnected && info.metadata?.imageURL) avatar.replaceWith(picture(info.metadata.imageURL, token.name, token.symbol)); } catch { /* Initials remain an honest unavailable-photo fallback. */ }
    }
  }
  hydrate(); hydrate();
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
  generation++; profileGeneration++; connecting = true; loading = false; verified = false; feed = null;
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
  } finally { if (attempt === generation) { connecting = false; $('startup-loader').hidden = true; $('main').hidden = false; $('main').setAttribute('aria-busy', 'false'); $('retry-connection').disabled = false; if (parseProfileRoute(location.hash)) route(); } }
}
function renderEconomics(profile, container) {
  container.replaceChildren(element('h2', profile.kind === 'draft' ? 'Your token plan' : 'Token economics'));
  const rows = [];
  if (profile.kind === 'draft') {
    const value = profile.preview;
    rows.push(['Total supply', formatRaw(value.supplyRaw, 9)], ['Curve sale allocation', formatRaw(value.saleRaw, 9)],
      ['Graduated liquidity allocation', formatRaw(value.reservedRaw, 9)], ['Liquidity target', `${formatRaw(value.targetRaw, 9)} XRS`],
      ['Estimated creation fee', `${formatRaw(value.creationFeeRaw, 9)} native XRS`]);
  } else if (profile.expiresAt > Date.now()) {
    const value = profile.metadata?.economics;
    if (value) rows.push(['Total supply', formatRaw(value.totalRaw, 9)], ['Curve sale allocation', formatRaw(value.saleRaw, 9)],
      ['Graduated liquidity allocation', formatRaw(value.liquidityRaw, 9)], ['Curve collected', `${formatRaw(value.collectedRaw, 9)} wXRS`],
      ['Liquidity target', `${formatRaw(value.targetRaw, 9)} XRS`], ['Curve status', value.finalized ? 'Graduated' : 'Not finalized']);
    if (profile.token.status === 'ready') rows.push(['Verified circulating supply', formatRaw(profile.token.circulatingRaw, 9, 4)], ['Market value', `${formatRaw(profile.token.marketCapRaw, 6, 2)} xUSDC`]);
  }
  if (rows.length) container.append(definition(rows));
  else container.append(element('p', 'Current economics are unavailable. Refresh the profile to request verified data.', 'profile-muted'));
  container.append(element('p', 'Curve fees: 1% creator + 0.77% protocol. Graduated pools: 0.3% LP fee.', 'preview-warning'));
}
function renderCoinHome(profile) {
  currentProfile = profile;
  const draft = profile.kind === 'draft', token = draft ? { id: profile.preview.tokenId, name: profile.preview.name, symbol: profile.preview.ticker } : profile.token;
  const metadata = draft ? null : profile.metadata, name = token.name;
  const source = draft ? (profile.photo?.url ?? profile.preview.imageUrl) || null : metadata?.imageURL ?? null;
  const container = $('coin-content'); container.setAttribute('aria-busy', 'false');
  const header = element('header', undefined, 'coin-home-header'), identity = element('div', undefined, 'coin-home-identity');
  identity.append(element('p', draft ? 'Creator preview' : 'Xeris Mainnet coin', 'eyebrow'));
  const title = element('h1', name); title.id = 'coin-title'; title.tabIndex = -1;
  identity.append(title, element('p', token.symbol, 'coin-home-symbol'), element('span', draft ? 'Local preview · Not deployed' : 'Mainnet profile · Read only', 'status-tag'), element('p', token.id, 'coin-home-id'));
  header.append(picture(source, name, token.symbol, 'coin-portrait'), identity);
  const tools = element('div', undefined, 'coin-tools'), action = element('a', draft ? 'Edit local preview ↗' : 'All launches ↗', 'button small'); action.href = mainnetLink(draft ? '#create' : '#discover', location.href); tools.append(action);
  if (!draft) { const refresh = element('button', 'Refresh coin', 'button small'); refresh.type = 'button'; refresh.onclick = () => openProfile(parseProfileRoute(location.hash), true); tools.append(refresh); }
  identity.append(tools);
  const layout = element('div', undefined, 'coin-layout'), main = element('div', undefined, 'coin-main'), sidebar = element('aside', undefined, 'coin-sidebar');
  const about = element('section', undefined, 'panel coin-about'); about.append(element('h2', `About ${name}`));
  const description = draft ? profile.preview.description : metadata?.description;
  about.append(element('p', description || (draft ? 'Add a description in the token form to introduce your idea.' : description === '' ? 'No description is published in this contract.' : 'A verified description is currently unavailable.'), 'coin-description'));
  const ids = definition([['Token identifier', token.id], ['Contract identifier', draft ? profile.preview.contractId : token.id.slice(3)], ['Network', 'Xeris Mainnet']], 'preview-data coin-identifiers'); about.append(ids);
  const economics = element('section', undefined, 'panel coin-economics'); economics.id = 'coin-economics'; renderEconomics(profile, economics);
  const livestream = element('section', undefined, 'panel livestream-card');
  livestream.append(element('span', '▷', 'stream-placeholder'), element('h2', 'Livestream'), element('p', 'Coming soon', 'stream-state'), element('p', 'A place for creators to share updates with their community. Streaming is not available in this beta.', 'profile-muted'));
  const creator = element('section', undefined, 'panel creator-home'); creator.append(element('p', 'Creator home', 'eyebrow'), element('h2', 'Meet the creator'));
  if (draft) creator.append(element('p', 'Your signing wallet will identify the creator when the launch flow is available. This local preview is not connected to a wallet.', 'profile-muted'));
  else if (metadata?.creator) creator.append(element('span', 'On-chain creator wallet', 'creator-label'), element('p', metadata.creator, 'creator-address'), element('p', 'Creator identity is sourced from the matching mainnet contract. No biography or social links have been published here.', 'profile-muted'));
  else creator.append(element('p', 'Creator information unavailable', 'creator-label'), element('p', 'The current public data does not provide a verified creator wallet for this profile.', 'profile-muted'));
  const scope = element('section', undefined, 'panel profile-scope');
  scope.append(element('span', draft ? 'Local only' : 'Read only', 'status-tag muted'), element('h3', draft ? 'Your idea, before launch.' : 'Know what is available.'), element('p', draft
    ? 'This preview exists only in this tab. A chosen photo file is not uploaded, hosted or included in on-chain metadata. Reloading clears this preview.'
    : 'Creation, buying, selling, graduation and reward claims remain unavailable on this website.', 'profile-muted'));
  main.append(about, economics, livestream); sidebar.append(creator, scope); layout.append(main, sidebar); container.replaceChildren(header, layout);
  document.title = `${name} · ${draft ? 'Local preview' : 'Coin profile'} · Xeris Launchpad`;
}
async function openProfile(profileRoute, refresh = false) {
  const attempt = ++profileGeneration, container = $('coin-content'); currentProfile = null;
  if (!profileRoute || profileRoute.kind === 'invalid') { container.replaceChildren(emptyState('Coin profile unavailable', 'This link does not identify a supported coin or local preview.')); container.setAttribute('aria-busy', 'false'); return; }
  if (profileRoute.kind === 'draft') {
    const draft = drafts.get();
    if (draft) renderCoinHome(draft);
    else { const link = element('a', 'Create a local preview ↗', 'button'); link.href = mainnetLink('#create', location.href); container.replaceChildren(emptyState('Local preview is unavailable', 'Drafts exist only in the tab where they were created. No deployed token is associated with this link.', link)); container.setAttribute('aria-busy', 'false'); }
    return;
  }
  if (!verified) {
    if (connecting) loadingView(container, 'Verifying mainnet before loading the coin profile…');
    else { const retry = element('button', 'Retry mainnet connection', 'button'); retry.type = 'button'; retry.onclick = connect; container.replaceChildren(emptyState('Coin profile is unavailable', 'Mainnet identity could not be verified. Reconnect before loading a listed coin.', retry)); container.setAttribute('aria-busy', 'false'); }
    return;
  }
  loadingView(container, 'Loading coin photo and creator profile…');
  try { const info = await api.getProfile(profileRoute.tokenId, { refresh }); if (attempt !== profileGeneration) return; renderCoinHome({ kind: 'coin', ...info }); }
  catch (error) {
    if (attempt !== profileGeneration) return;
    const button = element('button', 'Retry coin profile', 'button'); button.type = 'button'; button.onclick = () => openProfile(profileRoute, true);
    container.replaceChildren(emptyState('Coin profile unavailable', error?.code === 'NOT_LISTED' ? 'This token is not listed in the current verified feed. No creator or token metadata has been inferred.' : 'Current coin information could not be verified. Please retry the profile.', button)); container.setAttribute('aria-busy', 'false');
  }
}
function route() {
  const requested = location.hash.slice(1), profileRoute = parseProfileRoute(location.hash), view = profileRoute ? 'profile' : ['create', 'guide'].includes(requested) ? requested : 'discover';
  profileGeneration++;
  for (const name of ['discover', 'create', 'guide', 'profile']) $(`view-${name}`).hidden = name !== view;
  for (const link of document.querySelectorAll('[data-view]')) { if (link.dataset.view === view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); }
  document.title = `${view === 'create' ? 'Create preview' : view === 'guide' ? 'How it works' : 'Discover'} · Xeris Launchpad`;
  if (!['launches', 'main'].includes(requested)) window.scrollTo({ top: 0, behavior: 'instant' });
  if (profileRoute) openProfile(profileRoute);
}
$('refresh-feed').onclick = () => refreshFeed(); $('retry-connection').onclick = connect;
$('token-search').oninput = () => { if (!loading) renderFeed(); };
for (const button of document.querySelectorAll('[data-filter]')) button.onclick = () => {
  filter = button.dataset.filter;
  for (const tab of document.querySelectorAll('[data-filter]')) tab.setAttribute('aria-pressed', String(tab === button));
  if (!loading) renderFeed();
};
let previewGeneration = 0;
function clearSelectedPhoto() {
  photoGeneration++; photoLoading = false; selectedPhoto?.release(); selectedPhoto = null;
  $('photo-file').value = ''; $('remove-photo').hidden = true;
  $('photo-selection').replaceChildren(brandImage('brand-placeholder'));
  $('photo-status').textContent = 'A selected file stays in this tab. It is never uploaded or hosted.';
  $('preview-button').disabled = false;
}
$('remove-photo').onclick = clearSelectedPhoto;
$('photo-file').onchange = async event => {
  const file = event.currentTarget.files?.[0], attempt = ++photoGeneration;
  selectedPhoto?.release(); selectedPhoto = null; $('remove-photo').hidden = true;
  $('photo-selection').replaceChildren(brandImage('brand-placeholder'));
  if (!file) { clearSelectedPhoto(); return; }
  photoLoading = true; $('preview-button').disabled = true; $('photo-status').textContent = 'Checking your photo…';
  try {
    const photo = await prepareLocalPhoto(file);
    if (attempt !== photoGeneration) { photo.release(); return; }
    selectedPhoto = photo;
    $('photo-selection').replaceChildren(picture(photo.url, 'Your local preview', '', 'selected-photo'));
    $('remove-photo').hidden = false;
    $('photo-status').textContent = `${photo.name} · ${photo.width} × ${photo.height}px · Local preview only. Not uploaded or hosted.`;
  } catch (error) { if (attempt === photoGeneration) { $('photo-status').textContent = error.message; $('photo-file').value = ''; } }
  finally { if (attempt === photoGeneration) { photoLoading = false; $('preview-button').disabled = false; } }
};
$('photo-url').onchange = () => {
  if (selectedPhoto || !$('photo-url').value.trim()) return;
  try { const url = safeImageURL($('photo-url').value.trim()); $('photo-selection').replaceChildren(picture(url, 'Your HTTPS image preview', '', 'selected-photo')); $('photo-status').textContent = 'HTTPS image preview. The URL is included in the local metadata plan.'; }
  catch (error) { $('photo-selection').replaceChildren(brandImage('brand-placeholder')); $('photo-status').textContent = error.message; }
};
$('preview-form').onsubmit = async event => {
  event.preventDefault(); const current = ++previewGeneration, button = $('preview-button');
  if (photoLoading) return;
  const input = Object.fromEntries(new FormData(event.currentTarget));
  button.disabled = true; button.textContent = 'Preparing your token preview…'; $('preview-error').hidden = true;
  loadingView($('token-preview'), 'Preparing your token preview…');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    if (selectedPhoto && input.imageUrl.trim()) throw new Error('Choose a local photo or an HTTPS image URL, not both. Remove the photo or clear the URL.');
    const preview = previewToken(input), container = $('token-preview');
    if (current !== previewGeneration) return;
    const draft = drafts.set(preview, selectedPhoto);
    const header = element('div', undefined, 'preview-header'), heading = element('div');
    heading.append(element('h2', preview.name), element('p', preview.ticker));
    header.append(picture((draft.photo?.url ?? preview.imageUrl) || null, preview.name, preview.ticker), heading);
    const badge = element('span', 'Local preview · not deployed', 'status-tag');
    const definition = element('dl', undefined, 'preview-data');
    for (const [label, value] of [['Token ID', preview.tokenId], ['Total supply', formatRaw(preview.supplyRaw, 9)], ['Curve sale supply', formatRaw(preview.saleRaw, 9)],
      ['Liquidity reserve', `${formatRaw(preview.liquidityBps, 2)}%`], ['Liquidity target', `${formatRaw(preview.targetRaw, 9)} XRS`],
      ['Retained metadata', `${preview.metadataBytes} bytes`], ['Estimated creation fee', `${formatRaw(preview.creationFeeRaw, 9)} native XRS`], ['Vesting', 'Disabled']]) {
      const row = element('div'); row.append(element('dt', label), element('dd', value)); definition.append(row);
    }
    container.replaceChildren(badge, header);
    if (preview.description) container.append(element('p', preview.description, 'preview-description'));
    const open = element('a', 'Open your coin preview ↗', 'button primary wide'); open.href = mainnetLink(draft.href, location.href);
    container.append(definition, open, element('p', draft.photo
      ? 'This photo is local only. A public hosted image URL is still required before any future launch and may change the metadata-fee estimate. Nothing has been deployed.'
      : 'This metadata estimate does not check ID availability, wallet balance or live execution. No transaction has been created.', 'preview-warning'));
    container.setAttribute('aria-busy', 'false');
  } catch (error) {
    $('preview-error').textContent = error.message; $('preview-error').hidden = false;
    $('token-preview').setAttribute('aria-busy', 'false'); $('token-preview').replaceChildren(emptyState('Your preview needs a few details', 'Correct the highlighted message, then build the local preview again.'));
  } finally { button.disabled = false; button.textContent = 'Build local preview ↗'; }
};
window.addEventListener('hashchange', route); route(); connect();
setInterval(() => { if (feed && feed.expiresAt <= Date.now()) { feed = null; feedError(); } }, 1000);
setInterval(() => { if (currentProfile?.kind === 'coin' && currentProfile.expiresAt <= Date.now() && $('coin-economics')) renderEconomics(currentProfile, $('coin-economics')); }, 1000);
setInterval(() => { if (!document.hidden && verified) refreshFeed({ quiet: true }); }, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && verified) refreshFeed({ quiet: true }); });
window.addEventListener('pagehide', () => { photoGeneration++; selectedPhoto?.release(); selectedPhoto = null; drafts.clear(); });
window.addEventListener('pageshow', event => { if (event.persisted) { clearSelectedPhoto(); if (parseProfileRoute(location.hash)) route(); } });
