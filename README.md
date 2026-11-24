# Xeris Mainnet Launchpad — Beta foundation

A dependency-free static frontend for read-only mainnet discovery and a local token preview. Repository: `ZZachWWins/xrs_mainnet_launchpad`. Deploy the repository through Netlify using the included build configuration.

## Build, test and preview

Use Node 22 or later. The project has no npm dependencies and does not need `npm install`.

```sh
npm run build
npm test
python3 -m http.server 8771 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:8771`. Only start one preview server on that port. Existing explorer and DEX previews use other ports.

On this Mac, the available Node executable is `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node`; it can run `build.mjs` and `--test tests/*.test.mjs` directly when Node is not on `PATH`.

For Netlify, `netlify.toml` builds the local source and publishes `dist`. Hash navigation works without rewrite rules. Static fonts and the Xeris logo are included locally; no CDN scripts, runtime packages or private configuration are needed.

## Supported behavior

- Mainnet identity check against slot `27201` and hash `0a401c139eef73f049010450d4aa13ef38636799784d01bbc0ecdb9c71facaf3` at `https://mainnetrpc.xerisweb.com`.
- Bounded, read-only `GET /market/supply` discovery. Complete, fresh schema-v2 data is required. A verified empty token list is different from missing, stale, malformed or blocked data.
- Token name/symbol search, valuation-available filtering, exact integer supply and xUSDC valuation checks. Unavailable valuations are not replaced with zero or example numbers.
- Local token preview with UTF-8 metadata limits, u64 amounts, supply reservations, and the mapped creation-fee estimate. The form creates no transaction and persists no user input.
- Explorer-style initial/retry loading ring, named feed and preview loading messages, background refresh indication, reduced-motion support and error/retry recovery, including failed module imports.

## Disabled behavior and limits

There are no wallet integrations, signing calls, writes, token deployments, curve buys/sells, graduations, reward claims or funded operations. Token-contract ID availability and wallet balances are not checked by the local preview. New-launch vesting is disabled in the mapped protocol.

The mainnet DEX link defaults to disabled (`CONFIG.dexUrl = null` in `src/model.mjs`). Set it only after confirming that the destination serves the reviewed mainnet DEX; an existing hostname must not be assumed to do so.

Curve fees are 1% creator plus 0.77% protocol. Graduated generic pools charge 0.3% LP fees; the interface makes no lifetime creator-fee claim. It does not use legacy list counters as true sold inventory, spot pricing or circulating market cap.

The launchpad summary route was unavailable during the initial read probe. This frontend does not enable or bypass blocked routes. A fixed checkpoint and a validated public feed are not an endorsement of a token, a proof of independent full-node validation, or a security audit.

## Source layout and assets

`src/index.html` and `src/launchpad.css` define the responsive UI. `startup.mjs` handles boot recovery; `app.mjs` manages view and loading states; `api.mjs` restricts network reads; `model.mjs` validates public data and local previews. `build.mjs` copies these files and the explicit `public/assets` allowlist into `dist`. Tests use synthetic public fixtures and mock HTTP only.

The Xeris logo, Inter and Plus Jakarta Sans fonts were copied from the provided public DEX assets. Font OFL licenses are included under `public/assets/licenses` and `dist/assets/licenses`. No keys, keystores, wallet data, server configuration or credential material is included.
