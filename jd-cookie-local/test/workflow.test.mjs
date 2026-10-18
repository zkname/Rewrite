import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createCore} from '../src/core.mjs';
import {runWorkflow} from '../src/runner.mjs';
const c=createCore(),epoch=Date.parse('2026-10-19T00:00:00Z');
const request=(wskey='synthetic_wskey',pin='test')=>({url:'https://blackhole.m.jd.com/getinfo',headers:{Cookie:`wskey=${wskey};${pin?' pin='+pin+';':''}`}});
const keys={capture:'jdLocalCaptureV1',state:'jdLocalConversionV1',cookies:'jdCookieList'};
function setup(overrides={}){
  const store=new Map(),notifications=[],calls=[];let clock=epoch,done=0;
  const env={request:null,mode:'convert',now:()=>clock,random:()=>0.5,read:key=>store.get(key),write:(v,k)=>{store.set(k,v);return true;},
    wait:async()=>{},notify:(...args)=>notifications.push(args),done:value=>{assert.deepEqual(value,{});done++;},
    http:async options=>{calls.push(options);
      if(options.url.startsWith('https://api.m.jd.com/'))return {status:200,headers:{},body:'{"tokenKey":"synthetic_token"}'};
      if(options.url.startsWith('https://un.m.jd.com/'))return {status:302,headers:{'Set-Cookie':['pt_key=synthetic_key; Secure','pt_pin=test; HttpOnly']},body:''};
      return {status:200,headers:{},body:'{"retcode":"0","data":{"userInfo":{"baseInfo":{"curPin":"test"}}}}'};
    },...overrides};
  const put=(key,value)=>store.set(key,JSON.stringify(value));
  const capture=async(wskey,pin)=>{env.request=request(wskey,pin);const result=await runWorkflow(c,env);env.request=null;return result;};
  return {env,store,put,notifications,calls,capture,setTime:t=>{clock=t;},getDone:()=>done};
}
test('capture passes unchanged request, no HTTP, removes all cross-request identity merging',async()=>{
  const t=setup();await t.capture();assert.equal(t.calls.length,0);assert.equal(t.getDone(),1);
  await t.capture('synthetic_new',null);assert.equal(JSON.parse(t.store.get(keys.capture)).pin,null);
  t.env.request={...request(),headers:{Cookie:'pin=second;'}};await runWorkflow(c,t.env);
  assert.equal(JSON.parse(t.store.get(keys.capture)).pin,null);
});
test('capture ignores App metadata, preserves request and previous state on invalid credentials',async()=>{
  const t=setup();
  t.env.request={...request(),headers:{Cookie:'3device=one; tracking={"device": "test phone"}; wskey=synthetic_wskey; pin=test;'}};
  const before=JSON.stringify(t.env.request);
  assert.equal((await runWorkflow(c,t.env)).status,'captured');assert.equal(JSON.stringify(t.env.request),before);
  const saved=t.store.get(keys.capture);
  t.env.request={...request(),headers:{Cookie:'3device=one; wskey=synthetic_one; wskey=synthetic_two;'}};
  assert.equal((await runWorkflow(c,t.env)).code,'COOKIE_CONFLICT');assert.equal(t.store.get(keys.capture),saved);
  t.env.request={...request(),headers:{Cookie:'wskey=synthetic_wskey\r\nx-header:value'}};
  assert.equal((await runWorkflow(c,t.env)).code,'CAPTURE_COOKIE_FORMAT');assert.equal(t.store.get(keys.capture),saved);
  assert.equal(t.calls.length,0);assert.equal(t.getDone(),3);assert.ok(!JSON.stringify(t.notifications).includes('synthetic_'));
});

