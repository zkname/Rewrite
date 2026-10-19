// Synchronous local capture, status and clear; deliberately has no HTTP capability.
export function runWskeyWorkflow(core, env) {
  'use strict';
  const keys = {capture:'jdAppWskeyCaptureV1',observation:'jdAppWskeyObservationV1',notice:'jdAppWskeyNoticeV1',status:'jdAppWskeyStatusV1'};
  const codes = new Set(['APP_NOT_SEEN','APP_NO_COOKIE','APP_NO_WSKEY','APP_CAPTURED','APP_WSKEY_ONLY','APP_EXPIRED','APP_CLEARED',
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
  const report = (code,c,automatic=false,force=false) => {
    const t = now(), observation = read(keys.observation);
    core.check(codes.has(code) && (!observation || (codes.has(observation.code) && Number.isSafeInteger(observation.at))),'STORAGE_FORMAT');
    save(keys.status,{mode:'app-wskey',status:code,at:t,lastRequest:observation?.code || 'APP_NOT_SEEN',
      lastRequestAt:observation?.at ?? null,capturedAt:c?.capturedAt ?? null,hasPin:c ? c.credential.userName !== null : false,
      credentialValidation:'not-performed'});
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
      for (const key of [keys.capture,keys.observation,keys.notice]) save(key,null);
      report('APP_CLEARED',null);return {status:'APP_CLEARED'};
    }
    // Expiry is checked on execution; Loon storage provides no background expiry.
    let previous = candidate();const expired = previous && !fresh(previous,t);
    if (expired) { save(keys.capture,null);previous = null; }
    if (env.request) {
      const result = core.capture(env.request);
      save(keys.observation,{code:result.code,at:t,host:result.host});
      if (!result.credential) { report(result.code,previous,true);return {status:result.code}; }
      const c = {version:1,capturedAt:t,credential:result.credential};
      save(keys.capture,c);
      report(result.code,c,true,previous?.credential.cookie !== c.credential.cookie);
      return {status:result.code};
    }
    core.check(env.mode === 'status','MODE_REQUIRED');
    const observation = read(keys.observation);
    let code = previous ? (previous.credential.userName === null ? 'APP_WSKEY_ONLY' : 'APP_CAPTURED')
      : expired ? 'APP_EXPIRED' : observation?.code || 'APP_NOT_SEEN';
    if (!previous && ['APP_CAPTURED','APP_WSKEY_ONLY'].includes(code)) code = 'APP_EXPIRED';
    report(code,previous);return {status:code};
  } catch (error) {
    const code = codes.has(error?.code) ? error.code : 'INTERNAL_ERROR';
    if (env.request) { try { save(keys.observation,{code,at:now()}); } catch (_) {} }
    try { report(code,null,!!env.request); } catch (_) { try { env.notify(code); } catch (_) {} }
    return {status:'failed',code};
  } finally { env.done({}); }
}
