import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../get_jd_wskey.js',import.meta.url),'utf8');
async function scenario(kind,request) {
  const store=new Map(),messages=[],deadlines=[];let done=0,calls=0,pending;
  if(!request && kind!=='status')store.set('jdWebCaptureV1',JSON.stringify({version:1,id:'synthetic_id',capturedAt:Date.now(),
    account:{userName:'test',cookie:'pt_key=synthetic_key; pt_pin=test;'},verifiedAt:null}));
  const context=vm.createContext({$request:request,$argument:kind==='status'?'status':'verify',Date,Math,Promise,
    $persistentStore:{read:k=>store.get(k),write:(v,k)=>{store.set(k,v);return true;}},
    $notification:{post:(...v)=>messages.push(v)},$done:v=>{assert.equal(Object.keys(v).length,0);done++;},
    $httpClient:{get:(options,callback)=>{
      calls++;assert.equal(options.url,'https://me-api.jd.com/user_new/info/GetJDUserInfoUnion');
      assert.equal(options.insecure,false);assert.equal(options['auto-redirect'],false);assert.equal(options['auto-cookie'],false);
      if(kind==='timeout'){pending=callback;return;}
      if(kind==='tls-error'){callback('TLS failed with synthetic_key',null,null);return;}
      callback(null,{status:200},'{"retcode":0}');
    },post:()=>assert.fail('No POST allowed')},
    console:{log:()=>assert.fail('No console output')},
    setTimeout:(fn,ms)=>{if(ms===100)queueMicrotask(fn);else deadlines.push(fn);}},
    {codeGeneration:{strings:false,wasm:false}});
  const before=JSON.stringify(request);new vm.Script(source).runInContext(context);await new Promise(r=>setImmediate(r));
  if(kind==='timeout'){assert.equal(done,0);deadlines.forEach(fn=>fn());await new Promise(r=>setImmediate(r));pending(null,{status:200},'{"retcode":0}');}
  deadlines.forEach(fn=>fn());await new Promise(r=>setImmediate(r));assert.equal(done,1);assert.equal(JSON.stringify(request),before);
  assert.ok(!JSON.stringify(messages).includes('synthetic_'));return {store,messages,calls};
}
test('generated browser hook forwards request unchanged and never calls HTTP',async()=>{
  const r=await scenario('capture',{url:'https://my.m.jd.com/index.html',headers:{Cookie:'3device=x; pt_key=synthetic_key; pt_pin=test;'}});
  assert.equal(r.calls,0);assert.ok(r.store.has('jdWebCaptureV1'));assert.ok(!r.store.has('jdCookieList'));assert.equal(r.messages.length,1);
});
test('generated missing-cookie hook and local status are visible without HTTP',async()=>{
  for(const r of [await scenario('capture',{url:'https://my.m.jd.com/index.html',headers:{}}),await scenario('status')]){
    assert.equal(r.calls,0);assert.equal(r.messages.length,1);
  }
});
test('generated manual verifier saves only on explicit JD success',async()=>{
  const r=await scenario('success');assert.equal(r.calls,1);assert.ok(r.store.has('jdCookieList'));
});
for(const kind of ['timeout','tls-error'])test('generated '+kind+' has no retry, credential leakage or double callback',async()=>{
  const r=await scenario(kind);assert.equal(r.calls,1);assert.equal(r.store.has('jdCookieList'),false);
});