test('manual conversion validates login, saves local result and clears only consumed capture',async()=>{
  const t=setup();await t.capture();const result=await runWorkflow(c,t.env);
  assert.equal(result.status,'login-verified');assert.equal(result.queryVerification,'pending');assert.equal(t.calls.length,3);
  assert.deepEqual(JSON.parse(t.store.get(keys.cookies)),[{userName:'test',cookie:'pt_key=synthetic_key; pt_pin=test;'}]);
  assert.equal(JSON.parse(t.store.get(keys.capture)),null);assert.equal(t.getDone(),2);
  assert.ok(!JSON.stringify(t.notifications).includes('synthetic_'));assert.ok(!JSON.stringify(t.notifications).includes('pt_key'));
});
test('missing pin is resolved only by the JD response; mismatch never replaces existing cookies',async()=>{
  const t=setup();await t.capture('synthetic_wskey',null);assert.equal((await runWorkflow(c,t.env)).status,'login-verified');
  const other=setup();other.put(keys.cookies,[{userName:'old',cookie:'pt_key=previous_key; pt_pin=old;'}]);
  await other.capture('synthetic_other','other');assert.equal((await runWorkflow(c,other.env)).code,'ACCOUNT_MISMATCH');
  assert.equal(JSON.parse(other.store.get(keys.cookies))[0].userName,'old');assert.equal(other.calls.length,2);
});
test('expired capture is cleared; future timestamps rejected before HTTP',async()=>{
  for(const when of [epoch+900000,epoch-1]){const t=setup();await t.capture();t.setTime(when);
    assert.equal((await runWorkflow(c,t.env)).code,'CAPTURE_EXPIRED');assert.equal(t.calls.length,0);assert.equal(JSON.parse(t.store.get(keys.capture)),null);}
});
test('failed conversion leaves previous good cookie and blocks same-key immediate replay',async()=>{
  const t=setup({http:async()=>{throw Error('synthetic_wskey should never be logged');}});
  t.put(keys.cookies,[{userName:'test',cookie:'pt_key=previous_key; pt_pin=test;'}]);await t.capture();
  assert.equal((await runWorkflow(c,t.env)).code,'INTERNAL_ERROR');
  assert.equal((await runWorkflow(c,t.env)).code,'CONVERSION_COOLDOWN');
  assert.ok(t.store.get(keys.cookies).includes('previous_key'));assert.ok(!JSON.stringify(t.notifications).includes('synthetic_'));
});
test('concurrent invocations allow one conversion and fence a superseded owner',async()=>{
  let resolveWait;const t=setup({wait:()=>new Promise(resolve=>{resolveWait=resolve;})});await t.capture();
  const first=runWorkflow(c,t.env);await Promise.resolve();
  assert.equal((await runWorkflow(c,t.env)).code,'CONVERSION_BUSY');
  resolveWait();assert.equal((await first).status,'login-verified');assert.equal(t.calls.length,3);
  const lost=setup({wait:async()=>{lost.put(keys.state,{nonce:'other',status:'inflight',startedAt:epoch});}});await lost.capture();
  assert.equal((await runWorkflow(c,lost.env)).code,'CONVERSION_SUPERSEDED');assert.equal(lost.calls.length,0);
});
test('a capture arriving mid-conversion survives completion',async()=>{
  const t=setup();await t.capture();const original=t.env.http;
  t.env.http=async options=>{if(options.url.startsWith('https://me-api'))t.put(keys.capture,{version:1,wskey:'new_capture',pin:'second',capturedAt:epoch+1});return original(options);};
  await runWorkflow(c,t.env);assert.equal(JSON.parse(t.store.get(keys.capture)).wskey,'new_capture');
});
test('storage failure before HTTP and before output commit cannot be reported as success',async()=>{
  const t=setup({write:()=>false});assert.equal((await t.capture()).code,'STORAGE_WRITE_FAILED');assert.equal(t.calls.length,0);
  const later=setup();await later.capture();const write=later.env.write;
  later.env.write=(v,k)=>k===keys.cookies?false:write(v,k);
  assert.equal((await runWorkflow(c,later.env)).code,'STORAGE_WRITE_FAILED');assert.equal(later.store.has(keys.cookies),false);
});
for(const [status,body,code] of [[302,'','HTTP_REJECTED'],[429,'','RATE_LIMITED'],[200,'globalThis.evil=1','RESPONSE_JSON'],[200,'{}','TOKEN_REJECTED'],[200,'x'.repeat(262145),'RESPONSE_FORMAT']])
  test('token response '+status+'/'+code+' is rejected without retries',async()=>{
    let calls=0;const t=setup({http:async()=>{calls++;return {status,body,headers:{}};}});await t.capture();
    assert.equal((await runWorkflow(c,t.env)).code,code);assert.equal(calls,1);assert.equal(globalThis.evil,undefined);
  });
test('login failure never saves a newly obtained cookie',async()=>{
  const t=setup();await t.capture();const original=t.env.http;
  t.env.http=options=>options.url.startsWith('https://me-api')?{status:200,headers:{},body:'{"retcode":1001}'}:original(options);
  assert.equal((await runWorkflow(c,t.env)).code,'LOGIN_UNCONFIRMED');assert.equal(t.store.has(keys.cookies),false);
});
test('bundled Loon adapter forwards request and calls done exactly once without network or console',async()=>{
  const source=fs.readFileSync(new URL('../../get_jd_wskey.js',import.meta.url),'utf8');
  const store=new Map();let done=0,notify=0;
  const appRequest={...request(),headers:{Cookie:'3device=one; tracking={"device": "test phone"}; wskey=synthetic_wskey; pin=test;'}};
  const before=JSON.stringify(appRequest);
  const context=vm.createContext({$request:appRequest,$argument:'',Date,Math,Promise,
    $persistentStore:{read:k=>store.get(k),write:(v,k)=>{store.set(k,v);return true;}},
    $notification:{post:()=>{notify++;}},$done:args=>{assert.equal(Object.keys(args).length,0);done++;},
    $httpClient:{get:()=>assert.fail('unexpected network'),post:()=>assert.fail('unexpected network')},
    console:{log:()=>assert.fail('unexpected log')},setTimeout:()=>assert.fail('unexpected timer')},
    {codeGeneration:{strings:false,wasm:false}});
  new vm.Script(source).runInContext(context);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(done,1);assert.equal(notify,1);assert.ok(store.has(keys.capture));assert.equal(JSON.stringify(appRequest),before);
});
