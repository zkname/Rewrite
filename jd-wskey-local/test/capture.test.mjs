import test from 'node:test';
import assert from 'node:assert/strict';
import {createWskeyCore} from '../src/core.mjs';
import {runWskeyWorkflow} from '../src/runner.mjs';
const core = createWskeyCore(), epoch = 1792340000000;
const request = (cookie,host='blackhole.m.jd.com') => ({url:'https://'+host+'/getinfo',headers:cookie === undefined ? {} : {Cookie:cookie}});
function fixture() {
  const store = new Map(),messages = [];let time = epoch, failWrite = false, ends = 0;
  const env = {now:() => time,read:k => store.get(k),write:(v,k) => {if (failWrite) return false;store.set(k,v);return true;},
    notify:code => messages.push(code),done:value => {assert.deepEqual(value,{});ends++;}};
  return {store,messages,get:key => JSON.parse(store.get(key) || 'null'),setTime:t => {time=t;},fail:() => {failWrite=true;},
    run:(input=null,mode='status') => {const before=JSON.stringify(input), previous=ends;
      const result=runWskeyWorkflow(core,{...env,request:input,mode});assert.equal(ends,previous+1);assert.equal(JSON.stringify(input),before);return result;}};
}
const captureKey='jdAppWskeyCaptureV1',statusKey='jdAppWskeyStatusV1';
test('only exact two HTTPS hosts are eligible, including paths absent from old rules',()=>{
  for(const url of ['https://blackhole.m.jd.com/getinfo','https://perf.m.jd.com/app_monitor/anything-new/getRule','https://perf.m.jd.com/new/path'])
    assert.equal(core.capture({url,headers:{}}).code,'APP_NO_COOKIE');
  for(const url of ['http://blackhole.m.jd.com/getinfo','https://blackhole.m.jd.com.evil.invalid/','https://perf.m.jd.com@evil.invalid/',
    'https://api.m.jd.com/','https://my.m.jd.com/','https://perf.m.jd.com:444/','https://perf.m.jd.com\\@evil.invalid/'])
    assert.throws(()=>core.capture({url,headers:{}}),{code:'CAPTURE_URL'});
});
test('base64 padding, quoted values, trailing semicolon and unrelated malformed cookies are supported',()=>{
  const r=core.fromHeaders({cOoKiE:['3device==value; unrelated; wskey="synthetic_key=="','pin=%E4%B8%AD%E6%96%87%2Buser;']});
  assert.equal(r.code,'APP_CAPTURED');assert.equal(r.credential.userName,'\u4e2d\u6587+user');
  assert.equal(r.credential.cookie,'pin=%E4%B8%AD%E6%96%87%2Buser; wskey=synthetic_key==;');
  assert.equal(r.credential.identity,'unverified');
});
test('identical duplicate credentials normalize; conflicting headers reject',()=>{
  assert.equal(core.fromHeaders({Cookie:'wskey=synthetic_key; pin=one',cookie:'wskey=synthetic_key; pin=one'}).code,'APP_CAPTURED');
  for(const second of ['wskey=different_key','pin=two'])
    assert.throws(()=>core.fromHeaders({Cookie:'wskey=synthetic_key; pin=one',cookie:second}),{code:'COOKIE_CONFLICT'});
});
test('missing credentials have distinct observable states and web pt_key is not an App wskey',()=>{
  assert.equal(core.fromHeaders({}).code,'APP_NO_COOKIE');
  for(const Cookie of ['', 'pt_key=synthetic_web; pt_pin=one','pin=one','tracking=wskey=synthetic_key'])
    assert.equal(core.fromHeaders({Cookie}).code,'APP_NO_WSKEY');
  assert.equal(core.fromHeaders({Cookie:'wskey=synthetic_key'}).code,'APP_WSKEY_ONLY');
});
test('invalid, placeholder and oversize keys are rejected without echoing inputs',()=>{
  for(const value of ['short','fake_key','deleted_value','xxx_invalid','a'.repeat(4097),'synthetic key','synthetic,key'])
    assert.throws(()=>core.fromHeaders({Cookie:'wskey='+value}),{code:'WSKEY_FORMAT'});
  for(const Cookie of ['wskey=synthetic_key\r\nx: y','z'.repeat(32769)])
    assert.throws(()=>core.fromHeaders({Cookie}),{code:'COOKIE_FORMAT'});
  assert.throws(()=>core.fromHeaders({Cookie:123}),{code:'COOKIE_FORMAT'});
  for(const pin of ['','%ZZ','%00','bad"pin','bad\\pin'])
    assert.throws(()=>core.fromHeaders({Cookie:'wskey=synthetic_key; pin='+pin}),{code:'PIN_FORMAT'});
});
test('status before capture reports no trigger and subsequent incomplete requests are visible',()=>{
  const f=fixture();assert.equal(f.run().status,'APP_NOT_SEEN');
  assert.equal(f.run(request()).status,'APP_NO_COOKIE');assert.equal(f.run().status,'APP_NO_COOKIE');
  assert.equal(f.run(request('device=one')).status,'APP_NO_WSKEY');assert.equal(f.run().status,'APP_NO_WSKEY');
  assert.equal(f.get(captureKey),null);
});
test('different requests and accounts are never joined, even across hosts',()=>{
  const f=fixture();f.run(request('pin=first'));f.run(request('wskey=synthetic_first','perf.m.jd.com'));
  assert.equal(f.get(captureKey).credential.userName,null);
  f.run(request('pin=second'));assert.equal(f.get(captureKey).credential.userName,null);
  f.run(request('pin=second; wskey=synthetic_second'));assert.equal(f.get(captureKey).credential.userName,'second');
  f.run(request('wskey=synthetic_third'));assert.equal(f.get(captureKey).credential.userName,null);
  assert.equal(f.get(captureKey).credential.cookie,'wskey=synthetic_third;');
});
test('capturing same key without pin does not reuse previous identity',()=>{
  const f=fixture();f.run(request('pin=first; wskey=synthetic_key'));f.run(request('wskey=synthetic_key'));
  assert.equal(f.get(captureKey).credential.userName,null);assert.equal(f.run().status,'APP_WSKEY_ONLY');
});
test('notification throttling never suppresses explicit manual status or a new credential',()=>{
  const f=fixture();f.run(request('pin=first; wskey=synthetic_key'));f.run(request('pin=first; wskey=synthetic_key'));
  assert.equal(f.messages.length,1);f.run();assert.equal(f.messages.length,2);
  f.run(request('pin=first; wskey=synthetic_other'));assert.equal(f.messages.length,3);
  f.setTime(epoch+60000);f.run(request('pin=first; wskey=synthetic_other'));assert.equal(f.messages.length,4);
  assert.doesNotMatch(JSON.stringify(f.messages),/synthetic|first/);
  assert.doesNotMatch(JSON.stringify(f.get(statusKey)),/synthetic|first/);
});
test('expiry is exact at fifteen minutes; clear also works with corrupted capture data',()=>{
  const f=fixture();f.run(request('pin=one; wskey=synthetic_key'));f.setTime(epoch+899999);assert.equal(f.run().status,'APP_CAPTURED');
  f.setTime(epoch+900000);assert.equal(f.run().status,'APP_EXPIRED');assert.equal(f.get(captureKey),null);
  f.store.set(captureKey,'broken JSON');assert.equal(f.run().code,'STORAGE_FORMAT');
  assert.equal(f.run(null,'clear').status,'APP_CLEARED');assert.equal(f.get(captureKey),null);
});
test('clock rollback invalidates capture; next matching request also clears expired data',()=>{
  for(const next of [epoch-1,epoch+900000]) {
    const f=fixture();f.run(request('wskey=synthetic_key'));f.setTime(next);f.run(request());assert.equal(f.get(captureKey),null);
  }
});
test('storage write failure and forged stored credential cannot claim success',()=>{
  const f=fixture();f.fail();assert.equal(f.run(request('wskey=synthetic_key')).code,'STORAGE_WRITE_FAILED');
  assert.equal(f.get(captureKey),null);assert.deepEqual(f.messages,['STORAGE_WRITE_FAILED']);
  const g=fixture();g.run(request('wskey=synthetic_key'));const c=g.get(captureKey);c.credential.userName='forged';
  g.store.set(captureKey,JSON.stringify(c));assert.equal(g.run().code,'STORAGE_FORMAT');
});
test('legacy App caches and web cookies are neither read nor overwritten',()=>{
  const f=fixture();for(const key of ['wskeyList','jdLocalCaptureV1','jdWebCaptureV1','jdCookieList']) f.store.set(key,'unrelated data');
  f.run(request('wskey=synthetic_key'));f.run(null,'clear');
  for(const key of ['wskeyList','jdLocalCaptureV1','jdWebCaptureV1','jdCookieList']) assert.equal(f.store.get(key),'unrelated data');
});
test('invalid time and unsupported manual mode finish with fixed error codes',()=>{
  const f=fixture();assert.equal(f.run(null,'convert').code,'MODE_REQUIRED');
  f.setTime(NaN);assert.equal(f.run().code,'CLOCK_INVALID');
});
