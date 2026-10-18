import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createCore} from '../src/core.mjs';
const c=createCore(),now=Date.parse('2026-10-19T00:00:00Z');
const vectors=JSON.parse(fs.readFileSync(new URL('./vectors.json',import.meta.url),'utf8'));
for(const [i,v] of vectors.entries())test('pinned Python signature vector '+i,()=>assert.equal(c.sign(v.input),v.expected));
for(const value of ['', 'a', 'abc', 'message digest', 'abcdefghijklmnopqrstuvwxyz', '中文😀&=%+', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)])
  test('RFC MD5 / UTF8 / Base64 length '+value.length,()=>{
    assert.equal(c.md5(c.utf8(value)),createHash('md5').update(value).digest('hex'));
    assert.equal(c.base64(c.utf8(value)),Buffer.from(value).toString('base64'));
  });
test('sign params exactly sign transmitted body and preserve fixed URL encoding',()=>{
  const o=c.options('token',{uuid:'0123456789abcdef',st:now,sv:'102',wskey:'synthetic_wskey',pin:'test'});
  const p=new URL(o.url).searchParams;
  const body=new URLSearchParams(o.body).get('body');
  assert.equal(p.get('sign'),c.sign({functionId:'genToken',body,uuid:p.get('oaid'),client:p.get('client'),clientVersion:p.get('clientVersion'),st:p.get('st'),sv:p.get('sv')}));
  assert.equal(JSON.parse(body).to,'https%3a%2f%2fplogin.m.jd.com%2fjd-mlogin%2fstatic%2fhtml%2fappjmp_blank.html');
  assert.equal(p.get('sign').length,32);
});
test('capture accepts header case and both fields together, never assembles separate requests',()=>{
  const request={url:'https://blackhole.m.jd.com/getinfo',headers:{Cookie:'wskey=synthetic_wskey; pin=test%20one'}};
  assert.equal(c.capture(request,now).pin,'test%20one');
  assert.equal(c.capture({...request,headers:{cookie:'wskey=synthetic_wskey'}},now).pin,null);
  assert.equal(c.capture({...request,headers:{COOKIE:'pin=second;'}},now),null);
  assert.throws(()=>c.capture({...request,url:'https://blackhole.m.jd.com.evil.invalid/getinfo'},now),{code:'CAPTURE_URL'});
  assert.throws(()=>c.capture({...request,headers:{Cookie:'wskey=synthetic_one; wskey=synthetic_two'}},now),{code:'COOKIE_CONFLICT'});
});
test('capture accepts numeric and punctuation metadata names without retaining their values',()=>{
  const headers={Cookie:'3AB9D23F7A4B3C9B=synthetic_device; device.id=synthetic_id; $Version=1; wskey=synthetic_wskey; pin=test;'};
  assert.deepEqual(c.capture({url:'https://blackhole.m.jd.com/getinfo',headers},now),
    {version:1,wskey:'synthetic_wskey',pin:'test',capturedAt:now});
});

test('capture ignores unrelated metadata values, flags and conflicts',()=>{
  const headers={cookie:'tracking={"label": "test device"}; legacy-flag; tracking=other; wskey=synthetic_wskey==; pin=test%20one;'};
  assert.deepEqual(c.capture({url:'https://perf.m.jd.com/app_monitor/test/getRule',headers},now),
    {version:1,wskey:'synthetic_wskey==',pin:'test%20one',capturedAt:now});
  assert.equal(c.capture({url:'https://blackhole.m.jd.com/getinfo',headers:{Cookie:'tracking=wskey=synthetic_wskey; legacy-flag; pin=%ZZ;'}},now),null);
});

test('capture normalizes paired quotes and optional whitespace only on selected credentials',()=>{
  const headers={Cookie:['wskey = "synthetic_wskey=="; pin = "test%20one"','wskey=synthetic_wskey==; pin=test%20one']};
  assert.deepEqual(c.capture({url:'https://blackhole.m.jd.com/getinfo',headers},now),
    {version:1,wskey:'synthetic_wskey==',pin:'test%20one',capturedAt:now});
});

