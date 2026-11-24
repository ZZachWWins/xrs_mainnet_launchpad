import test from 'node:test';
import assert from 'node:assert/strict';
import { createLaunchpadAPI } from '../src/api.mjs';
import { CONFIG } from '../src/model.mjs';
const NOW = 1795496738705;
function feed() {
  return { schema_version: '2', chain_id: CONFIG.chainId, status: 'ready', observed_at_ms: String(NOW), expires_at_ms: String(NOW + 20000),
    as_of: { slot: '31613', block_hash: 'a'.repeat(64) }, coverage: { complete: true }, blocks: [{ slot: '31613', hash: 'a'.repeat(64), timestamp_ms: String(NOW - 1000) }],
    policy: { id: 'xeris-mainnet-circulation-v2', sha256: 'b'.repeat(64) }, market: { price_pool_id: CONFIG.poolId, quote_token_id: CONFIG.quoteToken,
      quote_decimals: '6', valuation_basis: 'circulating_supply', price_basis: 'pool_spot', price_quote_raw_numerator: '1000000', price_xrs_raw_denominator: '1000000000' }, launchpad_tokens: [] };
}
function setup(handler) {
  const calls = [];
  const api = createLaunchpadAPI({ now: () => NOW, fetcher: async (url, options) => {
    calls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store'); assert.ok(url.startsWith(CONFIG.rpc + '/'));
    if (handler) { const result = handler(url); if (result) return result; }
    return new Response(JSON.stringify(url.endsWith(CONFIG.checkpointSlot) ? { success: true, data: { slot: 27201, hash: CONFIG.checkpointHash } } : feed()));
  } });
  return { api, calls };
}
test('checkpoint identity must pass before any feed display and requests stay fixed-origin GET only', async () => {
  const { api, calls } = setup();
  await assert.rejects(api.getFeed(), error => error.code === 'NETWORK_UNVERIFIED'); assert.equal(calls.length, 0);
  await api.verifyNetwork(); assert.equal((await api.getFeed()).tokens.length, 0);
  assert.deepEqual(calls, [CONFIG.rpc + '/v2/block/slot/27201', CONFIG.rpc + '/market/supply']);
});
test('wrong checkpoint stops feed reads', async () => {
  const { api, calls } = setup(() => new Response(JSON.stringify({ success: true, data: { slot: 27201, hash: 'wrong' } })));
  await assert.rejects(api.verifyNetwork(), error => error.code === 'NETWORK_MISMATCH');
  await assert.rejects(api.getFeed(), error => error.code === 'NETWORK_UNVERIFIED'); assert.equal(calls.length, 1);
});
test('blocked routes, rate limits, network failures and malformed feeds never become an empty launch list', async () => {
  for (const code of [403, 404, 405, 429, 500]) {
    const { api } = setup(url => url.endsWith('/market/supply') ? new Response('{}', { status: code }) : null);
    await api.verifyNetwork(); await assert.rejects(api.getFeed());
  }
  const invalid = setup(url => url.endsWith('/market/supply') ? new Response('{}') : null);
  await invalid.api.verifyNetwork(); await assert.rejects(invalid.api.getFeed(), error => error.code === 'INVALID_DATA');
  const failed = setup(() => { throw new Error('untrusted transport details'); });
  await assert.rejects(failed.api.verifyNetwork(), error => error.code === 'NETWORK');
});
test('oversized response headers and streamed bodies are bounded', async () => {
  const largeHeader = setup(() => new Response('{}', { headers: { 'Content-Length': '65537' } }));
  await assert.rejects(largeHeader.api.verifyNetwork(), error => error.code === 'INVALID_DATA');
  const largeBody = setup(() => new Response('x'.repeat(65537)));
  await assert.rejects(largeBody.api.verifyNetwork(), error => error.code === 'INVALID_DATA');
});
test('listed coin metadata is fetched only after network/list checks and must match the known token', async () => {
  const owner='4p897nUzAxU9xbaQH69fa3S3hvtn9o1STiobHX4vnLoL';
  const listed=feed();listed.launchpad_tokens=[{token_id:'lp_coin',name:'Coin',symbol:'COIN',status:'unavailable',market_cap_quote_raw:null}];
  const {api,calls}=setup(url=>url.endsWith('/market/supply')?new Response(JSON.stringify(listed)):url.endsWith('/contract/coin')?new Response(JSON.stringify({success:true,contract:{contract_id:'coin',contract_type:'Launchpad',owner,state:{Launchpad:{token_id:'lp_coin',name:'Coin',symbol:'COIN',creator:owner,description:'Published text',image_url:'https://images.example.com/coin.png'}}}})):null);
  await assert.rejects(api.getProfile('lp_coin'),error=>error.code==='NETWORK_UNVERIFIED');
  await api.verifyNetwork();const result=await api.getProfile('lp_coin');assert.equal(result.metadata.creator,owner);assert.equal(result.metadata.name,'Coin');
  const before=calls.length;await assert.rejects(api.getProfile('lp_absent'),error=>error.code==='NOT_LISTED');assert.equal(calls.length,before);
  await assert.rejects(api.getProfile('../bad'),error=>error.code==='INVALID_TOKEN');assert.equal(calls.length,before);
});
test('blocked contract metadata stays unavailable without inventing creator, image or description', async()=>{
  const listed=feed();listed.launchpad_tokens=[{token_id:'lp_coin',name:'Coin',symbol:'COIN',status:'unavailable',market_cap_quote_raw:null}];
  const {api}=setup(url=>url.endsWith('/market/supply')?new Response(JSON.stringify(listed)):url.includes('/contract/')?new Response('{}',{status:404}):null);
  await api.verifyNetwork();const result=await api.getProfile('lp_coin');assert.equal(result.token.name,'Coin');assert.equal(result.metadata,null);assert.equal(result.metadataError,'UNAVAILABLE_ROUTE');
});

