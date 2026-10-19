import test from 'node:test';
import assert from 'node:assert/strict';
import {createWskeyCore} from '../src/core.mjs';
import {runWskeyWorkflow} from '../src/runner.mjs';
const core=createWskeyCore(),epoch=1792340000000;
const keys={capture:'jdAppWskeyCaptureV2',pin:'jdAppPinCaptureV2',merged:'jdAppWskeyMergedV2',generation:'jdAppWskeyGenerationV2'};
const ws={url:'https://sh.jd.com/j/Synthetic',headers:{Cookie:'wskey=synthetic_key; pin_hash=123'}};
const pin={url:'https://mars.jd.com/log/sdk/v2',headers:{Cookie:['pt_pin=synthetic_user','pt_key=synthetic_web']}};
function harness(){
  const store=new Map(),messages=[];let hook=null,time=epoch,sequence=0;
  function operation(kind,key,action){
    hook?.('before',kind,key);const value=action();hook?.('after',kind,key);return value;
  }
  const f={store,messages,get:k=>JSON.parse(store.get(k)||'null'),time:t=>{time=t;},hook:h=>{hook=h;},
    run:(request=null,mode='status')=>{
      let ends=0;const before=JSON.stringify(request);
      const result=runWskeyWorkflow(core,{request,mode,now:()=>time,random:()=>++sequence/1000000,
        read:key=>operation('read',key,()=>store.get(key)),
        write:(value,key)=>operation('write',key,()=>{store.set(key,value);return true;}),
        notify:code=>messages.push(code),done:value=>{assert.deepEqual(value,{});ends++;}});
      assert.equal(ends,1);assert.equal(JSON.stringify(request),before);return result;
    }};
  return f;
}
function paired(f){
  assert.equal(f.get(keys.capture).credential.cookie,'wskey=synthetic_key;');
  assert.equal(f.get(keys.pin).value,'synthetic_user');
  assert.equal(f.get(keys.merged).cookie,'pt_pin=synthetic_user; wskey=synthetic_key;');
  assert.equal(f.get(keys.merged).identity,'cross-request-unverified');
  const status=f.get('jdAppWskeyStatusV2');assert.equal(status.hasWskey,true);assert.equal(status.hasPin,true);
  assert.doesNotMatch(JSON.stringify(f.messages),/synthetic|123/);
}
// Both sides of every store boundary, including a read returning a stale value.
for(const [name,outer,inner] of [['pin then wskey',pin,ws],['wskey then pin',ws,pin]]){
  const baseline=harness(),points=[];baseline.hook((phase,kind,key)=>points.push({phase,kind,key}));baseline.run(outer);
  for(let at=0;at<points.length;at++)test('interleave '+name+' '+at+' '+Object.values(points[at]).join(' '),()=>{
    const f=harness();let index=0,hit=false;
    f.hook(()=>{if(index++===at){hit=true;f.hook(null);f.run(inner);}});
    f.run(outer);assert.ok(hit);paired(f);
  });
}
test('expired snapshot cannot erase a fresh wskey captured before that read returns',()=>{
  const f=harness();f.run(ws);f.time(epoch+900000);let hit=false;
  f.hook((phase,kind,key)=>{if(phase==='after'&&kind==='read'&&key===keys.capture){hit=true;f.hook(null);f.run(ws);}});
  f.run(pin);assert.ok(hit);paired(f);assert.equal(f.get(keys.capture).capturedAt,epoch+900000);
});
test('malformed or unrelated requests cannot delete raw wskey, pin or a valid pair',()=>{
  const f=harness();f.run(ws);f.run(pin);
  for(const cookie of ['pt_pin=','pt_pin=%ZZ','wskey=short','pt_pin=one; pt_pin=two','pt_pin=one; pin=two','wskey=synthetic_key\r\nx: y']){
    assert.equal(f.run({...pin,headers:{Cookie:cookie}}).status,'failed');paired(f);
  }
  f.run({...pin,headers:{Cookie:'tracking=one'}});paired(f);
});
test('V1 migration and deletion by an older plugin cannot touch V2 captures',()=>{
  const f=harness();f.run(ws);
  // V1 writes/deletes performed by old bundles; normal V2 runs never read V1.
  for(const key of ['jdAppWskeyCaptureV1','jdAppPinCaptureV1','jdAppWskeyMergedV1'])f.store.set(key,'legacy broken data');
  f.run(pin);paired(f);
  for(const key of ['jdAppWskeyCaptureV1','jdAppPinCaptureV1','jdAppWskeyMergedV1'])f.store.set(key,'null');
  f.run();paired(f);
});
test('old records are not implicitly migrated or exposed by a V2 status invocation',()=>{
  const f=harness();f.store.set('jdAppWskeyCaptureV1','legacy broken data');
  assert.equal(f.run().status,'APP_NOT_SEEN');assert.equal(f.get(keys.capture),null);
  assert.equal(f.store.get('jdAppWskeyCaptureV1'),'legacy broken data');
});
test('corrupted peer storage does not prevent saving a newly captured wskey',()=>{
  const f=harness();f.store.set(keys.pin,'broken JSON');
  assert.equal(f.run(ws).code,'STORAGE_FORMAT');assert.equal(f.get(keys.capture).credential.cookie,'wskey=synthetic_key;');
  assert.equal(f.get(keys.merged),null);f.run(pin);paired(f);
});
test('account and wskey refreshes resume pairing only after the peer is observed again',()=>{
  const f=harness();f.run(ws);f.run(pin);
  const changed={...pin,headers:{Cookie:'pt_pin=second'}};
  assert.equal(f.run(changed).status,'APP_PAIR_CHANGED');assert.ok(f.get(keys.capture));assert.equal(f.get(keys.merged),null);
  f.run(changed);assert.equal(f.get(keys.merged),null);
  f.run(ws);assert.equal(f.get(keys.merged).userName,'second');
  assert.equal(f.run({...ws,headers:{Cookie:'wskey=synthetic_changed'}}).status,'APP_PAIR_CHANGED');
  assert.ok(f.get(keys.pin));f.run(changed);assert.equal(f.get(keys.merged).cookie,'pt_pin=second; wskey=synthetic_changed;');
});
test('expiry does not get refreshed by status, and independent fresh fields still merge',()=>{
  const f=harness();f.run(ws);f.run(pin);f.time(epoch+900000);
  assert.equal(f.run().status,'APP_EXPIRED');assert.equal(f.get(keys.merged),null);
  assert.equal(f.get(keys.capture).capturedAt,epoch);f.run(ws);assert.equal(f.get(keys.merged),null);
  f.run(pin);paired(f);
});
test('clear revokes a capture even if its raw write resumes after clear completed',()=>{
  const f=harness();f.run(pin);
  f.hook((phase,kind,key)=>{if(phase==='before'&&kind==='write'&&key===keys.capture){f.hook(null);f.run(null,'clear');}});
  assert.equal(f.run(ws).status,'APP_CLEARED');
  // A write can finish late without CAS, but its generation is revoked.
  assert.notEqual(f.get(keys.capture)?.generation,f.get(keys.generation));
  f.run(pin);assert.equal(f.get(keys.merged),null);
  f.run(null,'clear');for(const key of [keys.capture,keys.pin,keys.merged])assert.equal(f.get(key),null);
});
test('merged-write failure never reports successful capture and preserves both raw fields',()=>{
  const f=harness();f.run(ws);let done=0;
  const r=runWskeyWorkflow(core,{request:pin,now:()=>epoch,read:k=>f.store.get(k),
    write:(v,k)=>{if(k===keys.merged)return false;f.store.set(k,v);return true;},notify:()=>{},done:()=>done++});
  assert.equal(r.code,'STORAGE_WRITE_FAILED');assert.equal(done,1);assert.ok(f.get(keys.capture));assert.ok(f.get(keys.pin));
  f.run();paired(f);
});

