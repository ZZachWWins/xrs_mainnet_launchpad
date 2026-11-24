// Explicit containment of the recovered Testnet application. Financial paths
// remain unavailable until its wallet and settlement integration is replaced.
import { safeImageURL } from './images.mjs';
export async function legacyWalletUnavailable() {
  throw new Error('Testnet wallet and transaction actions are unavailable pending verification. Discovery remains available.');
}
export function legacyImageURL(value) {
  try { return safeImageURL(value); } catch { return null; }
}
export async function legacyRead(input, options = {}, timeoutMs = 5000, fetcher = globalThis.fetch) {
  const origin = globalThis.location?.origin || 'https://launchpad.xerisweb.com';
  const url = new URL(input, origin);
  const prefix = /^\/testnet\/(?:rpc|jsonrpc)(?=\/|$)/;
  if ((url.origin !== origin || !prefix.test(url.pathname)) && url.origin !== 'https://rpc.xerisweb.com') throw new Error('Unsupported Testnet read origin.');
  const route = url.origin === origin ? url.pathname.replace(prefix, '') || '/' : url.pathname;
  if ((options.method && options.method !== 'GET') || options.body || url.username || url.password || url.hash || url.search.length > 2048
    || !/^\/(?:launchpads|contracts|pools|blocks|contract\/[A-Za-z0-9_-]{1,128}|block\/[0-9]{1,20}|launchpad\/[A-Za-z0-9_-]{1,128}\/quote|token\/balance\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}|balance\/[A-Za-z0-9_-]{1,128})\/?$/.test(route)) throw new Error('Only bounded Testnet reads are available.');
  const controller = new AbortController(); let timer, reader, response;
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => {controller.abort(); reject(new Error('Testnet read timed out.'));}, Math.min(8000, Math.max(1, timeoutMs))); });
  try {
    response = await Promise.race([fetcher(url.href, {method:'GET',signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}}),deadline]);
    const maximum=2*1024*1024, length=response.headers.get('content-length');
    if(length!==null && (!/^\d+$/.test(length)||BigInt(length)>BigInt(maximum)))throw new Error('Testnet response is too large.');
    reader=response.body?.getReader();if(!reader)throw new Error('Missing Testnet data.');
    const chunks=[];let size=0;
    while(true){const chunk=await Promise.race([reader.read(),deadline]);if(chunk.done)break;size+=chunk.value.byteLength;if(size>maximum)throw new Error('Testnet response is too large.');chunks.push(chunk.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);JSON.parse(text);
    return new Response(text,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  } finally {clearTimeout(timer);try{void Promise.resolve(reader?reader.cancel():response?.body?.cancel()).catch(()=>{});}catch{}}
}
export async function legacyLaunchpads(response) {
  if(!response.ok)throw new Error('Testnet listings are unavailable.');
  const value=await response.json();
  if(!Array.isArray(value.launchpads)||value.launchpads.length>10000)throw new Error('Invalid Testnet listings.');
  const seen=new Set();
  for(const row of value.launchpads){
    if(!row||typeof row.contract_id!=='string'||!/^[A-Za-z0-9_-]{1,116}$/.test(row.contract_id)||seen.has(row.contract_id))throw new Error('Invalid Testnet token identity.');
    seen.add(row.contract_id);
    for(const [key,max] of [['name',256],['symbol',32],['description',4096]])if(row[key]!=null&&(typeof row[key]!=='string'||row[key].length>max||(key==='description'?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/:/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/).test(row[key])))throw new Error('Invalid Testnet metadata.');
    for(const key of ['market_cap_xrs_lamports','progress_pct','target_liquidity_xrs','xrs_collected','trade_count'])if(row[key]!=null&&(typeof row[key]!=='number'||!Number.isFinite(row[key])||row[key]<0))throw new Error('Invalid Testnet summary.');
  }
  return value.launchpads;
}
