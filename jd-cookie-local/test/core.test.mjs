import test from 'node:test';
import assert from 'node:assert/strict';
import {createCore} from '../src/core.mjs';
const c=createCore(),cookie='pt_key=synthetic_key; pt_pin=test;';
for(const host of ['m.jd.com','home.m.jd.com','my.m.jd.com'])
  test('capture exact HTTPS browser host '+host,()=>{
    const result=c.capture({url:'https://'+host+'/index.html?source=web',headers:{Cookie:cookie}});
    assert.deepEqual(result,{code:'WEB_CAPTURED',host,account:{userName:'test',cookie}});
  });
for(const url of ['http://my.m.jd.com/','https://my.m.jd.com.evil.invalid/','https://my.m.jd.com@evil.invalid/',
  'https://evil.invalid/?next=https://my.m.jd.com/','https://my.m.jd.com:8443/','https://blackhole.m.jd.com/getinfo',
  'https://perf.m.jd.com/app_monitor/test/getRule','https://my.m.jd.com\\@evil.invalid/'])
  test('reject unexpected capture URL '+url,()=>assert.throws(()=>c.capture({url,headers:{Cookie:cookie}}),{code:'CAPTURE_URL'}));
test('ignore numeric metadata and extract complete Cookie only from this request',()=>{
  const result=c.fromHeaders({COOKIE:'3device=test; tracking={"name": "test phone"}; legacy-flag; '+cookie});
  assert.deepEqual(result.account,{userName:'test',cookie});
  assert.equal(c.fromHeaders({}).code,'WEB_NO_COOKIE');
  for(const Cookie of ['wskey=synthetic_wskey; pin=test','pt_key=synthetic_key','pt_pin=test','tracking=pt_key=synthetic_key']) {
    const result=c.fromHeaders({Cookie});assert.equal(result.code,'WEB_INCOMPLETE');assert.equal(result.account,null);
  }
});
test('handle header casing, arrays, quotes and Chinese percent encoding',()=>{
  const result=c.fromHeaders({Cookie:['pt_key = "synthetic_key=="; pt_pin="%E4%B8%AD%E6%96%87%20%2B"','3device=x'],COOKIE:'pt_key=synthetic_key=='});
  assert.deepEqual(result.account,{userName:'中文 +',cookie:'pt_key=synthetic_key==; pt_pin=%E4%B8%AD%E6%96%87%20%2B;'});
});
test('reject conflicting credentials in one or multiple header entries',()=>{
  for(const Cookie of [cookie+'pt_key=other_key;',cookie+'pt_pin=other;',cookie+'pt_key=;',cookie+'pt_pin=;'])
    assert.throws(()=>c.fromHeaders({Cookie}),{code:'COOKIE_CONFLICT'});
  assert.throws(()=>c.fromHeaders({Cookie:cookie,COOKIE:'pt_key=other_key'}),{code:'COOKIE_CONFLICT'});
});
test('reject fake keys, malformed identities and target fields without equals',()=>{
  for(const Cookie of ['pt_key=fake_key; pt_pin=test','pt_key=; pt_pin=test','pt_key=synthetic key; pt_pin=test',
    'pt_key=synthetic_key; pt_pin=%ZZ','pt_key=synthetic_key; pt_pin=%0d','pt_key=synthetic_key; pt_pin=',
    'pt_key=synthetic_key; pt_pin="test','pt_key; pt_pin=test'])assert.throws(()=>c.fromHeaders({Cookie}));
});
test('reject control characters, non-string headers and oversized headers',()=>{
  for(const Cookie of [17,null,{},['pt_key=synthetic_key',17],cookie+'x='+ 'a'.repeat(32768),cookie+'\r\nX: y',cookie+'x=\x00',cookie+'x=\x1f'])
    assert.throws(()=>c.fromHeaders({Cookie}),{code:'COOKIE_FORMAT'});
});
test('only canonical full accounts may be sent or persisted',()=>{
  assert.deepEqual(c.validAccount({userName:'test',cookie}),{userName:'test',cookie});
  for(const account of [{userName:'other',cookie},{userName:'test',cookie:cookie+'extra=value;'},{userName:'test',cookie:'wskey=synthetic_wskey; pin=test'}])
    assert.throws(()=>c.validAccount(account));
});
test('login success requires explicit retcode and matching identity when provided',()=>{
  for(const data of [{retcode:0},{retcode:'0',data:{userInfo:{baseInfo:{curPin:'test'}}}}])c.loginValid(data,{userName:'test'});
  for(const data of [{},{code:0},{retcode:1001},{retcode:false},null])assert.throws(()=>c.loginValid(data,{userName:'test'}),{code:'LOGIN_UNCONFIRMED'});
  assert.throws(()=>c.loginValid({retcode:0,data:{userInfo:{baseInfo:{curPin:'other'}}}},{userName:'test'}),{code:'ACCOUNT_MISMATCH'});
});
test('manual verification has one fixed HTTPS endpoint with strict TLS and no redirects',()=>{
  const o=c.verifyOptions({userName:'test',cookie});
  assert.equal(o.url,'https://me-api.jd.com/user_new/info/GetJDUserInfoUnion');assert.equal(o.method,'get');
  assert.equal(o.insecure,false);assert.equal(o['auto-cookie'],false);assert.equal(o['auto-redirect'],false);assert.equal(o.headers.Cookie,cookie);
});
test('account notification labels remove control and bidirectional text',()=>{
  assert.equal(c.label('synthetic_test\u202e\u2028'),'***st');assert.equal(c.label('中文 +'),'***中文');
});
