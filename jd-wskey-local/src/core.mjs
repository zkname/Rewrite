// Parse each App request independently; pairing is explicitly unverified. No network or storage.
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
