# Xeris Launchpad — Testnet and Mainnet Beta

A static dual-network launchpad: the preserved Testnet experience is the default; the new Mainnet Beta provides read-only discovery and local coin previews. Repository: `ZZachWWins/xrs_mainnet_launchpad`. Deploy the repository through Netlify using the included build configuration.

## Build, test and preview

Use Node 22 or later. The project has no npm dependencies and does not need `npm install`.

```sh
npm run build
npm test
npm run preview
```

Open `http://127.0.0.1:8771` for Testnet, or `http://127.0.0.1:8771/?network=mainnet` for Mainnet Beta. Only start one preview server on that port. The local preview proxy permits public read requests only; it does not forward signing or submission actions. Existing explorer and DEX previews use other ports.

On this Mac, the available Node executable is `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node`; it can run `build.mjs` and `--test tests/*.test.mjs` directly when Node is not on `PATH`.

For Netlify, `netlify.toml` builds the local source and publishes `dist`. Mainnet uses hash navigation; the preserved Testnet BrowserRouter has its own `/testnet/*` SPA fallback and isolated RPC proxies. Static fonts and the Xeris logo are included locally; no CDN scripts, runtime packages or private configuration are needed.

The build also generates `dist/_headers` and `dist/_redirects` from that same `netlify.toml`, so deployments that publish the built directory carry the header policy, Testnet proxies, SPA fallback and legacy bookmark redirects with their assets. Do not edit the generated files. The dependency-free transform accepts only the current single-line build, header and redirect configuration; unsupported TOML features or route conditions fail the build rather than being omitted. Add explicit parser support before extending the configuration.

Use the repository root as the Netlify base/package directory, `node build.mjs` as the build command and `dist` as the publish directory. After deployment, verify the live CSP on both networks, `/testnet/create?network=testnet`, `/create`, and the Testnet read routes. Matching HTML alone does not verify active deployment rules. The Mainnet HTML keeps its own stricter CSP, including Mainnet-only API connections.

## Mainnet Beta behavior

- Mainnet identity check against slot `27201` and hash `0a401c139eef73f049010450d4aa13ef38636799784d01bbc0ecdb9c71facaf3` at `https://mainnetrpc.xerisweb.com`.
- Bounded, read-only `GET /market/supply` discovery. Complete, fresh schema-v2 data is required. A verified empty token list is different from missing, stale, malformed or blocked data.
- Token name/symbol search, valuation-available filtering, exact integer supply and xUSDC valuation checks. Unavailable valuations are not replaced with zero or example numbers.
- Local token preview with UTF-8 metadata limits, u64 amounts, supply reservations, and the mapped creation-fee estimate. The form creates no transaction and persists no user input.
- Explorer-style initial/retry loading ring, named feed and preview loading messages, background refresh indication, reduced-motion support and error/retry recovery, including failed module imports.

## Disabled behavior and limits

The Mainnet application has no wallet integrations, signing calls, writes, token deployments, curve buys/sells, graduations, reward claims or funded operations. Testnet preserves token discovery and historical chain reads; its wallet context, signing and submission entry points are disabled following the frontend audit. No wallet connections or funded actions were exercised during website validation. Token-contract ID availability and wallet balances are not checked by the local preview. New-launch vesting is disabled in the mapped protocol.

The Mainnet DEX link explicitly selects `https://dex.xerisweb.com/?network=mainnet#home`, verified in the public browser on November 24, 2026. This is navigation to the separate DEX; it does not enable launchpad wallet actions. Set `CONFIG.dexUrl` to `null` to display the unavailable fallback if the destination changes.

Curve fees are 1% creator plus 0.77% protocol. Graduated generic pools charge 0.3% LP fees; the interface makes no lifetime creator-fee claim. It does not use legacy list counters as true sold inventory, spot pricing or circulating market cap.

The launchpad summary route was unavailable during the initial read probe. This frontend does not enable or bypass blocked routes. A fixed checkpoint and a validated public feed are not an endorsement of a token, a proof of independent full-node validation, or a security audit.

## Source layout and assets

`src/index.html` and `src/launchpad.css` define the responsive UI. `startup.mjs` handles boot recovery; `app.mjs` manages view and loading states; `api.mjs` restricts network reads; `model.mjs` validates public data and local previews. `build.mjs` copies these files and the explicit `public/assets` allowlist into `dist`. Tests use synthetic public fixtures and mock HTTP only.

