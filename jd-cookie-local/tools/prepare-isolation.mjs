import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url),out=new URL('.local/loon-container/',root);
const paths=['get_jd_wskey.js','jd-cookie-local/src/core.mjs','jd-cookie-local/src/runner.mjs',
  'jd-cookie-local/test/core.test.mjs','jd-cookie-local/test/workflow.test.mjs','jd-cookie-local/test/adapter.test.mjs',
  'jd-cookie-local/test/vectors.json','jd-cookie-local/test/reference-sign.py',
  'jd-cookie-local/tools/isolation-guard.mjs','jd-cookie-local/tools/Dockerfile.test'];
const files=[];
for(const path of paths){
  const bytes=await fs.readFile(new URL(path,root)),dest=new URL(path,out);
  await fs.mkdir(new URL('./',dest),{recursive:true});await fs.writeFile(dest,bytes);
  files.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await fs.writeFile(new URL('source-manifest.json',out),JSON.stringify({files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,bundleSha256:files[0].sha256}));
