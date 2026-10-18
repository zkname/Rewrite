// Loon-only adapter. Capture requests are always forwarded unchanged.
(function () {
  'use strict';
  const core = createCore();
  let finished = false;
  function done() { if (!finished) { finished = true; $done({}); } }
  function fail(code) { const error = new Error(code);error.code = code;return error; }
  const text = {CAPTURED:'已捕获 App 凭据。请手动运行“京东 Cookie 转换”；十五分钟内有效。',
    LOGIN_VERIFIED:'Cookie 登录校验成功，已保存到 BoxJs 本地 jdCookieList。任务查询验收尚未完成。',
    CAPTURE_REQUIRED:'请先打开京东 App 重新捕获。',CAPTURE_EXPIRED:'捕获已过期，请重新打开京东 App。',
    CAPTURE_COOKIE_FORMAT:'捕获未完成：请求中的 Cookie 头格式不受支持（CAPTURE_COOKIE_FORMAT）。原请求已放行。',
    WSKEY_FORMAT:'捕获的 App 凭据格式无效（WSKEY_FORMAT），请重新打开京东 App 捕获。',
    CONVERSION_BUSY:'已有转换正在运行。',CONVERSION_COOLDOWN:'同一凭据十五分钟内不重复转换。'};
  const env = {
    request:typeof $request === 'undefined' ? null : $request,
    mode:typeof $argument === 'string' ? $argument : '',
    now:() => Date.now(),random:() => Math.random(),
    read:key => $persistentStore.read(key), write:(value,key) => $persistentStore.write(value,key),
    wait:ms => new Promise(resolve => setTimeout(resolve,ms)),done,
    notify:(code,user) => $notification.post('京东本地 Cookie',user || '',text[code] || '未完成：' + code),
    http:options => new Promise((resolve,reject) => {
      let settled = false;
      const finish = (error,result) => { if (settled) return;settled = true;error ? reject(error) : resolve(result); };
      setTimeout(() => finish(fail('NETWORK_TIMEOUT')),12000);
      try {
        const {method,...request} = options;
        $httpClient[method](request,(error,response,data) => {
          if (error) { finish(fail('NETWORK_ERROR'));return; }
          finish(null,{status:Number(response?.status),headers:response?.headers,body:typeof data === 'string' ? data : ''});
        });
      } catch (_) { finish(fail('NETWORK_ERROR')); }
    })
  };
  runWorkflow(core,env).catch(() => done());
})();
