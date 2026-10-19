export function wskeyConfigs(revision) {
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw Error('Pass a fixed reviewed commit');
  const script = 'https://raw.githubusercontent.com/zkname/Rewrite/' + revision + '/get_jd_app_wskey.js';
  const rule = '^https:\\/\\/(?:blackhole\\.m\\.jd\\.com|perf\\.m\\.jd\\.com)(?:[/?#]|$)';
  const header = '#!name=京东App WSKEY（本地抓取）\n#!desc=抓取、状态和清除均在本机完成，无上传、无转换、无定时。需 App 实测。\n#!author=zkname\n';
  const mitm = '\n[MITM]\nhostname = blackhole.m.jd.com, perf.m.jd.com\n';
  const legacy = header + '\n[Script]\nhttp-request ' + rule + ' script-path=' + script + ',tag=京东App凭据捕获,requires-body=false,timeout=5,enable=true\n' +
    'generic script-path=' + script + ',tag=京东App抓取状态,timeout=5,argument="status",enable=true\n' +
    'generic script-path=' + script + ',tag=京东App清除暂存,timeout=5,argument="clear",enable=true\n' + mitm;
  const modern = header + '\n[Script]\nrequest if ${url} ~= /' + rule.replace('[/?#]','[\\/?#]') + '/ then script("' + script + '") with tag="京东App凭据捕获", requires_body=false, timeout=5\n' +
    'generic then script("' + script + '", "status") with tag="京东App抓取状态", timeout=5\n' +
    'generic then script("' + script + '", "clear") with tag="京东App清除暂存", timeout=5\n' + mitm;
  const box = {id:'zkname.jd-app-wskey',name:'京东App WSKEY',author:'@zkname',apps:[{
    id:'zkname.jd-app-wskey',name:'京东App WSKEY',author:'@zkname',
    descs_html:['打开已登录的京东 App 抓取；在 Loon 运行“京东App抓取状态”区分未触发与未带 wskey。',
      '仅保存在手机本地，不上传、不转换。抓到不代表有效，pin 也尚未核验。复制后请运行清除暂存；不要分享凭据或开启数据云备份。'],
    keys:['jdAppWskeyCaptureV1','jdAppWskeyStatusV1'],settings:[
      {id:'jdAppWskeyCaptureV1',name:'最近抓到的 WSKEY（敏感，未校验）',val:'null',type:'textarea',rows:10,
        desc:'查看 credential.cookie；同一请求有 pin 时为 pin=…; wskey=…;，没有时仅保存 wskey。十五分钟后下次执行时清除，不代表服务器有效期。'},
      {id:'jdAppWskeyStatusV1',name:'App 抓取状态',val:'{}',type:'textarea',rows:8,
        desc:'APP_NOT_SEEN 未触发；APP_NO_COOKIE/APP_NO_WSKEY 请求未携带；APP_CAPTURED 已抓到两个字段；APP_WSKEY_ONLY 仅抓到 wskey。'}]}]};
  return {'get_jd_wskey.plugin':modern,'get_jd_wskey.legacy.plugin':legacy,'boxjs.json':JSON.stringify(box,null,2)+'\n',
    'release.json':JSON.stringify({mode:'app-wskey',scriptCommit:revision,scriptURL:script,live:'pending',published:false},null,2)+'\n'};
}
