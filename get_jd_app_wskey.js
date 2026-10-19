/* 京东App WSKEY 本地抓取。Generated; see jd-wskey-local/README.md.
 * No network calls, conversion, scheduled renewal or uploads. Real-device compatibility pending.
 */
(function () {
'use strict';
// Parse each App request independently; pairing is explicitly unverified. No network or storage.
function createWskeyCore() {
  'use strict';
  function check(value, code) { if (!value) { const e = new Error(code);e.code = code;throw e; } }
  function pinIdentity(pin) {
    check(typeof pin === 'string' && /^[\x21-\x7e]{1,1024}$/.test(pin) && !/[;,"\\]/.test(pin),'PIN_FORMAT');
    let value;try { value = decodeURIComponent(pin); } catch (_) { check(false,'PIN_FORMAT'); }
    check(value && !/[\x00-\x1f\x7f]/.test(value),'PIN_FORMAT');return value;
  }
  function fromHeaders(headers) {
    check(headers && typeof headers === 'object' && !Array.isArray(headers),'HEADER_FORMAT');
    const raw = Object.keys(headers).filter(k => k.toLowerCase() === 'cookie')
      .flatMap(k => Array.isArray(headers[k]) ? headers[k] : [headers[k]]);
    if (!raw.length) return {code:'APP_NO_COOKIE',credential:null};
    check(raw.every(v => typeof v === 'string' && v.length <= 32768),'COOKIE_FORMAT');
    const text = raw.join('; '), fields = Object.create(null);
    check(text.length <= 32768 && !/[\x00-\x08\x0a-\x1f\x7f]/.test(text),'COOKIE_FORMAT');
    for (const item of text.split(';')) {
      const index = item.indexOf('='), name = (index < 0 ? item : item.slice(0,index)).trim();
      if (name !== 'wskey' && name !== 'pin' && name !== 'pt_pin') continue;
      check(index >= 0,'COOKIE_FORMAT');let value = item.slice(index + 1).trim();
      if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1,-1);
      check(!Object.prototype.hasOwnProperty.call(fields,name) || fields[name] === value,'COOKIE_CONFLICT');fields[name] = value;
    }
    const has=name=>Object.prototype.hasOwnProperty.call(fields,name);
    const hasPin=has('pin')||has('pt_pin'),pinValue=has('pt_pin')?fields.pt_pin:fields.pin;
    const pin=hasPin?{value:pinValue,userName:pinIdentity(pinValue)}:null;
    if(has('pin')&&has('pt_pin'))check(pinIdentity(fields.pin)===pin.userName,'COOKIE_CONFLICT');
    if (!has('wskey')) return {code:pin?'APP_PIN_CAPTURED':'APP_NO_WSKEY',credential:null,pin};
    check(/^[A-Za-z0-9._~+/=-]{8,4096}$/.test(fields.wskey) && !/^(fake|deleted|null|undefined|xxx)/i.test(fields.wskey),'WSKEY_FORMAT');
    return {code:hasPin ? 'APP_CAPTURED' : 'APP_WSKEY_ONLY',credential:{
      userName:pin?.userName??null,cookie:(hasPin ? 'pt_pin=' + pin.value + '; ' : '') + 'wskey=' + fields.wskey + ';',identity:'unverified'
    },pin};
  }
  function capture(request) {
    check(typeof request?.url === 'string' && request.url.length <= 8192 && !/[\s\x00-\x1f\x7f]/.test(request.url),'CAPTURE_URL');
    const match = /^https:\/\/(?:(blackhole\.m\.jd\.com|perf\.m\.jd\.com)(?:[/?#]|$)|(sh\.jd\.com)\/j\/[A-Za-z0-9_-]+(?:[?#]|$)|(mars\.jd\.com)\/log\/sdk\/v2(?:[?#]|$))/.exec(request.url);
    check(match,'CAPTURE_URL');return {...fromHeaders(request.headers),host:match[1] || match[2] || match[3]};
  }
  function validCredential(value) {
    check(value && value.identity === 'unverified' && typeof value.cookie === 'string','STORAGE_FORMAT');
    const normalized = fromHeaders({Cookie:value.cookie}).credential;
    // Accept only the exact previous output format for migration, not arbitrary Cookie text.
    check(normalized && normalized.userName === value.userName &&
      (normalized.cookie === value.cookie || normalized.cookie.replace(/^pt_pin=/,'pin=') === value.cookie),'STORAGE_FORMAT');return normalized;
  }
  function wskeyValue(credential) {
    const normalized=validCredential(credential);return /(?:^|; )wskey=([^;]+);$/.exec(normalized.cookie)[1];
  }
  return Object.freeze({check,pinIdentity,fromHeaders,capture,validCredential,wskeyValue});
}

// No network capability. Independent V2 records isolate older plugins and writers.
function runWskeyWorkflow(core, env) {
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

// Every intercepted request is forwarded unchanged, even on local storage failure.
(function () {
  'use strict';let finished = false;
  const done = () => { if (!finished) { finished = true;$done({}); } };
  const messages = {
    APP_CAPTURED:'已在同一请求抓到 wskey 和账号，保存为 pt_pin 与 wskey，尚未校验有效性。请在 BoxJs“京东App WSKEY”查看，仅保存在本机。',
    APP_WSKEY_ONLY:'已抓到 wskey，等待同次使用 App 时请求携带 pt_pin（兼容 pin）。pin_hash 不能代替账号；两项到齐后本地合并。',
    APP_PIN_CAPTURED:'已抓到账号字段，将保存为 pt_pin，等待 wskey。请在十五分钟内保持同一账号使用 App。',
    APP_MERGED_UNVERIFIED:'已合并保存 pt_pin 和 wskey，请在 BoxJs“京东App WSKEY”的“合并结果”查看。这是跨请求合并，尚未核验归属同一账号。',
    APP_NOT_SEEN:'尚未触发 App 抓取。请检查插件、MitM 和证书信任，再查看 blackhole、perf、sh 或 mars 的匹配请求。',
    APP_NO_COOKIE:'已触发 App 抓取，但这个请求没有 Cookie。可继续正常使用 App，稍后手动查看抓取状态。',
    APP_NO_WSKEY:'已触发 App 抓取，但这个请求的 Cookie 没有 wskey。若后续一直没有，请核对实际携带 wskey 的请求是否属于插件匹配入口。',
    APP_PAIR_CHANGED:'已抓到两个字段，但观察到账号或 wskey 变化，暂停合并。保持同一账号重新触发两类请求；原始字段仍在本机。',
    APP_BUSY:'请求正在交错写入，原始字段已分别保存。稍后运行“京东App抓取状态”重新合并。',
    APP_EXPIRED:'本地暂存已超过十五分钟或设备时间发生回退，已停止用于合并。请重新捕获或清除暂存；这不是京东返回的失效结论。',
    APP_CLEARED:'已清除本插件暂存的 wskey、账号字段、合并结果和请求记录。',
    STORAGE_WRITE_FAILED:'本地保存失败，未完成抓取。请检查 Loon 存储后重试。',
    STORAGE_FORMAT:'本地数据格式异常。可运行“京东App清除暂存”后重新捕获。',
    MODE_REQUIRED:'请运行“京东App抓取状态”或“京东App清除暂存”。'
  };
  try {
    runWskeyWorkflow(createWskeyCore(),{
      request:typeof $request === 'undefined' ? null : $request,
      mode:typeof $argument === 'string' ? $argument : '',now:() => Date.now(),
      read:key => $persistentStore.read(key),write:(value,key) => $persistentStore.write(value,key),
      notify:code => $notification.post('京东App WSKEY',code,messages[code] || '抓取未完成：' + code),done
    });
  } finally { done(); }
})();

})();
