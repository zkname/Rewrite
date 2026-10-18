import test from 'node:test';
import assert from 'node:assert/strict';
import {createCore} from '../src/core.mjs';
import {runWorkflow} from '../src/runner.mjs';
const core=createCore(),epoch=1792368000000;
const keys={capture:'jdWebCaptureV1',status:'jdLocalStatusV1',state:'jdWebVerifyV1',cookies:'jdCookieList'};
const cookie=(name='test',key='synthetic_key')=>`pt_key=${key}; pt_pin=${name};`;
function setup(overrides={}) {
  const store=new Map(),notices=[],calls=[];let time=epoch,done=0,random=0;
  const env={request:null,mode:'status',now:()=>time,random:()=>++random/1000,
    read:k=>store.get(k),write:(v,k)=>{store.set(k,v);return true;},wait:async()=>{},
    notify:(...v)=>notices.push(v),done:v=>{assert.deepEqual(v,{});done++;},
    http:async o=>{calls.push(o);return {status:200,body:'{"retcode":0,"data":{"userInfo":{"baseInfo":{"curPin":"test"}}}}'};},...overrides};
  const run=async(mode='status')=>{env.request=null;env.mode=mode;return runWorkflow(core,env);};
  const capture=async(Cookie=cookie())=>{
    env.request={url:'https://my.m.jd.com/index.html?secret=synthetic_query',headers:Cookie===null?{}:{Cookie}};
    const before=JSON.stringify(env.request),r=await runWorkflow(core,env);assert.equal(JSON.stringify(env.request),before);env.request=null;return r;
  };
  return {env,store,notices,calls,run,capture,put:(k,v)=>store.set(k,JSON.stringify(v)),get:k=>JSON.parse(store.get(k)||'null'),
    time:t=>{time=t;},done:()=>done};
}
test('status before any capture is explicit and local-only',async()=>{
  const t=setup();assert.equal((await t.run()).status,'WEB_NOT_SEEN');assert.equal(t.calls.length,0);
  assert.equal(t.get(keys.status).lastRequest,'WEB_NOT_SEEN');assert.equal(t.done(),1);
});
test('missing and incomplete browser credentials produce feedback without cross-request merging',async()=>{
  const t=setup();assert.equal((await t.capture(null)).status,'WEB_NO_COOKIE');
  assert.equal((await t.capture('pt_key=synthetic_key;')).status,'WEB_INCOMPLETE');
  assert.equal((await t.capture('pt_pin=test;')).status,'WEB_INCOMPLETE');
  assert.equal(t.get(keys.capture),null);assert.equal((await t.run('verify')).code,'WEB_CAPTURE_REQUIRED');assert.equal(t.calls.length,0);
  assert.ok(t.notices.some(n=>n[0]==='WEB_INCOMPLETE'));
});
test('complete browser capture stages only needed fields, without verifying or overwriting saved cookies',async()=>{
  const t=setup();const old=[{userName:'old',cookie:cookie('old','previous_key')}];t.put(keys.cookies,old);
  assert.equal((await t.capture('3device=x; tracking={"name": "test phone"}; '+cookie())).status,'WEB_CAPTURED');
  assert.deepEqual(t.get(keys.capture).account,{userName:'test',cookie:cookie()});assert.deepEqual(t.get(keys.cookies),old);
  assert.equal(t.calls.length,0);assert.ok(!JSON.stringify(t.notices).includes('synthetic_'));
  assert.ok(!t.store.get(keys.status).includes('synthetic_'));assert.ok(!JSON.stringify([...t.store.values()]).includes('synthetic_query'));
});
test('repeat capture is throttled but manual status always reports and later refresh notifies again',async()=>{
  const t=setup();await t.capture();const id=t.get(keys.capture).id;await t.capture();assert.equal(t.notices.length,1);
  assert.equal(t.get(keys.capture).id,id);await t.run();assert.equal(t.notices.length,2);
  t.time(epoch+60000);await t.capture();assert.equal(t.notices.length,3);
});
test('account change notifies immediately and replaces only the staged candidate',async()=>{
  const t=setup();await t.capture();await t.capture(cookie('other','second_key'));
  assert.equal(t.get(keys.capture).account.userName,'other');assert.equal(t.notices.length,2);assert.equal(t.get(keys.cookies),null);
});
test('manual login verification sends one request and writes the compatible output only on success',async()=>{
  const t=setup();t.put(keys.cookies,[{userName:'other',cookie:cookie('other','previous_key')}]);await t.capture();
  assert.equal((await t.run('verify')).status,'LOGIN_VERIFIED');assert.equal(t.calls.length,1);
  assert.equal(t.get(keys.cookies).length,2);assert.deepEqual(t.get(keys.cookies)[1],{userName:'test',cookie:cookie()});
  assert.equal(t.get(keys.status).queryVerification,'pending');assert.equal(t.get(keys.status).loginVerification,'verified');
  assert.equal((await t.run()).status,'LOGIN_VERIFIED');assert.ok(!JSON.stringify(t.notices).includes('synthetic_'));
});
test('same-account success replaces its record without duplicating accounts',async()=>{
  const t=setup();t.put(keys.cookies,[{userName:'test',cookie:cookie('test','previous_key')}]);await t.capture();await t.run('verify');
  assert.deepEqual(t.get(keys.cookies),[{userName:'test',cookie:cookie()}]);
});
test('a later browser visit does not reuse an expired login-verification result',async()=>{
  const t=setup();await t.capture();await t.run('verify');t.time(epoch+900000);
  assert.equal((await t.capture()).status,'WEB_CAPTURED');assert.equal(t.get(keys.capture).verifiedAt,null);
});
for(const [response,code] of [
  [{status:200,body:'{"retcode":1001}'},'LOGIN_UNCONFIRMED'],[{status:200,body:'{}'},'LOGIN_UNCONFIRMED'],
  [{status:200,body:'{"retcode":0,"data":{"userInfo":{"baseInfo":{"curPin":"other"}}}}'},'ACCOUNT_MISMATCH'],
  [{status:302,body:''},'HTTP_REJECTED'],[{status:429,body:''},'RATE_LIMITED'],
  [{status:200,body:'globalThis.evil=true'},'RESPONSE_JSON'],[{status:200,body:'x'.repeat(262145)},'RESPONSE_FORMAT']])
  test('failed verification '+code+' preserves old data without retry',async()=>{
    let count=0;const t=setup({http:async()=>{count++;return response;}}),old=[{userName:'test',cookie:cookie('test','previous_key')}];
    t.put(keys.cookies,old);await t.capture();assert.equal((await t.run('verify')).code,code);
    assert.deepEqual(t.get(keys.cookies),old);assert.equal(count,1);assert.equal((await t.run('verify')).code,'VERIFY_COOLDOWN');assert.equal(count,1);
    assert.equal(globalThis.evil,undefined);
  });
