import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../get_jd_wskey.js',import.meta.url),'utf8');
async function adapterScenario(kind){
  const store=new Map([['jdLocalCaptureV1',JSON.stringify({version:1,wskey:'synthetic_wskey',pin:'test',capturedAt:Date.now()})]]);
  const messages=[],deadlines=[];let done=0,calls=0,pending;
  const request=(options,callback)=>{
    calls++;assert.equal(options.insecure,false);assert.equal(options['auto-redirect'],false);assert.equal(options['auto-cookie'],false);
    if(kind==='timeout'){pending=callback;return;}
    if(kind==='tls-error'){callback('Certificate failed; synthetic_wskey',null,null);return;}
    if(options.url.startsWith('https://api.m.jd.com/'))callback(null,{status:200,headers:{}},'{"tokenKey":"synthetic_token"}');
    else if(options.url.startsWith('https://un.m.jd.com/'))callback(null,{status:302,headers:{'set-cookie':'pt_key=synthetic_key, pt_pin=test'}},'');
    else callback(null,{status:200,headers:{}},'{"retcode":0}');
  };
  const context=vm.createContext({$argument:'convert',Date,Math,Promise,
    $persistentStore:{read:k=>store.get(k),write:(v,k)=>{store.set(k,v);return true;}},
    $notification:{post:(...args)=>messages.push(args)},$done:()=>{done++;},
    $httpClient:{get:request,post:request},console:{log:()=>assert.fail('No console output allowed')},
    setTimeout:(fn,ms)=>{if(ms===100)queueMicrotask(fn);else deadlines.push(fn);}},
    {codeGeneration:{strings:false,wasm:false}});
  new vm.Script(source).runInContext(context);await new Promise(r=>setImmediate(r));
  if(kind==='timeout'){assert.equal(done,0);deadlines.forEach(fn=>fn());await new Promise(r=>setImmediate(r));pending(null,{status:200,headers:{}},'{"tokenKey":"synthetic_token"}');}
  deadlines.forEach(fn=>fn());await new Promise(r=>setImmediate(r));
  assert.equal(done,1);assert.ok(!JSON.stringify(messages).includes('synthetic_'));
  return {store,messages,calls};
}
test('bundle executes full manual conversion with strict transport options',async()=>{
  const r=await adapterScenario('success');assert.equal(r.calls,3);assert.ok(r.store.has('jdCookieList'));
});
test('bundle timeout settles once, ignores late callbacks and sends no retry',async()=>{
  const r=await adapterScenario('timeout');assert.equal(r.calls,1);assert.equal(r.store.has('jdCookieList'),false);assert.match(JSON.stringify(r.messages),/NETWORK_TIMEOUT/);
});
test('bundle TLS error has no insecure fallback or credential-bearing error output',async()=>{
  const r=await adapterScenario('tls-error');assert.equal(r.calls,1);assert.equal(r.store.has('jdCookieList'),false);assert.match(JSON.stringify(r.messages),/NETWORK_ERROR/);
});