test('stalled fetch has a real deadline even when transport ignores abort', async()=>{
  let signal, calls=0;
  const api=createLaunchpadAPI({timeout:5,fetcher:(_url,options)=>{calls++;signal=options.signal;return new Promise(()=>{});}});
  await assert.rejects(api.verifyNetwork(),error=>error.code==='TIMEOUT');
  assert.equal(signal.aborted,true);assert.equal(calls,1);
  await assert.rejects(api.getFeed(),error=>error.code==='NETWORK_UNVERIFIED');
});

test('stalled body and cancellation finish at deadline and a later read recovers', async()=>{
  let stalled=true,cancelled=0,calls=0;
  const api=createLaunchpadAPI({timeout:5,fetcher:async()=>{
    calls++;
    if(stalled)return new Response(new ReadableStream({cancel(){cancelled++;return new Promise(()=>{});}}));
    return new Response(JSON.stringify({success:true,data:{slot:CONFIG.checkpointSlot,hash:CONFIG.checkpointHash}}));
  }});
  await assert.rejects(api.verifyNetwork(),error=>error.code==='TIMEOUT');assert.equal(cancelled,1);
  stalled=false;assert.equal(await api.verifyNetwork(),true);assert.equal(calls,2);
});

test('a cancellation promise cannot delay an otherwise complete valid response', async()=>{
  const bytes=new TextEncoder().encode(JSON.stringify({success:true,data:{slot:CONFIG.checkpointSlot,hash:CONFIG.checkpointHash}}));
  let reads=0,cancelled=0;
  const api=createLaunchpadAPI({timeout:5,fetcher:async()=>({ok:true,headers:new Headers(),body:{getReader:()=>({
    async read(){return reads++?{done:true}:{done:false,value:bytes};},cancel(){cancelled++;return new Promise(()=>{});},
  })}})});
  assert.equal(await api.verifyNetwork(),true);assert.equal(cancelled,1);
});

