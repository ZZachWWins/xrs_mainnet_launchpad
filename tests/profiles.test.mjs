import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { coinRoute, parseProfileRoute, createDraftStore, parseCoinProfile } from '../src/profiles.mjs';
import { previewToken } from '../src/model.mjs';
const OWNER='4p897nUzAxU9xbaQH69fa3S3hvtn9o1STiobHX4vnLoL';
const TOKEN={id:'lp_public-coin',name:'Public coin',symbol:'COIN',status:'unavailable',circulatingRaw:null,marketCapRaw:null};
function detail() { return {success:true,contract:{contract_id:'public-coin',contract_type:'Launchpad',owner:OWNER,state:{Launchpad:{token_id:TOKEN.id,name:TOKEN.name,symbol:TOKEN.symbol,
  creator:OWNER,description:'Published description',image_url:'https://images.example.com/coin.png',total_supply:'1000000000000',sale_supply:'800000000000',dex_liquidity_supply:'200000000000',tokens_remaining:'700000000000',
  target_liquidity_xrs:'10000000000000',xrs_collected:'1000000000',creator_reward_bps:'100',finalized:false}}}}; }
test('coin routes bind exact token identifiers; local drafts have a separate explicit undeployed route',()=>{
  assert.equal(coinRoute(TOKEN.id),'#coin/lp_public-coin');assert.deepEqual(parseProfileRoute('#coin/lp_public-coin'),{kind:'coin',tokenId:TOKEN.id});
  assert.deepEqual(parseProfileRoute('#preview/local'),{kind:'draft'});assert.equal(parseProfileRoute('#create'),null);
  for(const value of ['#coin/../../bad','#coin/lp_%3Cscript%3E','#coin/https://evil.com','#preview/other'])assert.equal(parseProfileRoute(value).kind,'invalid');
  assert.throws(()=>coinRoute('javascript:alert(1)'));
});
test('a local draft owns only its snapshot/photo URL and releases replaced drafts without persistence',()=>{
  const preview=previewToken({name:'Local idea',ticker:'IDEA',contractId:'local-idea',description:'Local text',imageUrl:'',totalSupply:'1000',targetXrs:'10000',liquidityPercent:'20'});
  let forks=0,releases=0;const photo={fork(){forks++;return{url:'blob:local',release(){releases++;}}}};
  const store=createDraftStore();assert.equal(store.get(),null);const draft=store.set(preview,photo);
  assert.equal(draft.kind,'draft');assert.equal(draft.href,'#preview/local');assert.equal(draft.preview.name,'Local idea');assert.equal(forks,1);
  store.set(preview);assert.equal(releases,1);store.clear();assert.equal(store.get(),null);
});
test('mainnet profiles use matching contract identity, creator and exact economics only',()=>{
  const result=parseCoinProfile(detail(),TOKEN);assert.equal(result.creator,OWNER);assert.equal(result.imageURL,'https://images.example.com/coin.png');
  assert.equal(result.economics.liquidityRaw,200000000000n);assert.equal(result.description,'Published description');
  for(const change of [value=>value.contract.contract_id='other',value=>value.contract.state.Launchpad.token_id='lp_other',value=>value.contract.contract_type='Swap',value=>value.contract.state.Launchpad.name='Other coin']){
    const value=detail();change(value);assert.throws(()=>parseCoinProfile(value,TOKEN));
  }
});
test('missing creator, unsafe image, absent description and inconsistent economics stay unavailable',()=>{
  const value=detail();value.contract.owner='not-an-address';delete value.contract.state.Launchpad.description;
  value.contract.state.Launchpad.image_url='javascript:alert(1)';value.contract.state.Launchpad.sale_supply='1';
  const result=parseCoinProfile(value,TOKEN);assert.equal(result.creator,null);assert.equal(result.description,null);assert.equal(result.imageURL,null);assert.equal(result.economics,null);
  const injected=detail();injected.contract.state.Launchpad.description='<script>not markup</script>';assert.equal(parseCoinProfile(injected,TOKEN).description,'<script>not markup</script>');
});
test('profile rendering has inactive livestream, no HTML interpolation, no upload or camera/microphone APIs',async()=>{
  const app=await readFile(new URL('../src/app.mjs',import.meta.url),'utf8');const html=await readFile(new URL('../src/index.html',import.meta.url),'utf8');
  assert.ok(app.includes("element('h2', 'Livestream')"));assert.ok(app.includes("element('p', 'Coming soon'"));assert.equal(app.includes('innerHTML'),false);
  for(const method of ['getUserMedia','MediaRecorder','requestFullscreen','multipart/form-data'])assert.equal(app.includes(method),false);
  assert.ok(html.includes('accept="image/png,image/jpeg,image/webp"'));assert.ok(html.includes("img-src 'self' https: blob:"));
  assert.ok(app.includes("window.scrollTo({ top: 0, behavior: 'instant' })"));
});
