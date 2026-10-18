import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),audit=new URL('../../../jd_scripts-audit/',import.meta.url);
const source=await fs.readFile(new URL('original/jd_wskey.py',audit),'utf8');
const snapshot=JSON.parse(await fs.readFile(new URL('metadata/snapshot.json',audit),'utf8'));
const expected=snapshot.files.find(x=>x.path==='jd_wskey.py').sha256;
const sha256=createHash('sha256').update(source).digest('hex');
if(sha256!==expected)throw Error('Pinned source hash mismatch');
const reference=await fs.readFile(new URL('test/reference-sign.py',root),'utf8');
for(const name of ['sign_core','get_sign']){
  const expression=new RegExp('^def '+name+'\\([\\s\\S]*?(?=^def |^bodies =|$(?![\\s\\S]))','m');
  if(source.match(expression)?.[0].trim()!==reference.match(expression)?.[0].trim())throw Error('Reference function differs: '+name);
}
const result=spawnSync('python',[fileURLToPath(new URL('test/reference-sign.py',root))],{encoding:'utf8'});
if(result.status!==0)throw Error('Synthetic oracle failed');
const vectors=JSON.parse(result.stdout);if(vectors.length!==32)throw Error('Wrong vector count');
await fs.writeFile(new URL('test/vectors.json',root),JSON.stringify(vectors,null,2)+'\n');
await fs.writeFile(new URL('provenance.json',root),JSON.stringify({capture:{repository:'zkname/Rewrite',commit:'a8b75ba3433521bc334627dc8f7a1ba540feecb4',file:'get_jd_wskey.js',sha256:'08f5f1178af5d71af321137c78c6aa44fb1bc78f4877e4d9b5cefc5e6bb5d6e2'},
  signing:{repository:snapshot.repository,commit:snapshot.revision,file:'jd_wskey.py',sha256,functions:['sign_core','get_sign','base64Encode','genParams','genJDUA']},
  crypto:'Standalone local RFC 1321 MD5 and RFC 4648 Base64; no runtime package downloads',status:'experimental-live-unverified'},null,2)+'\n');
console.log(JSON.stringify({vectors:vectors.length,pinnedSourceSha256:sha256}));
