import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../get_jd_app_wskey.js',import.meta.url),'utf8');

test('bundled concurrent invocations repair stale reads and late merged writes',()=>{
  for(const reverse of [false,true])for(const boundary of ['read','write']){
    const store=new Map(),messages=[];let ends=0,triggered=false,nested=false;
    const requests=[{url:'https://sh.jd.com/j/Synthetic',headers:{Cookie:'wskey=synthetic_secret'}},
      {url:'https://mars.jd.com/log/sdk/v2',headers:{Cookie:'pt_pin=synthetic_user'}}];
    if(reverse)requests.reverse();
    function execute(request){
      const sandbox={$request:request,$persistentStore:{
        read:key=>{const old=store.get(key);if(!nested&&!triggered&&boundary==='read'&&key==='jdAppWskeyCaptureV2')interleave();return old;},
        write:(value,key)=>{if(!nested&&!triggered&&boundary==='write'&&key==='jdAppWskeyMergedV2')interleave();store.set(key,value);return true;}},
        $notification:{post:(...values)=>messages.push(values)},$done:value=>{assert.deepEqual(Object.keys(value),[]);ends++;}};
      for(const name of ['$httpClient','$task','fetch','WebSocket','XMLHttpRequest','require','process','console','setTimeout'])
        Object.defineProperty(sandbox,name,{get(){assert.fail('Forbidden capability '+name);}});
      new vm.Script(source).runInContext(vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:false}}),{timeout:1000});
    }
    function interleave(){triggered=true;nested=true;execute(requests[1]);nested=false;}
    execute(requests[0]);assert.ok(triggered);assert.equal(ends,2);
    assert.equal(JSON.parse(store.get('jdAppWskeyMergedV2')).cookie,'pt_pin=synthetic_user; wskey=synthetic_secret;');
    assert.equal(JSON.parse(store.get('jdAppWskeyStatusV2')).hasWskey,true);
    assert.doesNotMatch(JSON.stringify(messages),/synthetic/);
  }
});
for(const kind of ['complete','pt-pin-complete','key-only','sh-key-only','no-cookie','no-key','status','clear','storage-false','storage-throw','notify-throw','header-throw'])
  test('bundled '+kind+' has no network/process capabilities, no leaks and one unchanged completion',()=>{
    const store=new Map(),messages=[];let done=0;
    const headers=kind==='no-cookie'?{}:{Cookie:kind==='no-key'?'tracking=x':kind==='key-only'?'wskey=synthetic_secret':'wskey=synthetic_secret; pin=synthetic_user'};
    if(kind==='pt-pin-complete')headers.Cookie='wskey=synthetic_secret; pt_pin=synthetic_user';
    if(kind==='sh-key-only')headers.Cookie='wskey=synthetic_secret; pin_hash=123456789; unionwsws={"jmafinger":"synthetic_fingerprint"}';
    if(kind==='header-throw')Object.defineProperty(headers,'Cookie',{enumerable:true,get(){throw Error('synthetic_secret');}});
    const url=kind==='sh-key-only'?'https://sh.jd.com/j/Synthetic_123?placeholder=0':'https://blackhole.m.jd.com/getinfo';
    Object.freeze(headers);const request=['status','clear'].includes(kind)?undefined:Object.freeze({url,headers});
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
    if(['complete','pt-pin-complete','key-only'].includes(kind))assert.ok(store.has('jdAppWskeyCaptureV2'));
    if(['complete','pt-pin-complete'].includes(kind)){
      assert.equal(JSON.parse(store.get('jdAppWskeyCaptureV2')).credential.cookie,'pt_pin=synthetic_user; wskey=synthetic_secret;');
      assert.equal(JSON.parse(store.get('jdAppWskeyMergedV2')).cookie,'pt_pin=synthetic_user; wskey=synthetic_secret;');
    }
    if(kind==='status')assert.equal(messages[0][1],'APP_NOT_SEEN');
    if(kind==='storage-false')assert.equal(messages[0][1],'STORAGE_WRITE_FAILED');
    if(kind==='sh-key-only'){
      assert.equal(messages[0][1],'APP_WSKEY_ONLY');
      const c=JSON.parse(store.get('jdAppWskeyCaptureV2')).credential;
      assert.equal(c.userName,null);assert.equal(c.cookie,'wskey=synthetic_secret;');
    }
  });

test('bundled separate sh wskey and perf/mars pin captures merge in either order without leaks',()=>{
  for(const pinURL of ['https://perf.m.jd.com/app_monitor/v3/report','https://mars.jd.com/log/sdk/v2']){
    for(const reverse of [false,true]){
      const store=new Map(),messages=[];let done=0;
      const requests=[
        Object.freeze({url:'https://sh.jd.com/j/Synthetic_123',headers:Object.freeze({Cookie:'wskey=synthetic_secret; pin_hash=123456789'})}),
        Object.freeze({url:pinURL,headers:Object.freeze({Cookie:Object.freeze(['pt_pin=synthetic_user','pt_key=synthetic_web'])})})
      ];
      if(reverse)requests.reverse();
      for(const request of requests){
        const before=JSON.stringify(request),sandbox={$request:request,
          $persistentStore:{read:k=>store.get(k),write:(v,k)=>{store.set(k,v);return true;}},
          $notification:{post:(...args)=>messages.push(args)},
          $done:v=>{assert.equal(Object.keys(v).length,0);done++;}};
        for(const name of ['$httpClient','$task','fetch','WebSocket','XMLHttpRequest','require','process','console','setTimeout'])
          Object.defineProperty(sandbox,name,{get(){assert.fail('Forbidden capability '+name);}});
        new vm.Script(source).runInContext(vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:false}}),{timeout:1000});
        assert.equal(JSON.stringify(request),before);
      }
      assert.equal(done,2);assert.equal(messages.at(-1)[1],'APP_MERGED_UNVERIFIED');
      const merged=JSON.parse(store.get('jdAppWskeyMergedV2'));
      assert.equal(merged.cookie,'pt_pin=synthetic_user; wskey=synthetic_secret;');
      assert.equal(merged.identity,'cross-request-unverified');
      assert.doesNotMatch(JSON.stringify(messages),/synthetic|123456789/);
      assert.doesNotMatch(JSON.stringify([...store.values()]),/synthetic_web|123456789/);
    }
  }
});
