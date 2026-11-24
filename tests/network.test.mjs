import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { DEFAULT_NETWORK, selectedNetwork, networkURL, mainnetLink } from '../src/network.mjs';
import { loadSelectedApplication } from '../src/startup.mjs';
import { patchLegacyBundle, legacyQuotesReady } from '../tools/prepare-legacy.mjs';
const ORIGIN='https://launchpad.example.com';
test('Testnet is the default; Mainnet requires an explicit unambiguous selection',()=>{
  assert.equal(DEFAULT_NETWORK,'testnet');
  assert.equal(selectedNetwork(ORIGIN),'testnet');assert.equal(selectedNetwork(ORIGIN+'/testnet/token/example'),'testnet');
  assert.equal(selectedNetwork(ORIGIN+'/?network=mainnet'),'mainnet');
  for(const query of ['?network=unknown','?network=','?network=mainnet&network=testnet','?network=mainnet&network=mainnet'])assert.throws(()=>selectedNetwork(ORIGIN+'/'+query));
  assert.throws(()=>selectedNetwork(ORIGIN+'/?network=unknown'),/Choose Testnet or Mainnet Beta\./);
});
test('network switches perform full-page isolation and Mainnet profile links retain explicit selection',()=>{
  assert.equal(networkURL(ORIGIN+'/?network=mainnet#preview/local','testnet'),ORIGIN+'/testnet/?network=testnet');
  assert.equal(networkURL(ORIGIN+'/testnet/token/example?network=testnet','mainnet'),ORIGIN+'/?network=mainnet#discover');
  assert.equal(networkURL(ORIGIN+'/token/example','testnet'),ORIGIN+'/testnet/token/example?network=testnet');
  assert.equal(mainnetLink('#coin/lp_example',ORIGIN+'/?network=mainnet#discover'),'/?network=mainnet#coin/lp_example');
  assert.equal(mainnetLink('#preview/local',ORIGIN),'/?network=mainnet#preview/local');
  assert.throws(()=>mainnetLink('#coin/../../wrong',ORIGIN));
});
test('default boot redirects without loading Mainnet code or asking for wallet permissions',async()=>{
  let loads=0,redirect;
  assert.equal(await loadSelectedApplication({href:ORIGIN,replace:value=>redirect=value,loadMainnet:async()=>loads++}),'testnet');
  assert.equal(loads,0);assert.equal(redirect,ORIGIN+'/testnet/?network=testnet');
  assert.equal(await loadSelectedApplication({href:ORIGIN+'/?network=mainnet',replace:()=>assert.fail('unexpected redirect'),loadMainnet:async()=>loads++}),'mainnet');
  assert.equal(loads,1);
});
test('legacy patches are exact and preserve explicit Connect while removing unsolicited reconnect',async()=>{
  const source=await readFile(new URL('../legacy-source/assets/index-8rysgo_r.js',import.meta.url),'utf8');
  const patched=patchLegacyBundle(source);
  assert.ok(patched.includes('basename:"/testnet"'));assert.ok(patched.includes('"/testnet/rpc"'));
  assert.equal(patched.includes('localStorage.getItem("xeris_connected")'),false);assert.equal(patched.includes('f&&c&&!t&&(d(!1),c.connect()'),false);
  assert.ok(patched.includes('const p=async()=>{if(!c)'));assert.ok(patched.includes('try{const y=await c.connect()'));
  assert.equal(patched.includes('mainnetrpc.xerisweb.com'),false);
  assert.ok(patched.includes('legacyQuotesReady(d)&&g.jsx("div",{className:"live-ticker-bar glass-panel"'));
  assert.ok(patched.includes('children:"Holder distribution unavailable"'));
  for(const fabricated of ['children:"4.2%"','children:"2.1%"','XRe...3ad','SECURITY_AUDIT'])assert.equal(patched.includes(fabricated),false);
  assert.ok(patched.includes('children:"PROTOCOL_DETAILS"'));
  assert.throws(()=>patchLegacyBundle(source.replace('function WR()','function changed()')));
});
test('legacy ticker is suppressed for absent, unloaded, zero-rounded or invalid quotes',()=>{
  const loaded={BTC:{price:'43,000.00'},ETH:{price:'2,000.00'},SOL:{price:'100.00'},XRS:null};
  assert.equal(legacyQuotesReady(loaded),true);
  for(const quotes of [undefined,null,{}, {BTC:{price:'0.00'},ETH:{price:'0.00'},SOL:{price:'0.00'},XRS:null},
    {...loaded,BTC:null},{...loaded,ETH:{price:'NaN'}},{...loaded,SOL:{price:'Infinity'}},{...loaded,XRS:{price:'0.0000'}}])assert.equal(legacyQuotesReady(quotes),false);
  assert.equal(legacyQuotesReady({...loaded,XRS:{price:'0.0123'}}),true);
});
test('legacy token history renders a truthful placeholder without chart effects or synthetic generation',async()=>{
  const source=await readFile(new URL('../legacy-source/assets/index-8rysgo_r.js',import.meta.url),'utf8');
  const patched=patchLegacyBundle(source);
  assert.equal(patched.includes('.addAreaSeries('),false);
  assert.equal(patched.includes('LR(Ci/1e9)'),false);
  assert.equal(patched.includes('LR=s=>'),false);
  assert.equal(patched.includes('Bt.findPoolForToken(s).then'),false);
  assert.equal(patched.includes('const Nt=await Bt.getTokenDexPrice(s);Nt!==null&&Ft'),false);
  const start=patched.indexOf('const DR='),end=patched.indexOf(',Ef="https://explorer.xeris.network/tx"',start);
  const jsx=(tag,props)=>({tag,...props});
  // Evaluate only the isolated pure component, never the archived application or wallet code.
  const render=Function('g',patched.slice(start,end)+';return DR;')({jsx,jsxs:jsx});
  const result=render();
  assert.equal(result.tag,'section');
  assert.equal(result.children[0].children,'Price history unavailable');
  assert.match(result.children[1].children,/Verified price history is not available/);
  assert.ok(patched.includes('g.jsx(DR,{})'));
  assert.throws(()=>patchLegacyBundle(source.replace('const DR=({data:s})=>{','const movedChart=({data:s})=>{')));
});
test('built legacy asset references resolve with exact case and use a separate full-page entry',async()=>{
  const html=await readFile(new URL('../dist/testnet/index.html',import.meta.url),'utf8');
  const css=await readFile(new URL('../dist/testnet/assets/index-nwb5pqii.css',import.meta.url),'utf8');
  const bundle=await readFile(new URL('../dist/testnet/assets/index-8rysgo_r.js',import.meta.url),'utf8');
  assert.ok(html.includes('/testnet/startup.mjs'));assert.equal(html.includes('<iframe'),false);
  assert.ok(html.includes('href="/?network=mainnet">Mainnet Beta</a>'));assert.equal(html.includes('>Mainnet</a>'),false);
  assert.equal(html.includes('mainnetrpc.xerisweb.com'),false);assert.ok(html.includes("connect-src 'self' https://rpc.xerisweb.com https://api.binance.com"));
  const references=[...html.matchAll(/(?:src|href)="(\/testnet\/[^"?]+)"/g),...css.matchAll(/url\((\/testnet\/[^)]+)\)/g),...bundle.matchAll(/src:"(\/testnet\/logos\/[^"?]+)"/g)].map(match=>match[1]);
  assert.ok(references.length>50);
  for(const reference of references)await access(new URL('../dist'+reference,import.meta.url));
  const netlify=await readFile(new URL('../netlify.toml',import.meta.url),'utf8');
  assert.ok(netlify.includes('from = "/testnet/rpc/*"'));assert.ok(netlify.includes('to = "https://rpc.xerisweb.com/:splat"'));
  assert.ok(netlify.includes('to = "/testnet/index.html"'));
});
test('Mainnet keeps strict image/script policy while the legacy compatibility policy remains separate',async()=>{
  const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.ok(html.includes("img-src 'self' https: blob:;"));assert.ok(html.includes("script-src 'self';"));
  assert.equal(html.includes("img-src 'self' https: blob: data:"),false);
  assert.ok(html.includes('href="/?network=mainnet#create"'));assert.ok(html.includes('alt="Xeris logo"'));
  assert.ok(html.includes('href="/?network=mainnet" aria-current="page">Mainnet Beta</a>'));assert.equal(html.includes('>Mainnet</a>'),false);
  assert.equal(html.includes('✳'),false);
  const app=await readFile(new URL('../src/app.mjs',import.meta.url),'utf8');assert.equal(app.includes('✳'),false);
});
