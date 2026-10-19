// Pure parsing of credentials from one App request. No network or storage.
export function createWskeyCore() {
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
