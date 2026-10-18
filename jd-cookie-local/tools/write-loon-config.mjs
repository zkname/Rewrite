import fs from 'node:fs/promises';
const revision=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(revision||''))throw Error('Pass a fixed reviewed commit');
const root=new URL('../',import.meta.url);
const base='https://raw.githubusercontent.com/zkname/Rewrite/'+revision+'/';
const script=base+'get_jd_wskey.js';
const rule='^https:\\/\\/(?:blackhole\\.m\\.jd\\.com\\/getinfo|perf\\.m\\.jd\\.com\\/app_monitor\\/\\w+\\/getRule)(?:[?#]|$)';
const header='#!name=京东本地 Cookie（实验版）\n#!desc=App 捕获后手动转换。无上传，无定时。Cookie 只在本机保存；兼容性待手机实测。\n#!author=zkname\n';
const legacy=header+'\n[Script]\nhttp-request '+rule+' script-path='+script+',tag=京东App凭据捕获,requires-body=false,timeout=5,enable=true\n'+
  'generic script-path='+script+',tag=京东Cookie手动转换,timeout=45,argument="convert",enable=true\n\n[MITM]\nhostname = blackhole.m.jd.com, perf.m.jd.com\n';
const modern=header+'\n[Script]\nrequest if ${url} ~= /'+rule+'/ then script("'+script+'") with tag="京东App凭据捕获", requires_body=false, timeout=5\n'+
  'generic then script("'+script+'", "convert") with tag="京东Cookie手动转换", timeout=45\n\n[MITM]\nhostname = blackhole.m.jd.com, perf.m.jd.com\n';
const box={id:'zkname.jd-cookie-local',name:'京东本地Cookie（实验版）',author:'@zkname',repo:'https://github.com/zkname/Rewrite',apps:[{
  id:'zkname.jd-cookie-local',name:'京东本地Cookie',author:'@zkname',
  descs_html:['在 Loon 手动转换成功后查看 cookie 字段。这里只保存本地结果，不上传。','凭据敏感：不要截图分享、粘贴聊天或启用云备份。任务查询验收仍需在本机进行。'],
  keys:['jdCookieList','jdLocalStatusV1'],settings:[
    {id:'jdCookieList',name:'已验证登录的 Cookie（敏感）',val:'[]',type:'textarea',autoGrow:false,rows:10,desc:'复制所需账号的 cookie 字段，其格式为 pt_key=...; pt_pin=...;。不要复制整个 JSON 列表。'},
    {id:'jdLocalStatusV1',name:'最近转换状态',val:'{}',type:'textarea',rows:4,desc:'LOGIN_VERIFIED 仅代表登录校验成功；queryVerification=pending 表示京豆查询尚未验收。'}]}]};
await fs.writeFile(new URL('get_jd_cookie.legacy.plugin',root),legacy);
await fs.writeFile(new URL('get_jd_cookie.plugin',root),modern);
await fs.writeFile(new URL('boxjs.json',root),JSON.stringify(box,null,2)+'\n');
await fs.writeFile(new URL('release.json',root),JSON.stringify({scriptCommit:revision,scriptURL:script,live:'pending',mainMergeAllowed:false},null,2)+'\n');
console.log(JSON.stringify({scriptCommit:revision,configs:3}));
