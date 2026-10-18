// Pure configuration generator, also exercised in the disconnected tests.
export function loonConfigs(revision) {
  if (!/^[a-f0-9]{40}$/.test(revision || '')) throw Error('Pass a fixed reviewed commit');
  const script = 'https://raw.githubusercontent.com/zkname/Rewrite/' + revision + '/get_jd_wskey.js';
  const rule = '^https:\\/\\/(?:m\\.jd\\.com|home\\.m\\.jd\\.com|my\\.m\\.jd\\.com)(?:[/?#]|$)';
  const header = '#!name=京东网页 Cookie（实验版）\n#!desc=Safari 登录京东后抓取网页 Cookie，手动校验并存本地。无签名、无上传、无定时。\n#!author=zkname\n';
  const mitm = '\n[MITM]\nhostname = m.jd.com, home.m.jd.com, my.m.jd.com\n';
  const legacy = header + '\n[Script]\nhttp-request ' + rule + ' script-path=' + script + ',tag=京东网页Cookie捕获,requires-body=false,timeout=5,enable=true\n' +
    'generic script-path=' + script + ',tag=京东网页抓取状态,timeout=5,argument="status",enable=true\n' +
    'generic script-path=' + script + ',tag=京东网页Cookie校验并保存,timeout=20,argument="verify",enable=true\n' + mitm;
  const modern = header + '\n[Script]\nrequest if ${url} ~= /' + rule.replace('[/?#]','[\\/?#]') + '/ then script("' + script + '") with tag="京东网页Cookie捕获", requires_body=false, timeout=5\n' +
    'generic then script("' + script + '", "status") with tag="京东网页抓取状态", timeout=5\n' +
    'generic then script("' + script + '", "verify") with tag="京东网页Cookie校验并保存", timeout=20\n' + mitm;
  const box = {id:'zkname.jd-cookie-local',name:'京东网页Cookie（实验版）',author:'@zkname',repo:'https://github.com/zkname/Rewrite',apps:[{
    id:'zkname.jd-cookie-local',name:'京东本地Cookie',author:'@zkname',
    descs_html:['用 Safari 登录 https://my.m.jd.com/index.html；出现已捕获后，在 Loon 运行“京东网页Cookie校验并保存”。','捕获仅暂存本机。手动校验只访问京东，成功后在此复制 cookie 字段；不上传、不云备份。'],
    keys:['jdCookieList','jdLocalStatusV1'],settings:[
      {id:'jdCookieList',name:'已验证登录的 Cookie（敏感）',val:'[]',type:'textarea',autoGrow:false,rows:10,desc:'复制所需账号的 cookie 字段：pt_key=...; pt_pin=...;。尚未校验的捕获不会覆盖此列表。'},
      {id:'jdLocalStatusV1',name:'网页捕获／登录校验状态',val:'{}',type:'textarea',rows:8,desc:'WEB_NOT_SEEN：未触发；WEB_NO_COOKIE/WEB_INCOMPLETE：尚未取得完整 Cookie；WEB_CAPTURED：已捕获待校验；LOGIN_VERIFIED：已校验保存。queryVerification=pending 表示京豆查询尚未验收。'}]}]};
  return {'get_jd_cookie.plugin':modern,'get_jd_cookie.legacy.plugin':legacy,'boxjs.json':JSON.stringify(box,null,2)+'\n',
    'release.json':JSON.stringify({mode:'web',scriptCommit:revision,scriptURL:script,live:'pending',mainMergeAllowed:false},null,2)+'\n'};
}
