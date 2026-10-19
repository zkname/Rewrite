import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../get_jd_app_wskey.js',import.meta.url),'utf8');
for(const kind of ['complete','key-only','no-cookie','no-key','status','clear','storage-false','storage-throw','notify-throw','header-throw'])
  test('bundled '+kind+' has no network/process capabilities, no leaks and one unchanged completion',()=>{
    const store=new Map(),messages=[];let done=0;
    const headers=kind==='no-cookie'?{}:{Cookie:kind==='no-key'?'tracking=x':kind==='key-only'?'wskey=synthetic_secret':'wskey=synthetic_secret; pin=synthetic_user'};
    if(kind==='header-throw')Object.defineProperty(headers,'Cookie',{enumerable:true,get(){throw Error('synthetic_secret');}});
    Object.freeze(headers);const request=['status','clear'].includes(kind)?undefined:Object.freeze({url:'https://blackhole.m.jd.com/getinfo',headers});
    const before=kind==='header-throw'?null:JSON.stringify(request);
    const sandbox={$request:request,$argument:kind==='clear'?'clear':'status',
      $persistentStore:{read:k=>store.get(k),write:(v,k)=>{
        if(kind==='storage-false')return false;if(kind==='storage-throw')throw Error('synthetic_secret');store.set(k,v);return true;}},
      $notification:{post:(...args)=>{if(kind==='notify-throw')throw Error('synthetic_secret');messages.push(args);}},
      $done:value=>{assert.equal(Object.keys(value).length,0);done++;}};
    for(const name of ['$httpClient','$task','fetch','WebSocket','XMLHttpRequest','require','process','console','setTimeout'])
      Object.defineProperty(sandbox,name,{get(){assert.fail('Forbidden capability '+name);}});
    new vm.Script(source).runInContext(vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:false}}),{timeout:1000});
    assert.equal(done,1);assert.doesNotMatch(JSON.stringify(messages),/synthetic/);
    if(kind!=='header-throw')assert.equal(JSON.stringify(request),before);
    if(['complete','key-only'].includes(kind))assert.ok(store.has('jdAppWskeyCaptureV1'));
    if(kind==='status')assert.equal(messages[0][1],'APP_NOT_SEEN');
    if(kind==='storage-false')assert.equal(messages[0][1],'STORAGE_WRITE_FAILED');
  });