test('unknown exceptions and forged storage status never leak details into notifications',async()=>{
  const t=setup({http:async()=>{throw Error('synthetic_key');}});await t.capture();
  assert.equal((await t.run('verify')).code,'INTERNAL_ERROR');assert.ok(!JSON.stringify(t.notices).includes('synthetic_'));
  const bad=setup();bad.put('jdWebObservationV1',{code:'synthetic_key',at:epoch});
  assert.equal((await bad.run()).code,'STORAGE_FORMAT');assert.ok(!JSON.stringify(bad.notices).includes('synthetic_'));
});
for(const mode of ['status','verify'])test(mode+' expires and clears old or future-dated candidates without network',async()=>{
  for(const time of [epoch+900000,epoch-1]){
    const t=setup();await t.capture();t.time(time);const r=await t.run(mode);
    assert.equal(r.code||r.status,'WEB_EXPIRED');assert.equal(t.get(keys.capture),null);assert.equal(t.calls.length,0);
  }
});
test('capture conflicts preserve previous candidate and make failure observable',async()=>{
  const t=setup();await t.capture();const before=t.store.get(keys.capture);
  assert.equal((await t.capture(cookie()+'pt_pin=other')).code,'COOKIE_CONFLICT');
  assert.equal(t.store.get(keys.capture),before);assert.equal(t.get(keys.status).lastRequest,'COOKIE_CONFLICT');assert.equal(t.calls.length,0);
});
test('missing metadata never imports old wskey storage',async()=>{
  const t=setup();t.put('jdLocalCaptureV1',{version:1,wskey:'synthetic_wskey',pin:'test',capturedAt:epoch});
  assert.equal((await t.run()).status,'WEB_NOT_SEEN');assert.equal((await t.run('verify')).code,'WEB_CAPTURE_REQUIRED');
});
test('storage failure cannot be reported as saved and does not leak the candidate',async()=>{
  const t=setup({write:()=>false});assert.equal((await t.capture()).code,'STORAGE_WRITE_FAILED');assert.equal(t.calls.length,0);
  const later=setup();await later.capture();const write=later.env.write;later.env.write=(v,k)=>k===keys.cookies?false:write(v,k);
  assert.equal((await later.run('verify')).code,'STORAGE_WRITE_FAILED');assert.equal(later.get(keys.cookies),null);
  assert.ok(!later.notices.some(n=>n[0]==='LOGIN_VERIFIED'));
});
test('overlapping verification uses one request and fences a superseded owner',async()=>{
  let resume;const t=setup({wait:()=>new Promise(r=>{resume=r;})});await t.capture();
  const first=t.run('verify');await Promise.resolve();assert.equal((await t.run('verify')).code,'VERIFY_BUSY');
  resume();assert.equal((await first).status,'LOGIN_VERIFIED');assert.equal(t.calls.length,1);
  const other=setup({wait:async()=>{other.put(keys.state,{nonce:'different',startedAt:epoch,status:'inflight'});}});await other.capture();
  assert.equal((await other.run('verify')).code,'VERIFY_SUPERSEDED');assert.equal(other.calls.length,0);
});
test('changing account during verification discards stale results even if capture IDs collide',async()=>{
  const t=setup({random:()=>0.5});await t.capture();
  t.env.http=async()=>{await t.capture(cookie('other','other_key'));return {status:200,body:'{"retcode":0}'};};
  assert.equal((await t.run('verify')).code,'CAPTURE_CHANGED');assert.equal(t.get(keys.cookies),null);
  assert.equal(t.get(keys.capture).account.userName,'other');
});
test('malformed existing account records stop a write rather than replacing unrelated data',async()=>{
  const t=setup();t.put(keys.cookies,[{userName:'different',cookie:cookie()}]);const before=t.store.get(keys.cookies);await t.capture();
  assert.equal((await t.run('verify')).code,'STORAGE_FORMAT');assert.equal(t.store.get(keys.cookies),before);
});
