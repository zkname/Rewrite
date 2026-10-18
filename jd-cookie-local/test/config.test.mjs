import test from 'node:test';
import assert from 'node:assert/strict';
import {loonConfigs} from '../tools/loon-config.mjs';
import {createCore} from '../src/core.mjs';
const revision='1'.repeat(40),configs=loonConfigs(revision);
test('both plugin builds contain the same pinned script and browser-only capture rules',()=>{
  for(const path of ['get_jd_cookie.plugin','get_jd_cookie.legacy.plugin']){
    const text=configs[path];assert.equal(text.split('/'+revision+'/get_jd_wskey.js').length-1,3);
    assert.doesNotMatch(text,/blackhole|perf\.m|genToken|convert|cron|insecure/);
    assert.match(text,/hostname = m\.jd\.com, home\.m\.jd\.com, my\.m\.jd\.com/);
    const line=text.split('\n').find(x=>x.startsWith('http-request ')||x.startsWith('request if'));
    const pattern=path.includes('legacy')?line.split(' ')[1]:/^request if \$\{url\} ~= \/(.+)\/ then script/.exec(line)[1];
    const expression=new RegExp(pattern),c=createCore();
    for(const url of ['https://my.m.jd.com/index.html','https://home.m.jd.com/myJd/home.action','https://m.jd.com/']){
      assert.ok(expression.test(url));assert.equal(c.capture({url,headers:{}}).code,'WEB_NO_COOKIE');
    }
    for(const url of ['https://my.m.jd.com.evil.invalid/','https://blackhole.m.jd.com/getinfo','http://m.jd.com/'])assert.equal(expression.test(url),false);
  }
});
test('BoxJs retains compatible storage keys and has no credential upload switch',()=>{
  const box=JSON.parse(configs['boxjs.json']);assert.equal(box.apps[0].id,'zkname.jd-cookie-local');
  assert.deepEqual(box.apps[0].keys,['jdCookieList','jdLocalStatusV1']);assert.doesNotMatch(configs['boxjs.json'],/WSKEY_AUTO_UPLOAD|TG_|wskeyList/);
  const release=JSON.parse(configs['release.json']);assert.equal(release.mode,'web');assert.equal(release.mainMergeAllowed,false);
  for(const rev of ['main','feat/test','',revision+'x'])assert.throws(()=>loonConfigs(rev));
});
