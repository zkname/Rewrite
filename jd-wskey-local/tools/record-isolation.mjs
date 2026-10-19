// Validate generated evidence and record it locally. Does not publish or deploy.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),directory=process.argv[2],expected=Number(process.argv[3]);
assert.ok(directory&&Number.isSafeInteger(expected)&&expected>0,'Pass evidence directory and test count');
const evidence=new URL(directory,root);
assert.ok(evidence.href.startsWith(new URL('.local/',root).href)&&evidence.pathname.endsWith('/'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await fs.readFile(new URL('.local/loon-app-wskey-container/source-manifest.json',root),'utf8'));
for(const f of manifest.files)assert.equal(hash(await fs.readFile(new URL(f.path,root))),f.sha256,'Changed source: '+f.path);
const tap=await fs.readFile(new URL('tests.tap',evidence),'utf8'),inspect=JSON.parse(await fs.readFile(new URL('inspect.json',evidence),'utf8'));
const telemetry=JSON.parse(/^# isolation (.+)$/m.exec(tap)[1]);
assert.deepEqual(telemetry.events,[]);assert.equal(telemetry.uid,65534);assert.equal(telemetry.verifiedFiles,manifest.files.length);
for(const [label,count] of [['tests',expected],['pass',expected],['fail',0]])assert.match(tap,new RegExp('^# '+label+' '+count+'$','m'));
assert.doesNotMatch(tap,/^not ok /m);assert.equal(inspect.exitCode,0);assert.equal(inspect.network,'none');
assert.equal(inspect.readOnly,true);assert.equal(inspect.binds,null);assert.equal(inspect.user,'65534:65534');
assert.deepEqual(inspect.capDrop,['ALL']);assert.ok(inspect.securityOpt.includes('no-new-privileges'));
assert.ok(inspect.mounts.every(m=>m.Type==='volume'&&m.Destination==='/ql/data'));
const packageHash=hash(await fs.readFile(new URL('.local/jd-wskey-race-test.tar.gz',root)));
assert.ok((await fs.readFile(new URL('package.sha256',evidence),'utf8')).startsWith(packageHash));
const report={bundleSha256:manifest.files.find(f=>f.path==='get_jd_app_wskey.js').sha256,
  baseImage:'whyour/qinglong@sha256:3e3971e78edbb5a6a6900bdfb7cd37352a535416f7ad2451747e601a7558d400',
  testPackageSha256:packageHash,evidenceSha256:hash(tap),tests:expected,passed:expected,failed:0,
  container:inspect,telemetry,credentials:'synthetic only',evidence:'test/isolation.tap',realDeviceCapture:'pending',conversionAndRenewal:'not implemented'};
await fs.writeFile(new URL('jd-wskey-local/isolation-report.json',root),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(new URL('jd-wskey-local/test/isolation.tap',root),tap);
console.log(JSON.stringify({tests:expected,passed:expected,bundleSha256:report.bundleSha256}));
