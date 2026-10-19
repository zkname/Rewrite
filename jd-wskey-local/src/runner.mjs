// No network capability. Independent V2 records isolate older plugins and writers.
export function runWskeyWorkflow(core, env) {
  'use strict';
  const keys = {capture:'jdAppWskeyCaptureV2',pin:'jdAppPinCaptureV2',merged:'jdAppWskeyMergedV2',
    observation:'jdAppWskeyObservationV2',notice:'jdAppWskeyNoticeV2',status:'jdAppWskeyStatusV2',generation:'jdAppWskeyGenerationV2'};
  const codes = new Set(['APP_NOT_SEEN','APP_NO_COOKIE','APP_NO_WSKEY','APP_CAPTURED','APP_WSKEY_ONLY','APP_PIN_CAPTURED',
    'APP_MERGED_UNVERIFIED','APP_PAIR_CHANGED','APP_BUSY','APP_EXPIRED','APP_CLEARED','HEADER_FORMAT','COOKIE_FORMAT',
    'COOKIE_CONFLICT','WSKEY_FORMAT','PIN_FORMAT','CAPTURE_URL','STORAGE_FORMAT','STORAGE_WRITE_FAILED','CLOCK_INVALID','MODE_REQUIRED','INTERNAL_ERROR']);
  const read = key => {
    const raw=env.read(key);if(!raw)return null;
    core.check(typeof raw==='string'&&raw.length<=65536,'STORAGE_FORMAT');
    try{return JSON.parse(raw);}catch(_){core.check(false,'STORAGE_FORMAT');}
  };
  const save=(key,value)=>core.check(env.write(JSON.stringify(value),key)===true,'STORAGE_WRITE_FAILED');
  const now=()=>{const t=env.now();core.check(Number.isSafeInteger(t)&&t>=0,'CLOCK_INVALID');return t;};
  // Non-secret random event labels, not authentication tokens or locks.
  const id=()=>now().toString(36)+':'+(env.random||Math.random)().toString(36).slice(2);
  const generation=()=>{const g=read(keys.generation);core.check(g===null||(typeof g==='string'&&g.length<=100),'STORAGE_FORMAT');return g||'initial';};
  const fresh=(r,t)=>r&&t>=r.capturedAt&&t-r.capturedAt<900000;
  let started=null;
  const field=(key,g)=>{
    try{
      const r=read(key);if(!r)return {record:null};
      core.check(r.version===2&&typeof r.generation==='string','STORAGE_FORMAT');
      if(r.generation!==g)return {record:null};
      core.check(Number.isSafeInteger(r.capturedAt)&&r.capturedAt>=0&&typeof r.event==='string'&&r.event.length<=100&&
        (r.blockedPeer===null||typeof r.blockedPeer==='string'),'STORAGE_FORMAT');
      if(key===keys.capture)core.validCredential(r.credential);
      else core.check(core.pinIdentity(r.value)===r.userName,'STORAGE_FORMAT');
      return {record:r};
    }catch(_){return {record:null,error:'STORAGE_FORMAT'};}
  };
  const snapshot=()=>{
    const g=generation(),c=field(keys.capture,g),p=field(keys.pin,g),t=now();
    return {generation:g,c:c.record,p:p.record,t,error:c.error||p.error||null};
  };
  const stamp=s=>JSON.stringify([s.generation,s.c,s.p,s.error]);
  const derive=s=>{
    const c=fresh(s.c,s.t)?s.c:null,p=fresh(s.p,s.t)?s.p:null;
    let merged=null,code='APP_NOT_SEEN';
    if(c&&p){
      if((c.credential.userName!==null&&c.credential.userName!==p.userName)||c.blockedPeer===p.event||p.blockedPeer===c.event)code='APP_PAIR_CHANGED';
      else{
        merged={version:2,generation:s.generation,userName:p.userName,cookie:'pt_pin='+p.value+'; wskey='+core.wskeyValue(c.credential)+';',
          identity:c.credential.userName===null?'cross-request-unverified':'same-request-unverified',
          wskeyEvent:c.event,pinEvent:p.event,wskeyCapturedAt:c.capturedAt,pinCapturedAt:p.capturedAt,
          expiresAt:Math.min(c.capturedAt,p.capturedAt)+900000};
        code=c.credential.userName===null?'APP_MERGED_UNVERIFIED':'APP_CAPTURED';
      }
    }else if(c)code='APP_WSKEY_ONLY';
    else if(p)code='APP_PIN_CAPTURED';
    else if(s.c||s.p)code='APP_EXPIRED';
    if(s.error)code=s.error;
    return {...s,c,p,merged,code};
  };
  // A stale read may not erase a freshly published pair. Re-read after each view
  // write and repair it when another capture interleaves. This is not a CAS lock.
  const reconcile=()=>{
    for(let attempt=0;attempt<4;attempt++){
      const before=snapshot();
      const state=derive(before);
      if(stamp(snapshot())!==stamp(before))continue;
      save(keys.merged,state.merged);
      const after=snapshot();
      if(stamp(after)===stamp(before)&&!!fresh(before.c,after.t)===!!state.c&&!!fresh(before.p,after.t)===!!state.p)
        return {...state,sourceStamp:stamp(before),code:before.generation===started?state.code:'APP_CLEARED'};
    }
    return {...derive(snapshot()),code:'APP_BUSY'};
  };
  const report=(code,state,automatic=false,force=false)=>{
    const original=code;
    for(let attempt=0;attempt<4;attempt++){
      if(started!==null)state=reconcile();
      const observation=read(keys.observation);
      core.check(codes.has(original)&&(!observation||(codes.has(observation.code)&&Number.isSafeInteger(observation.at))),'STORAGE_FORMAT');
      code=original;
      if(original.startsWith('APP_')&&original!=='APP_CLEARED'&&state){
        code=state.code==='APP_NOT_SEEN'?observation?.code||'APP_NOT_SEEN':state.code;
        if(state.code==='APP_NOT_SEEN'&&['APP_CAPTURED','APP_WSKEY_ONLY','APP_PIN_CAPTURED'].includes(code))code='APP_EXPIRED';
      }
      save(keys.status,{mode:'app-wskey',storageVersion:2,status:code,at:now(),lastRequest:observation?.code||'APP_NOT_SEEN',
        lastRequestAt:observation?.at??null,capturedAt:state?.c?.capturedAt??null,pinCapturedAt:state?.p?.capturedAt??null,
        hasWskey:!!state?.c,hasPin:!!state?.p,mergeStatus:code==='APP_BUSY'?'busy':state?.merged?'unverified':'waiting',credentialValidation:'not-performed'});
      if(started===null||state.code==='APP_BUSY'||stamp(snapshot())===state.sourceStamp)break;
      if(attempt===3){code='APP_BUSY';save(keys.status,{mode:'app-wskey',storageVersion:2,status:code,at:now(),mergeStatus:'busy',credentialValidation:'not-performed'});}
    }
    const t=now();
    if(automatic){
      const previous=read(keys.notice);
      if(!force&&previous?.code===code&&Number.isSafeInteger(previous.at)&&t>=previous.at&&t-previous.at<60000)return code;
      save(keys.notice,{code,at:t});
    }
    env.notify(code);
    return code;
  };
  try{
    const t=now();
    if(!env.request&&env.mode==='clear'){
      // Revoke in-flight records first. Explicit clear is the only raw-data deletion.
      save(keys.generation,id());
      for(const key of [keys.capture,keys.pin,keys.merged,keys.observation,keys.notice])save(key,null);
      for(const key of ['jdAppWskeyCaptureV1','jdAppPinCaptureV1','jdAppWskeyMergedV1','jdAppWskeyObservationV1','jdAppWskeyNoticeV1','jdAppWskeyStatusV1'])save(key,null);
      report('APP_CLEARED',null);return {status:'APP_CLEARED'};
    }
    started=generation();
    let result=null,force=false;
    if(env.request){
      result=core.capture(env.request);
      const before=snapshot(),c=fresh(before.c,t)?before.c:null,p=fresh(before.p,t)?before.p:null,event=id();
      if(before.generation!==started)return {status:'APP_CLEARED'};
      if(result.credential){
        const changed=c&&core.wskeyValue(c.credential)!==core.wskeyValue(result.credential);
        force=!c||c.credential.cookie!==result.credential.cookie;
        const blockedPeer=result.pin?null:changed?p?.event||null:c?.blockedPeer||null;
        // Each request writes only fields it actually carries. No peer cleanup.
        save(keys.capture,{version:2,generation:started,event,blockedPeer,capturedAt:t,credential:result.credential});
      }
      if(generation()!==started)return {status:'APP_CLEARED'};
      if(result.pin){
        const changed=(p&&p.userName!==result.pin.userName)||(c?.credential.userName!=null&&c.credential.userName!==result.pin.userName);
        force=force||!p||p.userName!==result.pin.userName;
        const blockedPeer=result.credential?null:changed?c?.event||null:p?.blockedPeer||null;
        save(keys.pin,{version:2,generation:started,event,blockedPeer,capturedAt:t,value:result.pin.value,userName:result.pin.userName});
      }
      if(generation()!==started)return {status:'APP_CLEARED'};
      save(keys.observation,{code:result.code,at:t,host:result.host});
    }else core.check(env.mode==='status','MODE_REQUIRED');
    const state=reconcile();
    core.check(!state.error,'STORAGE_FORMAT');
    let code=state.code;
    if(code==='APP_NOT_SEEN'){
      code=result?.code||read(keys.observation)?.code||code;
      if(['APP_CAPTURED','APP_WSKEY_ONLY','APP_PIN_CAPTURED'].includes(code))code='APP_EXPIRED';
    }
    code=report(code,state,!!env.request,force);return {status:code};
  }catch(error){
    const code=codes.has(error?.code)?error.code:'INTERNAL_ERROR';
    // An unrelated malformed request must never delete either captured field.
    let state=null;
    try{if(started!==null&&generation()===started)state=reconcile();}catch(_){}
    if(env.request){try{save(keys.observation,{code,at:now()});}catch(_){}}
    try{report(code,state,!!env.request);}catch(_){try{env.notify(code);}catch(_){}}
    return {status:'failed',code};
  }finally{env.done({});}
}
