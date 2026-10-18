import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),evidence=new URL(process.argv[2]||'.local/jd-loon-audit.2inazz/',root);
const expectedTests=Number(process.argv[3]||66);
assert.ok(evidence.href.startsWith(new URL('.local/',root).href)&&evidence.pathname.endsWith('/'),'Pass a local evidence directory');
assert.ok(Number.isSafeInteger(expectedTests)&&expectedTests>0,'Pass the expected test count');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const snapshot=JSON.parse(await fs.readFile(new URL('loon-container/source-manifest.json',evidence),'utf8'));
for(const file of snapshot.files)assert.equal(sha256(await fs.readFile(new URL(file.path,root))),file.sha256,'Source changed since isolation: '+file.path);
const tap=await fs.readFile(new URL('tests.tap',evidence),'utf8');
const telemetry=JSON.parse(/^# isolation (.+)$/m.exec(tap)[1]);
assert.deepEqual(telemetry.events,[]);assert.equal(telemetry.uid,65534);assert.equal(telemetry.verifiedFiles,snapshot.files.length);
assert.match(tap,new RegExp('^# tests '+expectedTests+'$','m'));assert.match(tap,new RegExp('^# pass '+expectedTests+'$','m'));
assert.match(tap,/^# fail 0$/m);assert.doesNotMatch(tap,/^not ok /m);
const container=JSON.parse(await fs.readFile(new URL('inspect.json',evidence),'utf8'));
assert.equal(container.exitCode,0);assert.equal(container.network,'none');assert.equal(container.readOnly,true);assert.equal(container.binds,null);
assert.deepEqual(container.capDrop,['ALL']);assert.ok(container.securityOpt.includes('no-new-privileges'));
const oracleBytes=await fs.readFile(new URL('oracle.json',evidence));
assert.deepEqual(JSON.parse(oracleBytes),JSON.parse(await fs.readFile(new URL('jd-cookie-local/test/vectors.json',root),'utf8')));
const report={bundleSha256:snapshot.files.find(x=>x.path==='get_jd_wskey.js').sha256,
  baseImage:'whyour/qinglong@sha256:3e3971e78edbb5a6a6900bdfb7cd37352a535416f7ad2451747e601a7558d400',
  tests:expectedTests,passed:expectedTests,failed:0,referenceVectors:32,container,telemetry,tapSha256:sha256(tap),oracleSha256:sha256(oracleBytes),
  credentialsUsed:'synthetic-only',live:{loon:'pending',jdExchange:'pending',beanQuery:'pending'},mainMergeAllowed:false};
await fs.writeFile(new URL('jd-cookie-local/isolation-report.json',root),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(new URL('jd-cookie-local/test/isolation.tap',root),tap);
console.log(JSON.stringify({tests:expectedTests,passed:expectedTests,referenceVectors:32,bundleSha256:report.bundleSha256}));
