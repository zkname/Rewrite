export function wskeyConfigs(revision) {
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw Error('Pass a fixed reviewed commit');
  const script = 'https://raw.githubusercontent.com/zkname/Rewrite/' + revision + '/get_jd_app_wskey.js';
  const rule = '^https:\\/\\/(?:(?:blackhole\\.m\\.jd\\.com|perf\\.m\\.jd\\.com)(?:[/?#]|$)|sh\\.jd\\.com\\/j\\/[A-Za-z0-9_-]+(?:[?#]|$)|mars\\.jd\\.com\\/log\\/sdk\\/v2(?:[?#]|$))';
  const header = '#!name=京东App WSKEY（本地合并）\n#!desc=分别抓取 wskey 与 pin/pt_pin，十五分钟内本地合并并标记待核验。无上传、无转换、无定时。\n#!author=zkname\n';
  const mitm = '\n[MITM]\nhostname = blackhole.m.jd.com, perf.m.jd.com, sh.jd.com, mars.jd.com\n';
  const legacy = header + '\n[Script]\nhttp-request ' + rule + ' script-path=' + script + ',tag=京东App凭据捕获,requires-body=false,timeout=5,enable=true\n' +
    'generic script-path=' + script + ',tag=京东App抓取状态,timeout=5,argument="status",enable=true\n' +
    'generic script-path=' + script + ',tag=京东App清除暂存,timeout=5,argument="clear",enable=true\n' + mitm;
  const modern = header + '\n[Script]\nrequest if ${url} ~= /' + rule.replace('[/?#]','[\\/?#]') + '/ then script("' + script + '") with tag="京东App凭据捕获", requires_body=false, timeout=5\n' +
    'generic then script("' + script + '", "status") with tag="京东App抓取状态", timeout=5\n' +
    'generic then script("' + script + '", "clear") with tag="京东App清除暂存", timeout=5\n' + mitm;
  const box = {id:'zkname.jd-app-wskey',name:'京东App WSKEY',author:'@zkname',apps:[{
    id:'zkname.jd-app-wskey',name:'京东App WSKEY',author:'@zkname',
    descs_html:['保持同一账号使用 App，分别抓取 wskey 与 pin/pt_pin，十五分钟内到齐后合并；切换账号前请清除暂存。',
      '合并结果不代表京东已核验同一账号，也不代表凭据有效。仅保存本机，不上传、不转换；复制后清除，勿共享或云备份。'],
    keys:['jdAppWskeyMergedV1','jdAppWskeyCaptureV1','jdAppPinCaptureV1','jdAppWskeyStatusV1'],settings:[
      {id:'jdAppWskeyMergedV1',name:'合并结果（待核验，敏感）',val:'null',type:'textarea',rows:10,
        desc:'复制 cookie 字段：pin=…; wskey=…;。cross-request-unverified 表示跨请求合并，仍须核验身份；不是已验证账号。'},
      {id:'jdAppWskeyCaptureV1',name:'最近抓到的 WSKEY（敏感，未校验）',val:'null',type:'textarea',rows:10,
        desc:'查看 credential.cookie；同一请求有 pin 时为 pin=…; wskey=…;，没有时仅保存 wskey。pin_hash 不是 pin，不能用于确认账号。十五分钟后下次执行时清除，不代表服务器有效期。'},
      {id:'jdAppPinCaptureV1',name:'最近抓到的 pin/pt_pin（敏感）',val:'null',type:'textarea',rows:5,
        desc:'从请求中单独暂存的账号字段；pin_hash 不作为账号。观察到账号变化会清除旧 wskey 与合并结果。'},
      {id:'jdAppWskeyStatusV1',name:'App 抓取状态',val:'{}',type:'textarea',rows:8,
        desc:'APP_MERGED_UNVERIFIED 已合并待核验；APP_PIN_CAPTURED 仅有账号；APP_WSKEY_ONLY 仅有 wskey；APP_CAPTURED 同一请求已抓到两个字段。'}]}]};
  return {'get_jd_wskey.plugin':modern,'get_jd_wskey.legacy.plugin':legacy,'boxjs.json':JSON.stringify(box,null,2)+'\n',
    'release.json':JSON.stringify({mode:'app-wskey',scriptCommit:revision,scriptURL:script,live:'pending',published:false},null,2)+'\n'};
}
