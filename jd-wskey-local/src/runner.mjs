// Synchronous local capture, status and clear; deliberately has no HTTP capability.
export function runWskeyWorkflow(core, env) {
  'use strict';
  const keys = {capture:'jdAppWskeyCaptureV1',pin:'jdAppPinCaptureV1',merged:'jdAppWskeyMergedV1',
    observation:'jdAppWskeyObservationV1',notice:'jdAppWskeyNoticeV1',status:'jdAppWskeyStatusV1'};
  const codes = new Set(['APP_NOT_SEEN','APP_NO_COOKIE','APP_NO_WSKEY','APP_CAPTURED','APP_WSKEY_ONLY','APP_PIN_CAPTURED','APP_MERGED_UNVERIFIED','APP_EXPIRED','APP_CLEARED',
    'HEADER_FORMAT','COOKIE_FORMAT','COOKIE_CONFLICT','WSKEY_FORMAT','PIN_FORMAT','CAPTURE_URL','STORAGE_FORMAT',
    'STORAGE_WRITE_FAILED','CLOCK_INVALID','MODE_REQUIRED','INTERNAL_ERROR']);
  const read = key => {
    const raw = env.read(key);if (!raw) return null;
    core.check(typeof raw === 'string' && raw.length <= 65536,'STORAGE_FORMAT');
    try { return JSON.parse(raw); } catch (_) { core.check(false,'STORAGE_FORMAT'); }
  };
  const save = (key,value) => core.check(env.write(JSON.stringify(value),key) === true,'STORAGE_WRITE_FAILED');
  const now = () => { const t = env.now();core.check(Number.isSafeInteger(t) && t >= 0,'CLOCK_INVALID');return t; };
  const candidate = () => {
    const c = read(keys.capture);if (!c) return null;
    core.check(c.version === 1 && Number.isSafeInteger(c.capturedAt) && c.capturedAt >= 0,'STORAGE_FORMAT');
    core.validCredential(c.credential);return c;
  };
  const fresh = (c,t) => c && t >= c.capturedAt && t - c.capturedAt < 900000;
  const pinCandidate = () => {
    const p=read(keys.pin);if(!p)return null;
    core.check(p.version===1&&Number.isSafeInteger(p.capturedAt)&&p.capturedAt>=0,'STORAGE_FORMAT');
    core.check(core.pinIdentity(p.value)===p.userName,'STORAGE_FORMAT');return p;
  };
  const merge = (c,p,t) => {
    if(!fresh(c,t)||!fresh(p,t))return null;
    if(c.credential.userName!==null&&c.credential.userName!==p.userName)return null;
    return {version:1,userName:p.userName,cookie:'pt_pin='+p.value+'; wskey='+core.wskeyValue(c.credential)+';',
      identity:c.credential.userName===null?'cross-request-unverified':'same-request-unverified',
      wskeyCapturedAt:c.capturedAt,pinCapturedAt:p.capturedAt,expiresAt:Math.min(c.capturedAt,p.capturedAt)+900000};
  };
  const report = (code,c,automatic=false,force=false) => {
    const t = now(), observation = read(keys.observation);
    core.check(codes.has(code) && (!observation || (codes.has(observation.code) && Number.isSafeInteger(observation.at))),'STORAGE_FORMAT');
    save(keys.status,{mode:'app-wskey',status:code,at:t,lastRequest:observation?.code || 'APP_NOT_SEEN',
      lastRequestAt:observation?.at ?? null,capturedAt:c?.capturedAt ?? null,hasPin:!!read(keys.pin),
      mergeStatus:read(keys.merged)?'unverified':'waiting',credentialValidation:'not-performed'});
    if (automatic) {
      const previous = read(keys.notice);
      if (!force && previous?.code === code && Number.isSafeInteger(previous.at) && t >= previous.at && t - previous.at < 60000) return;
      save(keys.notice,{code,at:t});
    }
    env.notify(code);
  };
  try {
    const t = now();
    if (!env.request && env.mode === 'clear') {
      for (const key of [keys.capture,keys.pin,keys.merged,keys.observation,keys.notice]) save(key,null);
      report('APP_CLEARED',null);return {status:'APP_CLEARED'};
    }
    // Expiry is checked on execution; Loon storage provides no background expiry.
    let previous = candidate(),pin=pinCandidate();
    const expired = previous && !fresh(previous,t),pinExpired=pin&&!fresh(pin,t);
    if(expired||pinExpired)save(keys.merged,null);
    if (expired) { save(keys.capture,null);previous = null; }
    if(pinExpired){save(keys.pin,null);pin=null;}
    if(previous){
      const normalized=core.validCredential(previous.credential);
      if(normalized.cookie!==previous.credential.cookie){
        // Keep the capture time and identity; changing a field name does not refresh a credential.
        save(keys.merged,null);
        previous={version:1,capturedAt:previous.capturedAt,credential:normalized};save(keys.capture,previous);
      }
    }
    if (env.request) {
      const result = core.capture(env.request);
      save(keys.observation,{code:result.code,at:t,host:result.host});
      if(result.credential||result.pin)save(keys.merged,null);
      const oldCookie=previous?.credential.cookie,oldPin=pin?.userName;
      // Observed account or wskey changes invalidate the other side before pairing anew.
      if(result.credential&&previous&&core.wskeyValue(previous.credential)!==core.wskeyValue(result.credential)){
        save(keys.pin,null);pin=null;
      }
      if(result.pin&&((oldPin!==undefined&&oldPin!==result.pin.userName)||
          (previous?.credential.userName!=null&&previous.credential.userName!==result.pin.userName))&&!result.credential){
        save(keys.capture,null);previous=null;
      }
      if(result.credential){previous={version:1,capturedAt:t,credential:result.credential};save(keys.capture,previous);}
      if(result.pin){pin={version:1,capturedAt:t,value:result.pin.value,userName:result.pin.userName};save(keys.pin,pin);}
      const merged=merge(previous,pin,t);save(keys.merged,merged);
      const code=merged?.identity==='cross-request-unverified'?'APP_MERGED_UNVERIFIED':merged?'APP_CAPTURED':result.code;
      report(code,previous,true,(!!result.credential&&oldCookie!==result.credential.cookie)||(!!result.pin&&oldPin!==result.pin.userName));
      return {status:code};
    }
    core.check(env.mode === 'status','MODE_REQUIRED');
    const observation = read(keys.observation);
    const merged=merge(previous,pin,t);save(keys.merged,merged);
    let code = merged?.identity==='cross-request-unverified'?'APP_MERGED_UNVERIFIED':previous ? (previous.credential.userName === null ? 'APP_WSKEY_ONLY' : 'APP_CAPTURED')
      : pin?'APP_PIN_CAPTURED':expired||pinExpired ? 'APP_EXPIRED' : observation?.code || 'APP_NOT_SEEN';
    if (!previous&&!pin && ['APP_CAPTURED','APP_WSKEY_ONLY','APP_PIN_CAPTURED'].includes(code)) code = 'APP_EXPIRED';
    report(code,previous);return {status:code};
  } catch (error) {
    const code = codes.has(error?.code) ? error.code : 'INTERNAL_ERROR';
    if(['COOKIE_FORMAT','COOKIE_CONFLICT','PIN_FORMAT','WSKEY_FORMAT','STORAGE_FORMAT'].includes(code)){
      try{for(const key of [keys.capture,keys.pin,keys.merged])save(key,null);}catch(_){}
    }
    if (env.request) { try { save(keys.observation,{code,at:now()}); } catch (_) {} }
    try { report(code,null,!!env.request); } catch (_) { try { env.notify(code); } catch (_) {} }
    return {status:'failed',code};
  } finally { env.done({}); }
}
