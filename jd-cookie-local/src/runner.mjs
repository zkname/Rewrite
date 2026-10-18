// Capability-injected workflow; never logs request/response objects or credentials.
export async function runWorkflow(core, env) {
  'use strict';
  const keys = {capture:'jdLocalCaptureV1',state:'jdLocalConversionV1',cookies:'jdCookieList',status:'jdLocalStatusV1'};
  const now = () => env.now();
  const read = key => { const raw = env.read(key); if (!raw) return null; core.check(typeof raw === 'string' && raw.length <= 1048576,'STORAGE_FORMAT'); try { return JSON.parse(raw); } catch (_) { core.check(false,'STORAGE_FORMAT'); } };
  const save = (key, value) => core.check(env.write(JSON.stringify(value),key) === true,'STORAGE_WRITE_FAILED');
  const report = (code, user) => { env.notify(code, user ? '***' + user.slice(-2) : ''); };
  const digest = value => core.md5(core.utf8(value));
  let owned = null, fingerprint = null;
  try {
    if (env.request) {
      const value = core.capture(env.request, now());
      if (value) {
        const previous = read(keys.capture);
        save(keys.capture,value);
        if (!previous || previous.wskey !== value.wskey) report('CAPTURED');
      }
      return {status:value ? 'captured' : 'ignored'};
    }
    core.check(env.mode === 'convert','MODE_REQUIRED');
    const candidate = read(keys.capture), time = now();
    core.check(candidate?.version === 1 && typeof candidate.wskey === 'string','CAPTURE_REQUIRED');
    if (!Number.isSafeInteger(candidate.capturedAt) || time < candidate.capturedAt || time - candidate.capturedAt >= 900000) {
      save(keys.capture,null);core.check(false,'CAPTURE_EXPIRED');
    }
    fingerprint = digest(candidate.wskey);
    const state = read(keys.state);
    if (state) {
      core.check(Number.isFinite(state.startedAt) && state.startedAt <= time,'STATE_FORMAT');
      core.check(state.status !== 'inflight' || time - state.startedAt >= 120000,'CONVERSION_BUSY');
      core.check(state.fingerprint !== fingerprint || time - state.startedAt >= 900000,'CONVERSION_COOLDOWN');
    }
    const random = () => { const value = env.random(); core.check(Number.isFinite(value) && value >= 0 && value < 1,'RANDOM_SOURCE'); return value; };
    // Last 16 hex characters of a UUIDv4 retain the variant nibble (8,9,a,b).
    const uuid = '89ab'[Math.floor(random()*4)] + Array.from({length:15},() => Math.floor(random()*16).toString(16)).join('');
    const nonce = String(time) + ':' + uuid;
    save(keys.state,{fingerprint,nonce,startedAt:time,status:'inflight'});
    owned = nonce;
    // Cooperative fencing for separate Loon script invocations; the store has no CAS primitive.
    await env.wait(100);
    const owns = () => core.check(read(keys.state)?.nonce === nonce,'CONVERSION_SUPERSEDED');
    owns();
    const input = {wskey:candidate.wskey,pin:candidate.pin,uuid,st:time,sv:['102','111','120'][Math.floor(random()*3)]};
    async function send(route, extra) {
      owns();
      const response = await env.http(core.options(route,{...input,...extra}));
      owns();
      core.check(response && Number.isInteger(response.status),'RESPONSE_FORMAT');
      const allowed = route === 'jump' ? [200,302,303] : [200];
      core.check(allowed.includes(response.status),response.status === 429 ? 'RATE_LIMITED' : 'HTTP_REJECTED');
      core.check(typeof response.body === 'string' && response.body.length <= 262144,'RESPONSE_FORMAT');
      if (route === 'jump') return response;
      let data; try { data = JSON.parse(response.body); } catch (_) { core.check(false,'RESPONSE_JSON'); }
      core.check(data && typeof data === 'object' && !Array.isArray(data),'RESPONSE_JSON');
      return data;
    }
    const token = core.tokenFrom(await send('token'));
    const account = core.parseSetCookie((await send('jump',{token})).headers,now());
    if (candidate.pin) core.check(core.pinIdentity(candidate.pin) === account.userName,'ACCOUNT_MISMATCH');
    core.loginValid(await send('validate',{cookie:account.cookie}),account);
    const previous = read(keys.cookies) || [];
    core.check(Array.isArray(previous) && previous.length <= 50,'STORAGE_FORMAT');
    const users = new Set();
    for (const item of previous) {
      core.check(item && typeof item.userName === 'string' && typeof item.cookie === 'string' && !users.has(item.userName),'STORAGE_FORMAT');
      const fields = core.pairs(item.cookie);
      core.check(fields.pt_key && core.pinIdentity(fields.pt_pin) === item.userName,'STORAGE_FORMAT');users.add(item.userName);
    }
    const index = previous.findIndex(x => x.userName === account.userName);
    if (index < 0) { core.check(previous.length < 50,'ACCOUNT_LIMIT');previous.push(account); } else previous[index] = account;
    owns();save(keys.cookies,previous);
    save(keys.state,{fingerprint,nonce,startedAt:time,status:'confirmed'});
    // Do not delete a new capture that arrived while this conversion was running.
    const latest = read(keys.capture);
    if (latest?.wskey === candidate.wskey && latest.capturedAt === candidate.capturedAt) save(keys.capture,null);
    save(keys.status,{status:'LOGIN_VERIFIED',at:now(),accounts:previous.length,queryVerification:'pending'});
    report('LOGIN_VERIFIED',account.userName);
    return {status:'login-verified',accounts:previous.length,queryVerification:'pending'};
  } catch (error) {
    // Only our fixed codes survive; never serialize the actual exception or response.
    const safe = new Set(['INPUT_FORMAT','INPUT_ENCODING','SIGN_INPUT','PIN_FORMAT','COOKIE_FORMAT','COOKIE_CONFLICT','HEADER_FORMAT','CAPTURE_URL','CAPTURE_COOKIE_FORMAT','WSKEY_FORMAT',
      'SET_COOKIE_FORMAT','COOKIE_EXPIRED','COOKIE_DOMAIN','PT_KEY_REJECTED','TOKEN_REJECTED','LOGIN_UNCONFIRMED','ACCOUNT_MISMATCH','ENDPOINT_NOT_ALLOWED',
      'STORAGE_FORMAT','STORAGE_WRITE_FAILED','MODE_REQUIRED','CAPTURE_REQUIRED','CAPTURE_EXPIRED','STATE_FORMAT','CONVERSION_BUSY','CONVERSION_COOLDOWN',
      'RANDOM_SOURCE','CONVERSION_SUPERSEDED','RESPONSE_FORMAT','RATE_LIMITED','HTTP_REJECTED','RESPONSE_JSON','ACCOUNT_LIMIT','NETWORK_ERROR','NETWORK_TIMEOUT']);
    const code = safe.has(error?.code) ? error.code : 'INTERNAL_ERROR';
    if (owned) { try { const s = read(keys.state); if (s?.nonce === owned) save(keys.state,{...s,status:'failed',code}); } catch (_) {} }
    try { report(code); } catch (_) {}
    return {status:'failed',code};
  } finally { env.done({}); }
}
