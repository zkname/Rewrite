// Pure helpers for browser Cookie capture. No signing, network or storage here.
export function createCore() {
  'use strict';
  function check(value, code) { if (!value) { const e = new Error(code); e.code = code; throw e; } }
  function pinIdentity(pin) {
    check(typeof pin === 'string' && pin.length > 0 && pin.length <= 1024 && /^[\x21-\x7e]+$/.test(pin) && !/[;,"\\]/.test(pin), 'PIN_FORMAT');
    let value; try { value = decodeURIComponent(pin); } catch (_) { check(false, 'PIN_FORMAT'); }
    check(value && !/[\x00-\x1f\x7f]/.test(value), 'PIN_FORMAT'); return value;
  }
  function headerValues(headers) {
    check(headers && typeof headers === 'object' && !Array.isArray(headers), 'HEADER_FORMAT');
    return Object.keys(headers).filter(k => k.toLowerCase() === 'cookie')
      .flatMap(k => Array.isArray(headers[k]) ? headers[k] : [headers[k]]);
  }
  function fromHeaders(headers) {
    const raw = headerValues(headers);
    if (!raw.length) return {code:'WEB_NO_COOKIE',account:null};
    check(raw.every(x => typeof x === 'string' && x.length <= 32768), 'COOKIE_FORMAT');
    const text = raw.join('; '), values = Object.create(null);
    check(text.length <= 32768 && !/[\x00-\x08\x0a-\x1f\x7f]/.test(text), 'COOKIE_FORMAT');
    for (const field of text.split(';')) {
      const index = field.indexOf('='), name = (index < 0 ? field : field.slice(0,index)).trim();
      if (name !== 'pt_key' && name !== 'pt_pin') continue;
      check(index >= 0, 'COOKIE_FORMAT');
      let value = field.slice(index + 1).trim();
      if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1,-1);
      check(!Object.prototype.hasOwnProperty.call(values,name) || values[name] === value, 'COOKIE_CONFLICT');
      values[name] = value;
    }
    const has = name => Object.prototype.hasOwnProperty.call(values,name);
    if (has('pt_key')) check(/^[A-Za-z0-9._~+/=-]{8,4096}$/.test(values.pt_key) && !/^(fake|deleted|null|undefined|xxx)/i.test(values.pt_key), 'PT_KEY_REJECTED');
    const userName = has('pt_pin') ? pinIdentity(values.pt_pin) : null;
    if (!has('pt_key') || !has('pt_pin')) return {code:'WEB_INCOMPLETE',account:null};
    return {code:'WEB_CAPTURED',account:{userName,cookie:`pt_key=${values.pt_key}; pt_pin=${values.pt_pin};`}};
  }
  function capture(request) {
    check(typeof request?.url === 'string' && request.url.length <= 8192 && !/[\s\x00-\x1f\x7f]/.test(request.url), 'CAPTURE_URL');
    const match = /^https:\/\/(m\.jd\.com|home\.m\.jd\.com|my\.m\.jd\.com)(?:[/?#]|$)/.exec(request.url);
    check(match, 'CAPTURE_URL');
    return {...fromHeaders(request.headers),host:match[1]};
  }
  function accountFromCookie(cookie) {
    const result = fromHeaders({Cookie:cookie}); check(result.account, 'COOKIE_INCOMPLETE'); return result.account;
  }
  function validAccount(account) {
    check(account && typeof account.userName === 'string' && typeof account.cookie === 'string', 'STORAGE_FORMAT');
    const normalized = accountFromCookie(account.cookie);
    check(normalized.userName === account.userName && normalized.cookie === account.cookie, 'STORAGE_FORMAT');
    return normalized;
  }
  function label(userName) { return '***' + userName.replace(/[^a-zA-Z0-9\u3400-\u9fff]/g,'').slice(-2); }
  function loginValid(data, account) {
    check(data && (data.retcode === 0 || data.retcode === '0'), 'LOGIN_UNCONFIRMED');
    const identity = data?.data?.userInfo?.baseInfo?.curPin;
    if (identity !== undefined) check(typeof identity === 'string' && (identity === account.userName || pinIdentity(identity) === account.userName), 'ACCOUNT_MISMATCH');
  }
  function verifyOptions(account) {
    const normalized = validAccount(account);
    return {method:'get',url:'https://me-api.jd.com/user_new/info/GetJDUserInfoUnion',timeout:10000,
      'auto-redirect':false,'auto-cookie':false,insecure:false,
      headers:{Cookie:normalized.cookie,Referer:'https://my.m.jd.com/index.html','Accept-Encoding':'identity',
        'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'}};
  }
  return Object.freeze({check,pinIdentity,fromHeaders,capture,accountFromCookie,validAccount,label,loginValid,verifyOptions});
}
