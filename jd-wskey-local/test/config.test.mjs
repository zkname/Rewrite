import test from 'node:test';
import assert from 'node:assert/strict';
import {wskeyConfigs} from '../tools/loon-config.mjs';
import {createWskeyCore} from '../src/core.mjs';
const revision='1'.repeat(40),configs=wskeyConfigs(revision);
test('both Loon syntaxes pin one script and match the original hosts plus the observed sh route',()=>{
  for(const name of ['get_jd_wskey.plugin','get_jd_wskey.legacy.plugin']) {
    const text=configs[name];assert.equal(text.split('/'+revision+'/get_jd_app_wskey.js').length-1,3);
    assert.doesNotMatch(text,/cron|convert|insecure|api\.m\.jd\.com|hostname = \*/);
    assert.match(text,/hostname = blackhole\.m\.jd\.com, perf\.m\.jd\.com, sh\.jd\.com\n/);
    const line=text.split('\n').find(s=>s.startsWith('http-request ')||s.startsWith('request if'));
    const pattern=name.includes('legacy')?line.split(' ')[1]:/^request if \$\{url\} ~= \/(.+)\/ then script/.exec(line)[1];
    const regex=new RegExp(pattern);
    if(!name.includes('legacy'))assert.doesNotMatch(pattern,/(?<!\\)\//);
    for(const url of ['https://blackhole.m.jd.com/getinfo','https://perf.m.jd.com/app_monitor/a-b/getRule','https://perf.m.jd.com/other',
      'https://sh.jd.com/j/Synthetic_123-abc?placeholder=0']) {
      assert.ok(regex.test(url));assert.equal(createWskeyCore().capture({url,headers:{}}).code,'APP_NO_COOKIE');
    }
    for(const url of ['http://perf.m.jd.com/','https://perf.m.jd.com.evil.invalid/','https://my.m.jd.com/','https://api.m.jd.com/',
      'https://sh.jd.com/other','https://sh.jd.com/j/','https://sh.jd.com/j/Synthetic/extra','https://sh.jd.com.evil.invalid/j/Synthetic'])assert.equal(regex.test(url),false);
  }
});
test('BoxJs exposes only independent local App storage and clearly labels unverified credentials',()=>{
  const app=JSON.parse(configs['boxjs.json']).apps[0];assert.equal(app.id,'zkname.jd-app-wskey');
  assert.deepEqual(app.keys,['jdAppWskeyCaptureV1','jdAppWskeyStatusV1']);
  assert.doesNotMatch(configs['boxjs.json'],/WSKEY_AUTO_UPLOAD|TG_|wskeyList|jdCookieList/);
  const release=JSON.parse(configs['release.json']);assert.equal(release.live,'pending');assert.equal(release.published,false);
  for(const value of ['main','feat/test','',revision+'x'])assert.throws(()=>wskeyConfigs(value));
});
