import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function writeChanged(path, bytes) {
  try { if (Buffer.from(bytes).equals(await readFile(path))) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(path, bytes);
}
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Legacy source patch no longer matches: ' + before.slice(0, 50));
  return source.replace(before, after);
}
export function legacyQuotesReady(quotes) {
  const available = quote => typeof quote?.price === 'string' && quote.price.length <= 64
    && /^[0-9,.\u00a0\u202f ]+$/.test(quote.price)
    && Number.isFinite(Number(quote.price.replace(/[,\u00a0\u202f ]/g, '')))
    && Number(quote.price.replace(/[,\u00a0\u202f ]/g, '')) > 0;
  return ['BTC', 'ETH', 'SOL'].every(symbol => available(quotes?.[symbol]))
    && (quotes?.XRS == null || available(quotes.XRS));
}
export function patchLegacyBundle(source) {
  source = once(source, 'function WR(){return g.jsx(tE,{children:', 'function WR(){return g.jsx(tE,{basename:"/testnet",children:');
  source = once(source, '?"/rpc":"https://rpc.xerisweb.com",Cy=Fe', '?"/testnet/rpc":"https://rpc.xerisweb.com",Cy=Fe');
  source = once(source, 'localStorage.getItem("xeris_connected")==="1"&&d(!0)', 'void 0');
  source = once(source, 'T.useEffect(()=>{f&&c&&!t&&(d(!1),c.connect().then(y=>{var S;const x=typeof y=="string"?y:(S=y.publicKey)==null?void 0:S.toString();x&&(l(x),i(!0))}).catch(()=>{}))},[f,c,t]);', 'T.useEffect(()=>{},[f,c,t]);');
  source = once(source, 'href:"/create"', 'href:"/testnet/create?network=testnet"');
  source = once(source, 'href:"/features"', 'href:"/testnet/features?network=testnet"');
  source = once(source, 'const bN=', legacyQuotesReady.toString() + ';const bN=');
  source = once(source, 'g.jsx("div",{className:"live-ticker-bar glass-panel"', 'legacyQuotesReady(d)&&g.jsx("div",{className:"live-ticker-bar glass-panel"');
  // The archived chart API is incompatible and its initial curve was random.
  // Keep the token page usable without initializing a chart or inventing history.
  const chartStart = source.indexOf('const DR=({data:s})=>{');
  const chartEnd = source.indexOf('},Ef="https://explorer.xeris.network/tx"', chartStart);
  if (chartStart < 0 || chartEnd < chartStart || source.split('const DR=({data:s})=>{').length !== 2
    || !source.slice(chartStart, chartEnd).includes('.addAreaSeries(')) throw new Error('Legacy chart boundary no longer matches.');
  source = source.slice(0, chartStart) + 'const DR=()=>g.jsxs("section",{className:"legacy-history-unavailable",children:[g.jsx("h3",{children:"Price history unavailable"}),g.jsx("p",{children:"Verified price history is not available for this token."})]})' + source.slice(chartEnd + 1);
  source = once(source, 'LR=s=>{let t=10;const i=Math.floor(Date.now()/1e3),a=[];for(let l=60;l>0;l--)t=t+(Math.random()-.4)*2,a.push({time:i-l*60,value:Math.max(t,1)});return a.push({time:i,value:s>0?s:Math.max(t,1)}),a},OR=', 'OR=');
  source = once(source, 'ue.finalized||Ft(Me=>{if(Me.length===0)return LR(Ci/1e9);const Ln={time:Math.floor(Date.now()/1e3),value:Ci/1e9};return Me[Me.length-1].time<Ln.time?[...Me,Ln]:Me}),', '');
  source = once(source, 'T.useEffect(()=>{if(!s||!ke)return;let J=!1;return Bt.findPoolForToken(s).then(async St=>{if(J||!St)return;const Nt=await Bt.fetchPriceHistory(St.pool_id,200);if(J||!Nt.length)return;const Oe=Nt.map(ue=>({time:Math.floor((ue.timestamp_ms??ue.timestamp??0)/1e3),value:ue.price??0})).filter(ue=>ue.time>0&&ue.value>0);Oe.length>0&&Ft(Oe)}),()=>{J=!0}},[s,ke]),T.useEffect(()=>{if(!s||!ke)return;const J=async()=>{const Nt=await Bt.getTokenDexPrice(s);Nt!==null&&Ft(Oe=>{const ue={time:Math.floor(Date.now()/1e3),value:Nt};return Oe.length===0?[ue]:Oe[Oe.length-1].time<ue.time?[...Oe,ue]:Oe})};J();const St=setInterval(J,1e4);return()=>clearInterval(St)},[s,ke]),', '');
  source = once(source, 'Ut.length>0?g.jsx("div",{style:{marginBottom:"1.5rem"},children:g.jsx(DR,{data:Ut})}):g.jsx("div",{className:"chart-placeholder",style:{height:"40px"}})', 'g.jsx(DR,{})');
  source = once(source, 'g.jsxs("div",{className:"holder-distribution",children:[g.jsx("h4",{children:"Holder Distribution"}),g.jsxs("div",{className:"holder-list",children:[g.jsxs("div",{className:"holder-row",children:[g.jsx("span",{children:"Creator"}),g.jsx("span",{children:"4.2%"})]}),g.jsxs("div",{className:"holder-row",children:[g.jsx("span",{children:"XRe...3ad"}),g.jsx("span",{children:"2.1%"})]})]})]})', 'g.jsxs("div",{className:"holder-distribution",children:[g.jsx("h4",{children:"Holder Distribution"}),g.jsx("p",{children:"Holder distribution unavailable"})]})');
  source = once(source, 'children:"SECURITY_AUDIT"', 'children:"PROTOCOL_DETAILS"');
  // Preserve the archive, but make every wallet entry point unavailable in
  // this build. The old flow lacks wallet-network binding and receipt recovery.
  const walletStart=source.indexOf('function gT({children:s}){'),walletEnd=source.indexOf('function hd()',walletStart);
  if(walletStart<0||walletEnd<walletStart||!source.slice(walletStart,walletEnd).includes('window.xeris||window.solana'))throw new Error('Legacy wallet boundary changed.');
  source=source.slice(0,walletStart)+'function gT({children:s}){return g.jsx(Zb.Provider,{value:{isConnected:false,address:void 0,walletProvider:void 0,connect:legacyWalletUnavailable,disconnect:async()=>{}},children:s})}'+source.slice(walletEnd);
  source=once(source,'static async submitXerisInstruction(t,i,a){const l=Bx(i),c=await this.getRecentBlockhash(),u=gN(c),f=cN(l,a,u),d=uN(f),p=await t.signTransaction(d),v=fN(p,f);return await this.submitTransaction(v)}','static async submitXerisInstruction(){return legacyWalletUnavailable()}');
  source=once(source,'static async submitTransaction(t){const a=await(await fetch(`${Fe}/submit`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tx_base64:t})})).json();if(a.error)throw new Error(`Node rejected tx: ${a.error}`);return a.status==="ok"||a.status==="queued"?a.signature||"success":JSON.stringify(a)}','static async submitTransaction(){return legacyWalletUnavailable()}');
  source=once(source,'"Connect Wallet"','"Wallet actions unavailable"');
  source=once(source,'Perpetual volume-based revenue stream. 0.777% protocol fee route directly to deployer wallet address.','During curve trading, 1% accrues to the creator and 0.77% goes to protocol treasury. Creator fees do not continue on graduated AMM trades.');
  source=once(source,'"~0.02 XRS"','"Base fee + retained metadata"');
  source=once(source,'Creators earn 1% of every trade on their token.','Creators earn 1% during bonding-curve trading. This creator fee ends at graduation.');
  source=once(source,'children:"Total per trade"','children:"Total per curve trade"');
  source=once(source,'children:"Unruggable"','children:"Liquidity graduation"');
  source=once(source,'Deploy unruggable assets on the Xeris Protocol. Engineered for fair distribution and deterministic liquidity.','Explore token launches recorded on Xeris Testnet. Review historical curve summaries and token details.');
  source=once(source,'Liquidity is burned automatically. Creators cannot remove funds.','Graduation creates a pool using reserved tokens and collected XRS. Review its on-chain state.');
  source=once(source,'wN=["NEWEST","PROGRESS","VOLUME","MARKET_CAP"]','wN=["NEWEST","PROGRESS","TRADE_COUNT","CURVE_ESTIMATE"]');
  source=once(source,'case"VOLUME":','case"TRADE_COUNT":');
  source=once(source,'case"MARKET_CAP":','case"CURVE_ESTIMATE":');
  source=once(source,'onClick:u,className:"connect-btn",children:','onClick:u,disabled:true,"aria-label":"Testnet wallet actions unavailable pending verification",className:"connect-btn",children:');
  source=once(source,'placeholder:"SEARCH_MARKET_TICKER...",value:s','placeholder:"SEARCH_MARKET_TICKER...","aria-label":"Search Testnet token name or ticker",value:s');

  source=once(source,'children:"MCAP"','children:"CURVE ESTIMATE"');
  source=once(source,'children:p.toLocaleString()','children:u?"Loading…":legacyListError?"Unavailable":p.toLocaleString()');
  source=once(source,'children:x.toLocaleString()','children:u?"Loading…":legacyListError?"Unavailable":x.toLocaleString()');
  source=once(source,'children:[y," XRS"]','children:u?"Loading…":legacyListError?"Unavailable":[y," XRS"]');
  // These external quotes have no reliable freshness/provenance binding. Do
  // not display an old successful result forever after a provider failure.
  const quotesStart=source.indexOf('Vx=()=>{'),quotesEnd=source.indexOf(',Ux=1e9',quotesStart);
  if(quotesStart<0||quotesEnd<quotesStart||!source.slice(quotesStart,quotesEnd).includes('api.binance.com'))throw new Error('Legacy quote boundary changed.');
  source=source.slice(0,quotesStart)+'Vx=()=>({prices:{},loading:false,error:null})'+source.slice(quotesEnd);
  source=once(source,'s.image_url?g.jsx("img",{src:s.image_url,alt:s.symbol','legacyImageURL(s.image_url)?g.jsx("img",{src:legacyImageURL(s.image_url),referrerPolicy:"no-referrer",alt:s.symbol');
  source=once(source,'style:{display:s.image_url?"none":"block"}','style:{display:legacyImageURL(s.image_url)?"none":"block"}');
  const readStart=source.indexOf('static async fetchWithTimeout('),readEnd=source.indexOf('static async getRecentBlockhash()',readStart);
  if(readStart<0||readEnd<readStart)throw new Error('Legacy read boundary changed.');
  source=source.slice(0,readStart)+'static async fetchWithTimeout(t,i={},a=5e3){return legacyRead(t,i,a)}'+source.slice(readEnd);
  source=once(source,'static async getLaunchpads(){try{const t=await this.fetchWithTimeout(`${Fe}/launchpads`);if(t.ok)return(await t.json()).launchpads??[]}catch{console.warn("Network or RPC error during launchpads fetch")}return[]}','static async getLaunchpads(){return legacyLaunchpads(await this.fetchWithTimeout(`${Fe}/launchpads`))}');
  source=once(source,'SN=()=>{const[s,t]','SN=()=>{const[legacyListError,setLegacyListError]=T.useState(false);const[s,t]');
  source=once(source,'T.useEffect(()=>{const E=async()=>{f(!0);const N=await Bt.getLaunchpads();c(N),f(!1)};E();const M=setInterval(E,3e4);return()=>clearInterval(M)},[])','T.useEffect(()=>{let alive=true,pending=false;const E=async()=>{if(pending)return;pending=true;f(true);try{const N=await Bt.getLaunchpads();if(alive){c(N);setLegacyListError(false)}}catch{if(alive){c([]);setLegacyListError(true)}}finally{pending=false;if(alive)f(false)}};E();const M=setInterval(E,3e4);return()=>{alive=false;clearInterval(M)}},[])');
  source=once(source,'children:"NO TOKENS FOUND."','children:legacyListError?"Testnet listings unavailable. Please refresh to retry.":"NO TOKENS FOUND."');
  source=once(source,'(I.current===0||Ea>I.current)&&Bt.getTradeHistory(s).then(Me=>{Me&&Me.length>0?lt(Me):I.current===0&&Ea>0&&lt([{id:1,type:"buy",user:"Creator",xrs:(Ci/1e9).toFixed(2),tokens:"INITIAL",time:"Launched"}])}),','');
  const detailStart=source.indexOf('T.useEffect(()=>{if(!s)return;const J=()=>{Bt.getLaunchpad(s).then'),detailEnd=source.indexOf('},[s]),',detailStart);
  if(detailStart<0||detailEnd<detailStart)throw new Error('Legacy detail effect boundary changed.');
  source=source.slice(0,detailStart)+'T.useEffect(()=>{if(!s)return;let alive=true,pending=false;f(null);p(true);y(false);lt([]);const J=async()=>{if(pending)return;pending=true;try{const Nt=await Bt.getLaunchpad(s);if(!alive)return;if(Nt&&Nt.contract_id===s&&Nt.contract_type==="Launchpad"&&Nt.state?.Launchpad){f(Nt);p(false);y(false)}else{f(null);p(false);y(true)}}catch{if(alive){f(null);p(false);y(true)}}finally{pending=false}};J();const St=setInterval(J,5000);return()=>{alive=false;clearInterval(St)}},[s]),'+source.slice(detailEnd+'},[s]),'.length);
  if(source.split('children:"Waiting for activity..."').length!==3)throw new Error('Legacy activity placeholder count changed.');
  source=source.replaceAll('children:"Waiting for activity..."','children:"Verified activity history unavailable in this Testnet view."');
  // Listing-count changes do not prove a buy, its trader, or a transaction.
  // Remove both the inferred-event generator and its polling/render effects.
  const pulseStart=source.indexOf('let Mr=0;function GR(s,t){'),pulseEnd=source.indexOf('class QR extends T.Component',pulseStart);
  const pulse=source.slice(pulseStart,pulseEnd);
  const pulseStyle=pulse.match(/g\.jsx\("style",\{children:(`[\s\S]*`)\}\)\]\}\)\};$/)?.[1];
  if(pulseStart<0||pulseEnd<pulseStart||!pulse.includes('u>0&&i.push({id:++Mr,type:"buy",user:l.creator?')||!pulseStyle)throw new Error('Legacy activity sidebar boundary changed.');
  source=source.slice(0,pulseStart)+'const $R=()=>g.jsxs("aside",{className:"pulse-sidebar",children:[g.jsx("div",{className:"pulse-header",children:g.jsx("span",{children:"Activity history"})}),g.jsx("p",{className:"pulse-empty",role:"status",children:"Verified activity history unavailable in this Testnet view."}),g.jsx("style",{children:'+pulseStyle+'})]});'+source.slice(pulseEnd);
  source='import {legacyWalletUnavailable,legacyRead,legacyLaunchpads,legacyImageURL} from "/legacy-safety.mjs";\n'+source;
  return source;
}
export async function prepareLegacy(projectURL, outputURL) {
  const sourceURL = new URL('./legacy-source/', projectURL), manifest = JSON.parse(await readFile(new URL('source-provenance.json', sourceURL), 'utf8'));
  if (manifest.files.length !== 76) throw new Error('Unexpected public legacy export allowlist.');
  const paths = new Map(manifest.files.map(file => [file.path.toLowerCase(), file.path]));
  function asset(reference) {
    const clean = reference.replace(/^\//, ''), actual = paths.get(clean.toLowerCase());
    if (!actual || !/^(assets\/|logos\/|logodark\.png$|vite\.svg$)/.test(actual)) throw new Error('Unknown legacy asset: ' + reference);
    return '/testnet/' + actual;
  }
  const outputRecords = [];
  for (const record of manifest.files) {
    if (!/^[A-Za-z0-9_.\/-]+$/.test(record.path) || record.path.split('/').includes('..')) throw new Error('Unsafe legacy export path.');
    const raw = await readFile(new URL(record.path, sourceURL));
    if (raw.length !== record.bytes || digest(raw) !== record.sha256) throw new Error('Legacy source integrity mismatch: ' + record.path);
    if (record.path === 'netlify.toml') continue; // Its old root redirects are not application assets.
    let bytes = raw;
    if (record.path.endsWith('.js')) {
      let text = patchLegacyBundle(raw.toString('utf8'));
      text = text.replace(/(["'])(\/(?:assets|logos)\/[^"'\s]+)\1/g, (_all, quote, path) => quote + asset(path) + quote);
      bytes = Buffer.from(text);
    } else if (record.path.endsWith('.css')) {
      bytes = Buffer.from(raw.toString('utf8').replace(/url\((\/?(?:assets|logos)\/[^)]+)\)/g, (_all, path) => 'url(' + asset(path) + ')'));
    } else if (record.path === 'index.html') {
      let text = raw.toString('utf8');
      text = text.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; connect-src \'self\' https://rpc.xerisweb.com https://api.binance.com; img-src \'self\' data: https: blob:; style-src \'self\' \'unsafe-inline\'; font-src \'self\' data:; object-src \'none\'; base-uri \'none\'; frame-src \'none\'">');
      text = text.replace(/<style>html,body,#root\{background-color:#010414\}<\/style>/, '');
      text = text.replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, '<script type="module" src="/testnet/startup.mjs"></script>');
      text = text.replace(/(href=")([^"\s]+)(")/g, (_all, before, path, after) => before + asset(path) + after);
      text = text.replace('<title>Xeris Launchpad</title>', '<title>Xeris Testnet Launchpad</title><link rel="stylesheet" href="/network.css">');
      text = once(text, '<body>', '<body class="legacy-testnet">');
      text = text.replace('<div id="root"></div>', '<header class="legacy-network-bar"><div><strong>Testnet · Read only</strong><span class="legacy-network-description">Wallet actions unavailable. Historical curve estimates, not circulating market caps.</span><span class="security-audit" aria-label="Security audit status"><strong>SECURITY AUDITED</strong><span>Built on the CertiK-audited Xeris L1 core.</span></span></div><nav class="launchpad-network-selector" aria-label="Select network"><a href="/testnet/?network=testnet" aria-current="page">Testnet</a><a href="/?network=mainnet">Mainnet Beta</a></nav></header><section id="testnet-startup-loader" class="legacy-startup-loader" role="status" aria-live="polite"><span class="loading-ring" aria-hidden="true"></span><h1>Loading Testnet launchpad…</h1><p>Preparing the read-only Testnet experience.</p></section><div id="root" hidden></div>');
      bytes = Buffer.from(text);
    }
    const destination = new URL('./testnet/' + record.path, outputURL);
    await mkdir(new URL('./', destination), { recursive: true }); await writeChanged(destination, bytes);
    outputRecords.push({ path: 'testnet/' + record.path, sha256: digest(bytes) });
  }
  await writeChanged(new URL('./testnet/startup.mjs', outputURL), await readFile(new URL('./src/testnet-startup.mjs', projectURL)));
  await writeChanged(new URL('./legacy-patches.json', projectURL), JSON.stringify({ source_archive: manifest.source_archive, source_sha256: manifest.sha256,
    patches: ['BrowserRouter /testnet basename', 'fixed isolated Testnet RPC proxy', 'no saved-consent auto-connect', 'prefixed raw navigation links', 'allowlisted case-correct asset paths', 'network selector and named startup/retry', 'hide unavailable quote ticker instead of showing zero prices', 'replace incompatible synthetic chart with unavailable history', 'keep network selector above legacy fixed navigation', 'replace fabricated holder rows with unavailable state', 'label static protocol details without implying an audit', 'disable legacy wallet context/signing/raw submission pending verified integration', 'bounded read-only transport without settled-response cache', 'validate listing identity and metadata; distinguish unavailable listings', 'correct creator/protocol fee and legacy curve estimate labels', 'remove invented creator activity and stale detail commits', 'safe public image URLs; suppress external quotes without freshness proof', 'replace listing-derived pseudo transaction events with explicit activity unavailable state'], files: outputRecords }, null, 2) + '\n');
}
