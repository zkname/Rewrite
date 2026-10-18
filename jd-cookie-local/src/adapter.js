// Loon adapter. Every captured browser request is forwarded unchanged.
(function () {
  'use strict';
  const core = createCore(); let finished = false;
  function done() { if (!finished) { finished = true;$done({}); } }
  function fail(code) { const error = new Error(code);error.code = code;return error; }
  const messages = {
    WEB_CAPTURED:'已捕获网页 Cookie。请在 Loon 手动运行“京东网页Cookie校验并保存”，十五分钟内有效。',
    LOGIN_VERIFIED:'Cookie 登录校验通过，已保存至 BoxJs“京东本地Cookie”。京豆查询仍待验收。',
    WEB_NOT_SEEN:'尚未看到网页请求。请确认插件与 MitM 已启用，再用 Safari 打开 https://my.m.jd.com/index.html。',
    WEB_NO_COOKIE:'已看到网页请求，但没有 Cookie。请在 Safari 登录京东，再打开网页“我的”。',
    WEB_INCOMPLETE:'已看到网页请求，但未带完整 pt_key/pt_pin。请在 Safari 完成登录，再打开网页“我的”。',
    WEB_CAPTURE_REQUIRED:'还没有捕获完整网页 Cookie。请在 Safari 登录京东，再打开 https://my.m.jd.com/index.html。',
    WEB_EXPIRED:'暂存网页 Cookie 已超过十五分钟，请重新打开网页“我的”捕获。',
    VERIFY_BUSY:'已有登录校验正在运行。',VERIFY_COOLDOWN:'刚刚已校验过，请一分钟后再试。',
    CAPTURE_CHANGED:'校验期间捕获账号或 Cookie 已变化，请重新手动校验。',
    LOGIN_UNCONFIRMED:'京东未确认登录。请在 Safari 重新登录后捕获；已有已验证 Cookie 保留。',
    MODE_REQUIRED:'请运行“京东网页抓取状态”或“京东网页Cookie校验并保存”。'
  };
  const env = {
    request:typeof $request === 'undefined' ? null : $request,
    mode:typeof $argument === 'string' ? $argument : '',now:() => Date.now(),random:() => Math.random(),
    read:key => $persistentStore.read(key),write:(value,key) => $persistentStore.write(value,key),
    wait:ms => new Promise(resolve => setTimeout(resolve,ms)),done,
    notify:(code,user) => $notification.post('京东网页 Cookie',user || '',messages[code] || '未完成：' + code),
    http:options => new Promise((resolve,reject) => {
      let settled = false;
      const finish = (error,result) => { if (settled) return;settled = true;error ? reject(error) : resolve(result); };
      setTimeout(() => finish(fail('NETWORK_TIMEOUT')),12000);
      try {
        const {method,...request} = options;
        $httpClient[method](request,(error,response,data) => {
          if (error) { finish(fail('NETWORK_ERROR'));return; }
          finish(null,{status:Number(response?.status),body:typeof data === 'string' ? data : ''});
        });
      } catch (_) { finish(fail('NETWORK_ERROR')); }
    })
  };
  runWorkflow(core,env).catch(() => done());
})();
