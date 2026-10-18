// Pure local protocol helpers. Sources and limitations: ../NOTICE.md.
export function createCore() {
  'use strict';
  function check(value, code) { if (!value) { const e = new Error(code); e.code = code; throw e; } }
  const standard = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function utf8(text) {
    check(typeof text === 'string' && text.length <= 65536, 'INPUT_FORMAT');
    let encoded; try { encoded = encodeURIComponent(text); } catch (_) { check(false, 'INPUT_ENCODING'); }
    const bytes = [];
    for (let i = 0; i < encoded.length; i++) {
      if (encoded[i] === '%') { bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16)); i += 2; }
      else bytes.push(encoded.charCodeAt(i));
    }
    return bytes;
  }
  function base64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += standard[n >>> 18] + standard[(n >>> 12) & 63] +
        (i + 1 < bytes.length ? standard[(n >>> 6) & 63] : '=') + (i + 2 < bytes.length ? standard[n & 63] : '=');
    }
    return out;
  }
  // RFC 1321 MD5, used by the existing JD protocol, not as a password hash.
  function md5(bytes) {
    const padded = bytes.slice(), bits = bytes.length * 8;
    padded.push(128); while (padded.length % 64 !== 56) padded.push(0);
    for (let i = 0; i < 8; i++) padded.push(Math.floor(bits / 2 ** (8 * i)) & 255);
    const shifts = [[7, 12, 17, 22], [5, 9, 14, 20], [4, 11, 16, 23], [6, 10, 15, 21]];
    let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    for (let offset = 0; offset < padded.length; offset += 64) {
      const m = [];
      for (let j = 0; j < 16; j++) { const i = offset + j * 4; m.push(padded[i] | (padded[i + 1] << 8) | (padded[i + 2] << 16) | (padded[i + 3] << 24)); }
      let a = a0, b = b0, c = c0, d = d0;
      for (let i = 0; i < 64; i++) {
        const round = Math.floor(i / 16);
        const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
        const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
        const value = (a + f + (Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0) + m[g]) | 0;
        const shift = shifts[round][i % 4], oldD = d;
        d = c; c = b; b = (b + ((value << shift) | (value >>> (32 - shift)))) | 0; a = oldD;
      }
      a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
    }
    return [a0, b0, c0, d0].map(n => [0, 8, 16, 24].map(s => ((n >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
  }
  function signCore(bytes) {
    const table = [0x37,0x92,0x44,0x68,0xa5,0x3d,0xcc,0x7f,0xbb,0x0f,0xd9,0x88,0xee,0x9a,0xe9,0x5a];
    const key = utf8('80306f4370b39fd5630ad0529f77adb6');
    return bytes.map((byte, i) => { const t = table[i & 15], k = key[i & 7]; return (t ^ ((t ^ byte ^ k) + t) ^ k) & 255; });
  }
  function sign({functionId, body, uuid, client, clientVersion, st, sv}) {
    const message = `functionId=${functionId}&body=${body}&uuid=${uuid}&client=${client}&clientVersion=${clientVersion}&st=${st}&sv=${sv}`;
    return md5(utf8(base64(signCore(utf8(message)))));
  }
  function encodeDevice(value) {
    const from = 'KLMNOPQRSTABCDEFGHIJUVWXYZabcdopqrstuvwxefghijklmnyz0123456789+/';
    return base64(utf8(value)).split('').map(c => from.includes(c) ? standard[from.indexOf(c)] : c).join('');
  }
  const jump = 'https://plogin.m.jd.com/jd-mlogin/static/html/appjmp_blank.html';
  const body = '{"to":"https%3a%2f%2fplogin.m.jd.com%2fjd-mlogin%2fstatic%2fhtml%2fappjmp_blank.html"}';
  const hdid = 'JM9F1ywUPwflvMIpYPok0tt5k9kW4ArJEU3lfLhxBqw=';
  function buildParams({uuid, st, sv}) {
    check(/^[a-f0-9]{16}$/.test(uuid) && Number.isSafeInteger(st) && st >= 0 && ['102','111','120'].includes(sv), 'SIGN_INPUT');
    const encoded = encodeDevice(uuid);
    const ep = {hdid, ts:st, ridx:-1, cipher:{area:'CV8yEJUzXzU0CNG0XzK=', d_model:'JWunCVVidRTr', wifiBssid:'dW5hbw93bq==',
      osVersion:'CJS=', d_brand:'WQvrb21f', screen:'CJuyCMenCNq=', uuid:encoded, aid:encoded, openudid:encoded},
      ciphertype:5, version:'1.2.0', appname:'com.jingdong.app.mall'};
    return {functionId:'genToken', clientVersion:'11.1.4', build:'98176', client:'android', partner:'google', oaid:uuid,
      sdkVersion:'31', lang:'zh_CN', harmonyOs:'0', networkType:'UNKNOWN', uemps:'0-2', ext:'{"prstate": "0", "pvcStu": "1"}',
      eid:'eidAcef08121fds9MoeSDdMRQ1aUTyb1TyPr2zKHk5Asiauw+K/WvS1Ben1cH6N0UnBd7lNM50XEa2kfCcA2wwThkxZc1MuCNtfU/oAMGBqadgres4BU',
      ef:'1', ep:JSON.stringify(ep), st, sign:sign({functionId:'genToken',body,uuid,client:'android',clientVersion:'11.1.4',st,sv}), sv};
  }
  function userAgent({uuid, st}) {
    const id = encodeDevice(uuid);
    const ep = {hdid, ts:st, ridx:-1, cipher:{sv:'CJS=', ad:id, od:id, ov:'CzO=', ud:id},ciphertype:5, version:'1.2.0',appname:'com.jingdong.app.mall'};
    return 'jdapp;android;11.1.4;;;appBuild/98176;ef/1;ep/' + JSON.stringify(ep) + ';Mozilla/5.0 (Linux; Android 12; M2102K1C Build/SKQ1.220303.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/97.0.4692.98 Mobile Safari/537.36';
  }
  const query = values => Object.keys(values).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(values[k]))).join('&');
  function pinIdentity(pin) {
    check(typeof pin === 'string' && pin.length > 0 && pin.length <= 1024 && /^[\x21-\x7e]+$/.test(pin) && !/[;,]/.test(pin), 'PIN_FORMAT');
    let decoded; try { decoded = decodeURIComponent(pin); } catch (_) { check(false, 'PIN_FORMAT'); }
    check(decoded && !/[\x00-\x1f\x7f]/.test(decoded), 'PIN_FORMAT'); return decoded;
  }
  function pairs(cookie) {
    check(typeof cookie === 'string' && cookie.length <= 32768 && !/[\r\n\x00]/.test(cookie), 'COOKIE_FORMAT');
    const out = Object.create(null);
    for (const field of cookie.split(';')) {
      if (!field.trim()) continue;
      const match = /^\s*([A-Za-z_][A-Za-z0-9_-]*)=([^;\s]*)\s*$/.exec(field);
      check(match, 'COOKIE_FORMAT');
      check(!Object.prototype.hasOwnProperty.call(out, match[1]) || out[match[1]] === match[2], 'COOKIE_CONFLICT');
      out[match[1]] = match[2];
    }
    return out;
  }
  function headerValues(headers, name) {
    check(headers && typeof headers === 'object', 'HEADER_FORMAT');
    return Object.keys(headers).filter(k => k.toLowerCase() === name).flatMap(k => Array.isArray(headers[k]) ? headers[k] : [headers[k]]);
  }
  function capture(request, now) {
    check(typeof request?.url === 'string' && (/^https:\/\/blackhole\.m\.jd\.com\/getinfo(?:[?#]|$)/.test(request.url) ||
      /^https:\/\/perf\.m\.jd\.com\/app_monitor\/\w+\/getRule(?:[?#]|$)/.test(request.url)), 'CAPTURE_URL');
    const headers = headerValues(request.headers, 'cookie');
    if (!headers.length) return null;
    check(headers.every(value => typeof value === 'string' && value.length <= 32768), 'CAPTURE_COOKIE_FORMAT');
    const cookie = headers.join('; ');
    check(cookie.length <= 32768 && !/[\x00-\x08\x0a-\x1f\x7f]/.test(cookie), 'CAPTURE_COOKIE_FORMAT');
    // App metadata is not our credential format. Inspect only exact wskey/pin fields;
    // never persist or forward unrelated values, or combine separate requests.
    const values = Object.create(null);
    for (const field of cookie.split(';')) {
      const index = field.indexOf('='), name = (index < 0 ? field : field.slice(0,index)).trim();
      if (name !== 'wskey' && name !== 'pin') continue;
      check(index >= 0, 'CAPTURE_COOKIE_FORMAT');
      let value = field.slice(index + 1).trim();
      if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1,-1);
      check(!Object.prototype.hasOwnProperty.call(values,name) || values[name] === value, 'COOKIE_CONFLICT');
      values[name] = value;
    }
    if (!Object.prototype.hasOwnProperty.call(values,'wskey')) return null;
    check(/^[A-Za-z0-9._~+/=-]{8,4096}$/.test(values.wskey), 'WSKEY_FORMAT');
    if (Object.prototype.hasOwnProperty.call(values,'pin')) {
      check(!/["\\]/.test(values.pin), 'PIN_FORMAT');
      pinIdentity(values.pin);
    }
    return {version:1, wskey:values.wskey, pin:values.pin || null, capturedAt:now};
  }
  function parseSetCookie(headers, now) {
    const values = Object.create(null);
    for (const raw of headerValues(headers, 'set-cookie')) {
      check(typeof raw === 'string' && raw.length <= 32768, 'SET_COOKIE_FORMAT');
      for (const line of raw.split(/\r?\n|,(?=\s*[A-Za-z_][A-Za-z0-9_-]*=)/)) {
        const fields = line.trim().split(';'), match = /^(pt_key|pt_pin)=([^;\s]*)$/.exec(fields[0]);
        if (!match) continue;
        for (const field of fields.slice(1)) {
          const index = field.indexOf('='), name = (index < 0 ? field : field.slice(0,index)).trim().toLowerCase();
          const value = index < 0 ? '' : field.slice(index + 1).trim();
          if (name === 'max-age') check(/^\d+$/.test(value) && Number(value) > 0, 'COOKIE_EXPIRED');
          if (name === 'expires') check(Number.isFinite(Date.parse(value)) && Date.parse(value) > now, 'COOKIE_EXPIRED');
          if (name === 'domain') check(['jd.com','m.jd.com','un.m.jd.com'].includes(value.toLowerCase().replace(/^\./,'')), 'COOKIE_DOMAIN');
        }
        check(!Object.prototype.hasOwnProperty.call(values,match[1]) || values[match[1]] === match[2], 'COOKIE_CONFLICT'); values[match[1]] = match[2];
      }
    }
    check(typeof values.pt_key === 'string' && /^[A-Za-z0-9._~+/=-]{8,4096}$/.test(values.pt_key) &&
      !/fake|^(deleted|null|undefined|xxx)$/i.test(values.pt_key), 'PT_KEY_REJECTED');
    const userName = pinIdentity(values.pt_pin);
    return {userName, cookie:`pt_key=${values.pt_key}; pt_pin=${values.pt_pin};`};
  }
  function tokenFrom(data) {
    const token = data?.tokenKey;
    check(typeof token === 'string' && /^[A-Za-z0-9._~+/=-]{8,8192}$/.test(token) && !/^(xxx|fake)/i.test(token), 'TOKEN_REJECTED');
    return token;
  }
  function loginValid(data, account) {
    check(data && String(data.retcode) === '0', 'LOGIN_UNCONFIRMED');
    const identity = data?.data?.userInfo?.baseInfo?.curPin;
    if (identity !== undefined) check(typeof identity === 'string' && (identity === account.userName || pinIdentity(identity) === account.userName), 'ACCOUNT_MISMATCH');
  }
  function options(route, input) {
    const fixed = {timeout:10000, 'auto-redirect':false, 'auto-cookie':false, insecure:false};
    const ua = userAgent(input);
    if (route === 'token') {
      check(/^[A-Za-z0-9._~+/=-]{8,4096}$/.test(input.wskey), 'WSKEY_FORMAT');
      if (input.pin) pinIdentity(input.pin);
      return {...fixed, method:'post', url:'https://api.m.jd.com/client.action?' + query(buildParams(input)),
        headers:{'User-Agent':ua, Cookie:'wskey=' + input.wskey + ';' + (input.pin ? ' pin=' + input.pin + ';' : ''),
          'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8', 'Accept-Encoding':'identity'},body:'body=' + encodeURIComponent(body) + '&'};
    }
    if (route === 'jump') return {...fixed, method:'get',url:'https://un.m.jd.com/cgi-bin/app/appjmp?' + query({tokenKey:tokenFrom({tokenKey:input.token}),to:jump}),headers:{'User-Agent':ua,'x-requested-with':'com.jingdong.app.mall'}};
    if (route === 'validate') {
      const v = pairs(input.cookie); check(v.pt_key && v.pt_pin, 'COOKIE_FORMAT');
      return {...fixed,method:'get',url:'https://me-api.jd.com/user_new/info/GetJDUserInfoUnion',
        headers:{'User-Agent':ua, Cookie:input.cookie,Referer:'https://home.m.jd.com/myJd/home.action','Accept-Encoding':'identity'}};
    }
    check(false, 'ENDPOINT_NOT_ALLOWED');
  }
  return Object.freeze({check,utf8,base64,md5,signCore,sign,encodeDevice,buildParams,query,userAgent,pairs,pinIdentity,capture,parseSetCookie,tokenFrom,loginValid,options});
}