const clearBaseline=harness(),clearPoints=[];clearBaseline.run(ws);clearBaseline.run(pin);
clearBaseline.hook((phase,kind,key)=>clearPoints.push({phase,kind,key}));clearBaseline.run(ws);
for(let at=0;at<clearPoints.length;at++)test('clear during capture boundary '+at+' '+Object.values(clearPoints[at]).join(' '),()=>{
  const f=harness();f.run(ws);f.run(pin);let index=0;
  f.hook(()=>{if(index++===at){f.hook(null);f.run(null,'clear');}});
  f.run(ws);
  // At most an independent wskey capture survives if it began after clear.
  assert.equal(f.get(keys.merged),null);
  f.run();assert.equal(f.get(keys.merged),null);
});

test('bounded reconciliation reports busy during sustained changes and recovers on manual status',()=>{
  const f=harness();f.run(ws);f.run(pin);let changes=0;
  f.hook((phase,kind,key)=>{
    if(phase==='after'&&kind==='read'&&key===keys.pin){
      const record=f.get(keys.pin);record.event='synthetic-burst-'+(++changes);f.store.set(keys.pin,JSON.stringify(record));
    }
  });
  assert.equal(f.run().status,'APP_BUSY');assert.ok(changes<100);assert.ok(f.get(keys.capture));
  f.hook(null);assert.equal(f.run().status,'APP_MERGED_UNVERIFIED');paired(f);
});
