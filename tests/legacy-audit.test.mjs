import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {patchLegacyBundle} from '../tools/prepare-legacy.mjs';
import {legacyWalletUnavailable,legacyRead,legacyLaunchpads,legacyImageURL} from '../src/legacy-safety.mjs';
const source=await readFile(new URL('../legacy-source/assets/index-8rysgo_r.js',import.meta.url),'utf8');
const patched=patchLegacyBundle(source);
test('actual compiled wallet context cannot discover, connect or disconnect a provider',async()=>{
  const start=patched.indexOf('function gT('),end=patched.indexOf('function hd()',start);
  const factory=Function('g','Zb','legacyWalletUnavailable',patched.slice(start,end)+';return gT;')({jsx:(_tag,props)=>props},{Provider:'context'},legacyWalletUnavailable);
  const context=factory({children:null}).value;assert.equal(context.isConnected,false);assert.equal(context.walletProvider,undefined);
  await assert.rejects(context.connect(),/unavailable pending verification/);await context.disconnect();
  assert.equal(patched.includes('window.solana'),false);assert.equal(patched.includes('window.xeris'),false);assert.equal(patched.includes('localStorage.getItem("xeris_connected")'),false);
});
test('actual compiled raw submit and signed builder fail before provider or fetch can run',async()=>{
  let touched=0;const provider={signTransaction(){touched++;throw Error('unexpected');},connect(){touched++;throw Error('unexpected');}};
  const methods=['submitTransaction','submitXerisInstruction'].map(name=>{const match=patched.match(new RegExp('static async '+name+'\\(\\)\\{return legacyWalletUnavailable\\(\\)\\}'));assert.ok(match);return match[0];});
  const api=Function('legacyWalletUnavailable','return class{'+methods.join('')+'}')(legacyWalletUnavailable);
  await assert.rejects(api.submitTransaction('synthetic'),/unavailable/);await assert.rejects(api.submitXerisInstruction(provider,'owner',{}),/unavailable/);assert.equal(touched,0);
  assert.equal(patched.includes('signTransaction(d)'),false);assert.equal(patched.includes('fetch(`${Fe}/submit`'),false);
});
test('legacy read boundary rejects raw RPC writes and other origins before fetch',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error('unexpected');};
  for(const [url,options] of [['https://rpc.xerisweb.com/submit',{}],['https://rpc.xerisweb.com/launchpads',{method:'POST',body:'{}'}],['https://mainnetrpc.xerisweb.com/launchpads',{}],['https://evil.example/launchpads',{}],['https://rpc.xerisweb.com/contract/a/b',{}]])await assert.rejects(legacyRead(url,options,5,fetcher));
  assert.equal(calls,0);
});
test('legacy body deadline and size bounds cover reads after response headers',async()=>{
  let cancelled=0;
  await assert.rejects(legacyRead('https://rpc.xerisweb.com/launchpads',{},5,async()=>new Response(new ReadableStream({cancel(){cancelled++;return new Promise(()=>{});}}))),/timed out/);
  assert.equal(cancelled,1);
  await assert.rejects(legacyRead('https://rpc.xerisweb.com/launchpads',{},5,async()=>new Response('{}',{headers:{'content-length':'2097153'}})),/too large/);
});
test('legacy listing transport failure and invalid identity never masquerade as empty success',async()=>{
  await assert.rejects(legacyLaunchpads(new Response('{}',{status:503})),/unavailable/);
  for(const rows of [[{contract_id:'../other'}],[{contract_id:'same'},{contract_id:'same'}],[{contract_id:'coin',name:{html:'bad'}}],[{contract_id:'coin',symbol:'bad\u202e'}]])await assert.rejects(legacyLaunchpads(new Response(JSON.stringify({launchpads:rows}))));
  assert.deepEqual(await legacyLaunchpads(new Response('{"launchpads":[]}')),[]);
  assert.equal((await legacyLaunchpads(new Response(JSON.stringify({launchpads:[{contract_id:'coin',description:'Multiline\ntext'}]}))))[0].description,'Multiline\ntext');
});
test('legacy images reject dangerous schemes, private literal targets and credentials',()=>{
  for(const input of ['javascript:alert(1)','data:image/svg+xml,bad','https://127.0.0.1/a.png','https://user:pass@example.com/a.png'])assert.equal(legacyImageURL(input),null);
  assert.equal(legacyImageURL('https://images.example.com/a.png'),'https://images.example.com/a.png');
});
test('legacy false lifetime fee, fabricated activity and circulating-market-cap claims are removed',()=>{
  for(const text of ['0.777% protocol fee route directly to deployer','"~0.02 XRS"','tokens:"INITIAL"','user:"Creator",xrs','children:"MCAP"','Creators earn 1% of every trade on their token.','Liquidity is burned automatically. Creators cannot remove funds.','Deploy unruggable assets','children:"Total per trade"'])assert.equal(patched.includes(text),false);
  assert.ok(patched.includes('children:"CURVE ESTIMATE"'));assert.ok(patched.includes('wN=["NEWEST","PROGRESS","TRADE_COUNT","CURVE_ESTIMATE"]'));assert.ok(patched.includes('Testnet listings unavailable. Please refresh to retry.'));
  assert.ok(patched.includes('Vx=()=>({prices:{},loading:false,error:null})'));
});
test('compiled listing summary counters distinguish loading, unavailable and verified zero',()=>{
  const start=patched.indexOf('SN=()=>{'),end=patched.indexOf('placeholder:"SEARCH_MARKET_TICKER..."',start);
  const fields=[...patched.slice(start,end).matchAll(/className:"stat-value",children:([^}]+)\}/g)].map(match=>Function('u','legacyListError','p','x','y','return ('+match[1]+');'));
  assert.equal(fields.length,3,'exercise all three actual rendered summary expressions');
  for(const render of fields){
    assert.equal(render(true,false,0,0,'0'),'Loading…');
    assert.equal(render(false,true,0,0,'0'),'Unavailable');
  }
  const text=value=>Array.isArray(value)?value.join(''):value;
  assert.deepEqual(fields.map(render=>text(render(false,false,0,0,'0'))),['0 XRS','0','0']);
  assert.deepEqual(fields.map(render=>text(render(false,false,23,12,'635,870'))),['635,870 XRS','23','12']);
});
test('activity sidebar cannot invent buy direction or trader identity from listing changes',()=>{
  for(const inferred of ['function GR(s,t){','GR(c,i.current)','type:"buy",user:l.creator?','msg:`INITIALIZED ${','children:"LIVE PULSE"'])assert.equal(patched.includes(inferred),false);
  const start=patched.indexOf('const $R='),end=patched.indexOf(';class QR extends T.Component',start);
  assert.ok(start>=0&&end>start);
  const jsx=(tag,props)=>({tag,...props});
  // Render only the isolated pure replacement. No hooks, read API, or timers
  // are provided, so restoring any polling effect makes this regression fail.
  const render=Function('g',patched.slice(start,end)+';return $R;')({jsx,jsxs:jsx});
  const sidebar=render();assert.equal(sidebar.tag,'aside');
  assert.equal(sidebar.children[0].children.children,'Activity history');
  assert.equal(sidebar.children[1].children,'Verified activity history unavailable in this Testnet view.');
  assert.equal(sidebar.children[1].role,'status');
  assert.ok(patched.includes('class QR extends T.Component'),'legacy error boundary is preserved');
});
test('compiled detail effect discards a late response after route cleanup',async()=>{
  const start=patched.indexOf('T.useEffect(()=>{if(!s)return;let alive=true,pending=false;'),end=patched.indexOf('},[s]),',start);
  const callback=patched.slice(start+'T.useEffect('.length,end+1);
  let resolve,commits=0;const waiting=new Promise(ok=>resolve=ok);
  const effect=Function('s','Bt','f','p','y','lt','setInterval','clearInterval','return ('+callback+');')('coin',{getLaunchpad:()=>waiting},()=>commits++,()=>{},()=>{},()=>{},()=>1,()=>{});
  const dispose=effect();assert.equal(commits,1);dispose();resolve({contract_id:'coin',contract_type:'Launchpad',state:{Launchpad:{}}});await Promise.resolve();await Promise.resolve();assert.equal(commits,1);
});
