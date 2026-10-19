import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = new URL('../../',import.meta.url);
const inputs = ['jd-wskey-local/src/core.mjs','jd-wskey-local/src/runner.mjs','jd-wskey-local/src/adapter.js'];
const files = [], chunks = [];
for (const path of inputs) {
  const bytes = await fs.readFile(new URL(path,root));files.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
  chunks.push(bytes.toString('utf8').replace(/^export function /gm,'function '));
}
const source = '/* 京东App WSKEY 本地抓取。Generated; see jd-wskey-local/README.md.\n * No network calls, conversion, scheduled renewal or uploads. Real-device compatibility pending.\n */\n(function () {\n\'use strict\';\n' + chunks.join('\n') + '\n})();\n';
const sha256 = createHash('sha256').update(source).digest('hex'), bundle = 'get_jd_app_wskey.js';
if (process.argv.includes('--check')) {
  if (await fs.readFile(new URL(bundle,root),'utf8') !== source) throw Error('Bundle is stale');
} else {
  await fs.writeFile(new URL(bundle,root),source);
  await fs.writeFile(new URL('jd-wskey-local/source-manifest.json',root),JSON.stringify({files,bundleSha256:sha256},null,2)+'\n');
}
console.log(JSON.stringify({bundle,sha256}));