const defer=()=>{let resolve;const promise=new Promise(ok=>resolve=ok);return {promise,resolve};};
const json=value=>new Response(JSON.stringify(value));
const checkpoint=()=>json({success:true,data:{slot:CONFIG.checkpointSlot,hash:CONFIG.checkpointHash}});
const listed=()=>{const value=feed();value.launchpad_tokens=[{token_id:'lp_coin',name:'Coin',symbol:'COIN',status:'unavailable',market_cap_quote_raw:null}];return value;};
test('late older verification cannot override a newer checkpoint mismatch',async()=>{
  const first=defer();let calls=0;
  const api=createLaunchpadAPI({fetcher:async()=>++calls===1?first.promise:json({success:true,data:{slot:CONFIG.checkpointSlot,hash:'wrong'}})});
  const old=api.verifyNetwork();await assert.rejects(api.verifyNetwork(),e=>e.code==='NETWORK_MISMATCH');first.resolve(checkpoint());
  await assert.rejects(old,e=>e.code==='NETWORK_UNVERIFIED');await assert.rejects(api.getFeed(),e=>e.code==='NETWORK_UNVERIFIED');assert.equal(calls,2);
});
test('old feed cannot commit after re-verification fails',async()=>{
  const waiting=defer();let verification=0;
  const api=createLaunchpadAPI({now:()=>NOW,fetcher:async url=>url.endsWith('/market/supply')?waiting.promise:++verification===1?checkpoint():json({success:false})});
  await api.verifyNetwork();const old=api.getFeed();await assert.rejects(api.verifyNetwork());waiting.resolve(json(feed()));
  await assert.rejects(old,e=>e.code==='NETWORK_UNVERIFIED');await assert.rejects(api.getFeed(),e=>e.code==='NETWORK_UNVERIFIED');
});
test('one hundred simultaneous feed readers share one pending read without settled caching',async()=>{
  let reads=0;const waiting=defer();const api=createLaunchpadAPI({now:()=>NOW,fetcher:async url=>url.endsWith('/market/supply')?(reads++,waiting.promise):checkpoint()});
  await api.verifyNetwork();const pending=Array.from({length:100},()=>api.getFeed());assert.equal(reads,1);waiting.resolve(json(feed()));await Promise.all(pending);
  // A separate response is required for every later settled read.
  assert.equal(reads,1);
});
test('metadata finishing after feed expiry cannot become a current coin profile',async()=>{
  const waiting=defer();let clock=NOW;
  const api=createLaunchpadAPI({now:()=>clock,fetcher:async url=>url.includes('/contract/')?waiting.promise:url.endsWith('/market/supply')?json(listed()):checkpoint()});
  await api.verifyNetwork();await api.getFeed();const result=api.getProfile('lp_coin');clock+=20001;waiting.resolve(json({success:false}));
  await assert.rejects(result,e=>e.code==='FEED_EXPIRED');
});
test('cached metadata uses current feed valuation instead of its earlier token snapshot',async()=>{
  const owner='4p897nUzAxU9xbaQH69fa3S3hvtn9o1STiobHX4vnLoL';let value=listed(),metadataReads=0;
  const api=createLaunchpadAPI({now:()=>NOW,fetcher:async url=>url.includes('/contract/')?(metadataReads++,json({success:true,contract:{contract_id:'coin',contract_type:'Launchpad',owner,state:{Launchpad:{token_id:'lp_coin',name:'Coin',symbol:'COIN',creator:owner}}}})):url.endsWith('/market/supply')?json(value):checkpoint()});
  await api.verifyNetwork();assert.equal((await api.getProfile('lp_coin')).token.status,'unavailable');
  value=listed();Object.assign(value.launchpad_tokens[0],{status:'ready',decimals:'9',quote_decimals:'6',quote_token_id:'xeris_usdc',quote_symbol:'xUSDC',valuation_basis:'circulating_supply',circulating_raw:'1000000000',market_cap_quote_raw:'1000000',price_xrs_raw_numerator:'1000000000',price_token_raw_denominator:'1000000000',supply:{status:'available',basis:'unlocked_on_chain_v2',token_id:'lp_coin',decimals:9,circulating_raw:'1000000000',issued_supply_raw:'1000000000',components_raw:{wallets:'1000000000',company_wallets:'0',amm_inventory:'0'}}});
  await api.getFeed();const result=await api.getProfile('lp_coin');assert.equal(result.token.status,'ready');assert.equal(result.token.marketCapRaw,1000000n);assert.equal(result.metadata.valuation.status,'ready');assert.equal(metadataReads,1);
});
