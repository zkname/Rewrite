/* 京东App WSKEY 本地抓取。Generated; see jd-wskey-local/README.md.
 * No network calls, conversion, scheduled renewal or uploads. Real-device compatibility pending.
 */
(function () {
'use strict';
// Pure parsing of credentials from one App request. No network or storage.
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
      if (name !== 'wskey' && name !== 'pin') continue;
      check(index >= 0,'COOKIE_FORMAT');let value = item.slice(index + 1).trim();
      if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1,-1);
      check(!Object.prototype.hasOwnProperty.call(fields,name) || fields[name] === value,'COOKIE_CONFLICT');fields[name] = value;
    }
    if (!Object.prototype.hasOwnProperty.call(fields,'wskey')) return {code:'APP_NO_WSKEY',credential:null};
    check(/^[A-Za-z0-9._~+/=-]{8,4096}$/.test(fields.wskey) && !/^(fake|deleted|null|undefined|xxx)/i.test(fields.wskey),'WSKEY_FORMAT');
    const hasPin = Object.prototype.hasOwnProperty.call(fields,'pin'), userName = hasPin ? pinIdentity(fields.pin) : null;
    return {code:hasPin ? 'APP_CAPTURED' : 'APP_WSKEY_ONLY',credential:{
      userName,cookie:(hasPin ? 'pin=' + fields.pin + '; ' : '') + 'wskey=' + fields.wskey + ';',identity:'unverified'
    }};
  }
  function capture(request) {
    check(typeof request?.url === 'string' && request.url.length <= 8192 && !/[\s\x00-\x1f\x7f]/.test(request.url),'CAPTURE_URL');
    const match = /^https:\/\/(?:(blackhole\.m\.jd\.com|perf\.m\.jd\.com)(?:[/?#]|$)|(sh\.jd\.com)\/j\/[A-Za-z0-9_-]+(?:[?#]|$))/.exec(request.url);
    check(match,'CAPTURE_URL');return {...fromHeaders(request.headers),host:match[1] || match[2]};
  }
  function validCredential(value) {
    check(value && value.identity === 'unverified' && typeof value.cookie === 'string','STORAGE_FORMAT');
    const normalized = fromHeaders({Cookie:value.cookie}).credential;
    check(normalized && normalized.userName === value.userName && normalized.cookie === value.cookie,'STORAGE_FORMAT');return normalized;
  }
  return Object.freeze({check,fromHeaders,capture,validCredential});
}

// Synchronous local capture, status and clear; deliberately has no HTTP capability.
function runWskeyWorkflow(core, env) {
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

// Every intercepted request is forwarded unchanged, even on local storage failure.
(function () {
  'use strict';let finished = false;
  const done = () => { if (!finished) { finished = true;$done({}); } };
  const messages = {
    APP_CAPTURED:'已在同一请求抓到 wskey 和 pin，尚未校验有效性。请在 BoxJs“京东App WSKEY”查看，仅保存在本机。',
    APP_WSKEY_ONLY:'已抓到 wskey，但该请求没有 pin；pin_hash 不能代替 pin。请在 BoxJs“京东App WSKEY”查看，账号待后续核验。',
    APP_NOT_SEEN:'尚未触发 App 抓取。请检查插件、MitM 和证书信任，重新打开已登录的京东 App，再查看 blackhole、perf 或 sh.jd.com 请求记录。',
    APP_NO_COOKIE:'已触发 App 抓取，但这个请求没有 Cookie。可继续正常使用 App，稍后手动查看抓取状态。',
    APP_NO_WSKEY:'已触发 App 抓取，但这个请求的 Cookie 没有 wskey。若后续一直没有，请核对实际携带 wskey 的请求是否属于插件匹配入口。',
    APP_EXPIRED:'本地暂存已超过十五分钟或设备时间发生回退，已清除。请重新捕获；这不是京东返回的失效结论。',
    APP_CLEARED:'已清除本插件暂存的 wskey 和请求记录。',
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
