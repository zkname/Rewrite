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
