// Capture and status are local-only. Verification is an explicit manual action.
export async function runWorkflow(core, env) {
  'use strict';
  const keys = {capture:'jdWebCaptureV1',observation:'jdWebObservationV1',notice:'jdWebNoticeV1',
    state:'jdWebVerifyV1',cookies:'jdCookieList',status:'jdLocalStatusV1'};
  const codes = new Set(['WEB_CAPTURED','WEB_NO_COOKIE','WEB_INCOMPLETE','WEB_NOT_SEEN','LOGIN_VERIFIED',
    'PIN_FORMAT','HEADER_FORMAT','COOKIE_FORMAT','COOKIE_CONFLICT','PT_KEY_REJECTED','COOKIE_INCOMPLETE','CAPTURE_URL',
    'STORAGE_FORMAT','STORAGE_WRITE_FAILED','CLOCK_INVALID','RANDOM_SOURCE','LOGIN_UNCONFIRMED','ACCOUNT_MISMATCH','MODE_REQUIRED',
    'WEB_CAPTURE_REQUIRED','WEB_EXPIRED','VERIFY_BUSY','VERIFY_COOLDOWN','VERIFY_SUPERSEDED','CAPTURE_CHANGED',
    'RATE_LIMITED','HTTP_REJECTED','RESPONSE_FORMAT','RESPONSE_JSON','ACCOUNT_LIMIT','NETWORK_ERROR','NETWORK_TIMEOUT','INTERNAL_ERROR']);
  const read = key => {
    const raw = env.read(key); if (!raw) return null;
    core.check(typeof raw === 'string' && raw.length <= 1048576,'STORAGE_FORMAT');
    try { return JSON.parse(raw); } catch (_) { core.check(false,'STORAGE_FORMAT'); }
  };
  const save = (key,value) => core.check(env.write(JSON.stringify(value),key) === true,'STORAGE_WRITE_FAILED');
  const clock = () => { const t = env.now(); core.check(Number.isSafeInteger(t) && t >= 0,'CLOCK_INVALID'); return t; };
  const id = () => { const r = env.random(); core.check(Number.isFinite(r) && r >= 0 && r < 1,'RANDOM_SOURCE'); return String(clock()) + ':' + r.toString(36).slice(2); };
  const candidate = () => {
    const c = read(keys.capture); if (!c) return null;
    core.check(c.version === 1 && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 100 && Number.isSafeInteger(c.capturedAt),'STORAGE_FORMAT');
    core.check(c.verifiedAt == null || (Number.isSafeInteger(c.verifiedAt) && c.verifiedAt >= 0 && c.verifiedAt <= clock()),'STORAGE_FORMAT');
    core.validAccount(c.account); return c;
  };
  const fresh = c => c && clock() >= c.capturedAt && clock() - c.capturedAt < 900000;
  const report = (code,c,automatic=false,force=false) => {
    const time = clock(), observation = read(keys.observation);
    core.check(codes.has(code) && (!observation || (codes.has(observation.code) && Number.isSafeInteger(observation.at))),'STORAGE_FORMAT');
    save(keys.status,{mode:'web',status:code,at:time,account:c ? core.label(c.account.userName) : null,
      lastRequest:observation?.code || 'WEB_NOT_SEEN',lastRequestAt:observation?.at || null,
      loginVerification:c?.verifiedAt ? 'verified' : 'pending',queryVerification:'pending'});
    if (automatic && !force) {
      const last = read(keys.notice);
      if (last?.code === code && Number.isSafeInteger(last.at) && time >= last.at && time - last.at < 60000) return;
    }
    if (automatic) save(keys.notice,{code,at:time});
    env.notify(code,c ? core.label(c.account.userName) : '');
  };
  let owned = null;
  try {
    if (env.request) {
      const result = core.capture(env.request), time = clock();
      save(keys.observation,{code:result.code,at:time,host:result.host});
      if (!result.account) { report(result.code,null,true);return {status:result.code}; }
      const previous = candidate(), same = previous?.account.cookie === result.account.cookie;
      const c = {version:1,id:same ? previous.id : id(),capturedAt:time,account:result.account,
        verifiedAt:same && fresh(previous) && time - previous.verifiedAt < 900000 ? previous.verifiedAt || null : null};
      save(keys.capture,c);
      const code = c.verifiedAt ? 'LOGIN_VERIFIED' : 'WEB_CAPTURED';
      report(code,c,true,!same); return {status:code};
    }
    core.check(env.mode === 'status' || env.mode === 'verify','MODE_REQUIRED');
    const c = candidate(), observation = read(keys.observation);
    if (env.mode === 'status') {
      let code = c ? (fresh(c) ? (c.verifiedAt ? 'LOGIN_VERIFIED' : 'WEB_CAPTURED') : 'WEB_EXPIRED') : observation?.code || 'WEB_NOT_SEEN';
      if (code === 'WEB_CAPTURED' && !c) code = 'WEB_NOT_SEEN';
      if (c && !fresh(c)) save(keys.capture,null);
      report(code,c);return {status:code};
    }
    core.check(c,'WEB_CAPTURE_REQUIRED');
    if (!fresh(c)) { save(keys.capture,null);core.check(false,'WEB_EXPIRED'); }
    const time = clock(), state = read(keys.state);
    if (state) {
      core.check(Number.isSafeInteger(state.startedAt) && state.startedAt <= time,'STORAGE_FORMAT');
      core.check(state.status !== 'inflight' || time - state.startedAt >= 30000,'VERIFY_BUSY');
      core.check(state.captureId !== c.id || time - state.startedAt >= 60000,'VERIFY_COOLDOWN');
    }
    const nonce = id(); save(keys.state,{nonce,captureId:c.id,startedAt:time,status:'inflight'});owned = nonce;
    await env.wait(100);
    const owns = () => {
      core.check(read(keys.state)?.nonce === nonce,'VERIFY_SUPERSEDED');
      const current = candidate();
      core.check(current?.id === c.id && current.account.cookie === c.account.cookie,'CAPTURE_CHANGED');
    };
    owns();
    const response = await env.http(core.verifyOptions(c.account)); owns();
    core.check(response && response.status === 200,response?.status === 429 ? 'RATE_LIMITED' : 'HTTP_REJECTED');
    core.check(typeof response.body === 'string' && response.body.length <= 262144,'RESPONSE_FORMAT');
    let data; try { data = JSON.parse(response.body); } catch (_) { core.check(false,'RESPONSE_JSON'); }
    core.loginValid(data,c.account);
    const accounts = read(keys.cookies) || [];
    core.check(Array.isArray(accounts) && accounts.length <= 50,'STORAGE_FORMAT');
    const seen = new Set();
    for (const account of accounts) { core.validAccount(account);core.check(!seen.has(account.userName),'STORAGE_FORMAT');seen.add(account.userName); }
    const index = accounts.findIndex(a => a.userName === c.account.userName);
    if (index < 0) { core.check(accounts.length < 50,'ACCOUNT_LIMIT');accounts.push(c.account); } else accounts[index] = c.account;
    owns();save(keys.cookies,accounts);
    owns();const latest = candidate();save(keys.capture,{...latest,verifiedAt:clock()});
    save(keys.state,{nonce,captureId:c.id,startedAt:time,status:'confirmed'});
    report('LOGIN_VERIFIED',{...c,verifiedAt:clock()});return {status:'LOGIN_VERIFIED',queryVerification:'pending'};
  } catch (error) {
    const code = codes.has(error?.code) ? error.code : 'INTERNAL_ERROR';
    if (owned) { try { const s = read(keys.state);if (s?.nonce === owned) save(keys.state,{...s,status:'failed',code}); } catch (_) {} }
    if (env.request) { try { save(keys.observation,{code,at:clock()}); } catch (_) {} }
    try { report(code,null,!!env.request); } catch (_) { try { env.notify(code,''); } catch (_) {} }
    return {status:'failed',code};
  } finally { env.done({}); }
}
