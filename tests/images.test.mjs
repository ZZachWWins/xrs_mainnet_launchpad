import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_LIMITS, safeImageURL, inspectImage, prepareLocalPhoto } from '../src/images.mjs';
function png(width = 128, height = 128) {
  const bytes = new Uint8Array(33); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer); view.setUint32(8, 13); bytes.set([73, 72, 68, 82], 12); view.setUint32(16, width); view.setUint32(20, height); return bytes;
}
function jpeg() {
  const bytes = new Uint8Array(24); bytes.set([255,216,255,192,0,17,8,0,128,1,0,3]); return bytes;
}
function webp() {
  const bytes = new Uint8Array(30); bytes.set(new TextEncoder().encode('RIFF')); new DataView(bytes.buffer).setUint32(4,22,true);
  bytes.set(new TextEncoder().encode('WEBPVP8X'),8); bytes[24]=127;bytes[27]=127; return bytes;
}
function urls() { let next = 0; const created = [], revoked = []; return { created, revoked, createObjectURL() { const value = 'blob:synthetic-' + ++next; created.push(value); return value; }, revokeObjectURL(value) { revoked.push(value); } }; }
test('local photos require matching raster file signatures and bounded dimensions before decoding', () => {
  assert.deepEqual(inspectImage(png(), 'image/png'), { width:128,height:128 });
  assert.deepEqual(inspectImage(jpeg(), 'image/jpeg'), { width:256,height:128 });
  assert.deepEqual(inspectImage(webp(), 'image/webp'), { width:128,height:128 });
  for (const [bytes,type] of [[png(2049), 'image/png'], [png(0), 'image/png'], [png(), 'image/jpeg'],
    [new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),'image/png'], [png(),'image/svg+xml'], [new Uint8Array(IMAGE_LIMITS.bytes+1),'image/png']]) assert.throws(() => inspectImage(bytes,type));
});
test('image decoding failure, malformed files and oversized files never create a retained blob URL', async () => {
  const urlAPI = urls(); let decoded = 0;
  const options = { urlAPI, decode:async () => { decoded++; throw new Error('invalid bitmap'); } };
  await assert.rejects(prepareLocalPhoto(new File([png()], 'photo.png',{type:'image/png'}),options));
  await assert.rejects(prepareLocalPhoto(new File([new Uint8Array(IMAGE_LIMITS.bytes+1)], 'huge.png',{type:'image/png'}),options));
  await assert.rejects(prepareLocalPhoto(new File(['<svg/>'], 'photo.svg',{type:'image/svg+xml'}),options));
  assert.equal(decoded,1);assert.deepEqual(urlAPI.created,[]);
});
test('photo and draft URLs are independently released exactly once; decoded buffers close', async () => {
  const urlAPI=urls();let closed=0;
  const photo=await prepareLocalPhoto(new File([png(128,256)],'photo.png',{type:'image/png'}),{urlAPI,decode:async()=>({width:256,height:128,close(){closed++;}})});
  const draft=photo.fork();assert.equal(closed,1);assert.equal(photo.width,256);assert.notEqual(photo.url,draft.url);
  photo.release();photo.release();assert.deepEqual(urlAPI.revoked,[photo.url]);
  assert.throws(()=>photo.fork());draft.release();assert.deepEqual(urlAPI.revoked,[photo.url,draft.url]);
});
test('only public HTTPS image metadata is accepted; unsafe protocols, SVGs, local targets and credentials fail', () => {
  assert.equal(safeImageURL('https://images.example.com/token.png'),'https://images.example.com/token.png');
  for(const url of ['javascript:alert(1)','data:image/png;base64,AAAA','blob:https://example.com/a','http://example.com/a.png',
    'https:example.com/a.png','https://user:pass@example.com/a.png','https://127.0.0.1/a.png','https://[::1]/a.png','https://localhost/a.png',
    'https://photos.local/a.png','https://example.com:8443/a.png','https://example.com/a.svg','https://example.com/a.png#fragment',' https://example.com/a.png','https://example.com/\\a.png']) assert.throws(()=>safeImageURL(url));
});


test('local file read and bitmap decoding share a bounded deadline without creating URLs', async () => {
  const urlAPI = urls(); let decodeCalls = 0;
  await assert.rejects(prepareLocalPhoto({type:'image/png',size:33,arrayBuffer:()=>new Promise(()=>{})},
    {urlAPI,timeoutMs:5,decode:async()=>{decodeCalls++;}}));
  await assert.rejects(prepareLocalPhoto(new File([png()],'photo.png',{type:'image/png'}),
    {urlAPI,timeoutMs:5,decode:()=>new Promise(()=>{})}));
  assert.equal(decodeCalls,0); assert.deepEqual(urlAPI.created,[]);
});

test('a bitmap arriving after the local preview deadline closes exactly once', async () => {
  const urlAPI = urls(); let finish, closed=0;
  const pending = prepareLocalPhoto(new File([png()],'photo.png',{type:'image/png'}),
    {urlAPI,timeoutMs:5,decode:()=>new Promise(resolve=>{finish=resolve;})});
  await assert.rejects(pending);
  finish({width:128,height:128,close(){closed++;}});
  await Promise.resolve(); await Promise.resolve();
  assert.equal(closed,1); assert.deepEqual(urlAPI.created,[]);
});