Route changes use a brief entrance and move focus into the selected view. Async profile responses restore focus only when that profile still owns it; background feed updates do not move focus. Reduced-motion preferences disable transitions and spinner rotation. The desktop preview column stays alongside the form only when its complete contents fit within the viewport. Mainnet navigation and primary mobile actions have at least 44-pixel targets.

## Coin photos and creator profiles

Listed coins link to `#coin/<token_id>`. The site first requires a fresh same-network feed entry, then resolves the matching `/contract/<contract_id>` Launchpad state. Names, token IDs and contract type must agree. Description, creator wallet and economics come only from matching metadata; missing or blocked metadata remains unavailable. A bounded first group of list thumbnails is hydrated with at most two concurrent metadata requests. Financial values expire with their verified snapshot.

The token form accepts a local PNG/JPEG/WebP photo up to 2 MiB and 2,048 pixels per side. File signatures and dimensions are checked before browser decoding. Blob URLs are released when selections or drafts are replaced and when leaving the page. A draft owns its own photo URL, so editing the selection does not silently replace a previously built preview.

`#preview/local` opens a dedicated creator preview page labeled **Local preview · Not deployed**. Drafts and photos exist in tab memory only; reloading clears them. Local files are never uploaded, hosted or stored on chain. HTTPS image URL metadata can also be previewed. File selection and a URL are mutually exclusive. Unsafe protocols, SVG files/URLs, credentials and obvious local/private URL targets are rejected; external images use no-referrer loading and an unavailable-photo fallback.

The creator home identifies only a verified creator wallet. Drafts explain that a future signing wallet will establish creator identity. Livestream is explicitly **Coming soon**, with no camera, microphone, media-stream or embedded-player integration.

Remaining integration includes an explicit user-approved public asset-hosting/upload path, durable draft storage if desired, validated signed creation and final metadata-fee review. An eventual hosted file URL may change the estimated creation fee. None of those write flows is enabled here.

The Xeris logo, Inter and Plus Jakarta Sans fonts were copied from the provided public DEX assets. Font OFL licenses are included under `public/assets/licenses` and `dist/assets/licenses`. No keys, keystores, wallet data, server configuration or credential material is included.

## Preserved Testnet experience and network isolation

The default is configured by `DEFAULT_NETWORK` in `src/network.mjs`, currently Testnet until a Mainnet announcement. The selector performs a full-page transition between `/testnet/?network=testnet` and `/?network=mainnet`; no iframe is used. Mainnet profile, preview and navigation links retain the explicit Mainnet query. Network selection is not inferred from a connected wallet or persisted browser consent.

`legacy-source/` contains the sanitized 76-file public export from `deploy-6a511ef93115010008bb618a.zip` (SHA-256 `f53a8bd97e305456cce1e33b95ef22d1643f5d0991249e2d66ef660f0a58ddd1`). It is read as build input, not executed by build scripts. `tools/prepare-legacy.mjs` checks every allowlisted source-file hash, then applies exact guarded patches for the `/testnet` router base, isolated RPC prefix, raw links, saved-consent auto-connect removal and case-correct asset paths. `legacy-patches.json` records the output hashes. React and the original functionality remain in the supplied compiled application; this is not a recovered maintainable React source tree.

The preserved Testnet chart's dependency API is incompatible with its old `addAreaSeries` call. Its random initial-history fallback and chart-only polling/effects are removed; token pages show “Price history unavailable” instead. Hardcoded holder rows are replaced with “Holder distribution unavailable”; the static information section is labeled “PROTOCOL_DETAILS” rather than implying a security audit. Unloaded or unavailable ticker quotes are suppressed rather than displayed as zero. The fixed network selector remains above legacy navigation and its mobile menu. These targeted compatibility repairs do not constitute a full audit of the legacy application.

Testnet preserves the user's original fixed `https://rpc.xerisweb.com` upstream through `/testnet/rpc` and `/testnet/jsonrpc`. It does not use the explorer's different Testnet upstream or checkpoint. The Testnet header identifies the selected service without claiming checkpoint verification. Root-route legacy bookmarks are redirected into `/testnet/`.

Mainnet keeps its strict page CSP and fixed Mainnet API module. The Netlify header additionally permits the legacy application's same-origin proxies, original price-feed host, inline styles and data-image compatibility; that broader compatibility policy does not loosen the Mainnet page's own CSP. No third-party JavaScript CDN is required in either mode.

Wallet discovery in the legacy app remains, but saved `xeris_connected` consent no longer starts a connection request. Only the existing explicit Connect action calls the provider. Preserving an existing Testnet flow does not establish a new wallet, contract or protocol security audit. The audited L1 source and running nodes were not changed.