test('capture rejects ambiguous or invalid credentials even beside ignored metadata',()=>{
  const bad=[
    ['wskey=synthetic_one; wskey=synthetic_two','COOKIE_CONFLICT'],
    ['wskey=synthetic_one; pin=first; pin=second','COOKIE_CONFLICT'],
    ['wskey=','WSKEY_FORMAT'],['wskey','CAPTURE_COOKIE_FORMAT'],
    ['wskey="synthetic_one','WSKEY_FORMAT'],['wskey=synthetic bad','WSKEY_FORMAT'],
    ['wskey=synthetic_one; pin=','PIN_FORMAT'],['wskey=synthetic_one; pin=%ZZ','PIN_FORMAT'],
    ['wskey=synthetic_one; pin="test','PIN_FORMAT'],['wskey=synthetic_one; pin=%0d','PIN_FORMAT']
  ];
  for(const [cookie,code] of bad)assert.throws(()=>c.capture({url:'https://blackhole.m.jd.com/getinfo',headers:{Cookie:'3device=value; '+cookie}},now),{code});
  assert.throws(()=>c.capture({url:'https://blackhole.m.jd.com/getinfo',headers:{Cookie:'wskey=synthetic_one',COOKIE:'wskey=synthetic_two'}},now),{code:'COOKIE_CONFLICT'});
});

test('capture rejects non-string, oversized and control-bearing headers before extraction',()=>{
  for(const Cookie of [17,null,{wskey:'synthetic_wskey'},['wskey=synthetic_wskey',17],
    'wskey=synthetic_wskey; x='+ 'a'.repeat(32768), 'wskey=synthetic_wskey\r\nx-header:value',
    'wskey=synthetic_wskey; x=\x00', 'wskey=synthetic_wskey; x=\x1f'])
    assert.throws(()=>c.capture({url:'https://blackhole.m.jd.com/getinfo',headers:{Cookie}},now),{code:'CAPTURE_COOKIE_FORMAT'});
});

test('Set-Cookie parses arrays, newlines and combined Expires commas',()=>{
  for(const headers of [
    {'set-cookie':['pt_key=synthetic_key; Path=/; Secure','pt_pin=test%20one; Domain=.jd.com; HttpOnly']},
    {'Set-Cookie':'pt_key=synthetic_key; Expires=Wed, 01 Jan 2031 00:00:00 GMT, pt_pin=test%20one; Path=/'},
    {'set-cookie':'pt_key=synthetic_key; Path=/\r\npt_pin=test%20one; Path=/'},
    {'set-cookie':'pt_key=synthetic_key; Path=/','SET-COOKIE':'pt_pin=test%20one; Path=/'}
  ])assert.deepEqual(c.parseSetCookie(headers,now),{userName:'test one',cookie:'pt_key=synthetic_key; pt_pin=test%20one;'});
});
test('missing, expired, conflicting and fake cookies are rejected',()=>{
  for(const raw of [
    'pt_pin=test', 'pt_key=fake_key; Path=/, pt_pin=test', 'pt_key=synthetic_key; Max-Age=0, pt_pin=test',
    'pt_key=synthetic_key; Expires=Wed, 01 Jan 2020 00:00:00 GMT, pt_pin=test',
    'pt_key=synthetic_key; Domain=evil.invalid, pt_pin=test',
    'pt_key=synthetic_key, pt_key=another_key, pt_pin=test', 'pt_key=synthetic_key, pt_key=, pt_pin=test',
    'pt_key=synthetic_key, pt_pin=%ZZ', 'pt_key=synthetic_key, pt_pin=%0d'
  ])assert.throws(()=>c.parseSetCookie({'set-cookie':raw},now));
});
test('token and account checks never infer success from missing fields',()=>{
  for(const tokenKey of [null,'xxx','fakeabcdefgh','https://evil.invalid','x'.repeat(8200)])assert.throws(()=>c.tokenFrom({tokenKey}));
  assert.throws(()=>c.loginValid({retcode:0,data:{userInfo:{baseInfo:{curPin:'different'}}}},{userName:'test'}),{code:'ACCOUNT_MISMATCH'});
  assert.throws(()=>c.loginValid({code:0},{userName:'test'}),{code:'LOGIN_UNCONFIRMED'});
});
test('HTTPS capabilities disable redirects, cookies and insecure TLS; credentials separated by route',()=>{
  const input={uuid:'0123456789abcdef',st:now,sv:'111',wskey:'synthetic_wskey',token:'synthetic_token',cookie:'pt_key=synthetic_key; pt_pin=test;'};
  const token=c.options('token',input),jump=c.options('jump',input),valid=c.options('validate',input);
  for(const o of [token,jump,valid]){assert.match(o.url,/^https:\/\//);assert.equal(o.insecure,false);assert.equal(o['auto-redirect'],false);assert.equal(o['auto-cookie'],false);}
  assert.equal(jump.headers.Cookie,undefined);
  assert.ok(!valid.headers.Cookie.includes('wskey'));assert.ok(!token.headers.Cookie.includes('pt_key'));
  assert.throws(()=>c.options('request_algo',input),{code:'ENDPOINT_NOT_ALLOWED'});
  assert.throws(()=>c.options('token',{...input,wskey:'synthetic\r\nx-header:evil'}));
});
