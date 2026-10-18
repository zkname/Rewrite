import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditLibs,auditWalk} from '../../../jd_scripts-audit/tools/decoder.mjs';
const root=new URL('../../',import.meta.url);
const source=await fs.readFile(new URL('get_jd_wskey.js',root),'utf8');
const ast=auditLibs.acorn.parse(source,{ecmaVersion:'latest',locations:true}),findings=[],hosts=new Set();
auditWalk(ast,node=>{
  const flag=reason=>findings.push({line:node.loc.start.line,reason});
  if(['ImportExpression','ImportDeclaration','WithStatement'].includes(node.type))flag('dynamic/import capability');
  if(['CallExpression','NewExpression'].includes(node.type)&&node.callee.type==='Identifier'&&['eval','Function','require','fetch','Worker','WebSocket'].includes(node.callee.name))flag('unexpected code/network capability');
  if(node.type==='MemberExpression'&&node.object.type==='Identifier'&&['console','process'].includes(node.object.name))flag('console/process access');
  if(node.type==='Literal'&&typeof node.value==='string'){
    if(node.value.startsWith('http:'))flag('plaintext URL');
    if(node.value.startsWith('https:')){try{hosts.add(new URL(node.value).hostname);}catch{flag('invalid literal URL');}}
  }
});
const allowed=['api.m.jd.com','un.m.jd.com','me-api.jd.com','home.m.jd.com','plogin.m.jd.com'];
for(const host of hosts)if(!allowed.includes(host))findings.push({reason:'unexpected hostname',host});
const report={bundleSha256:createHash('sha256').update(source).digest('hex'),findings,literalHosts:[...hosts].sort(),
  emittedRequestHosts:['api.m.jd.com','un.m.jd.com','me-api.jd.com'],runtimeDependencies:[],
  manualReview:['Only Loon local storage and fixed JD requests receive credentials','Capture and conversion are separate','No notification or console output contains raw credentials','Remote data never enters a code loader','TLS verification explicitly enabled; redirects and automatic cookie jar disabled'],
  limits:['Mobile Loon API compatibility and current JD protocol not yet verified','Cooperative store fencing is not a cross-process atomic compare-and-swap','Local Loon/BoxJs storage is not claimed to be encrypted']};
await fs.writeFile(new URL('jd-cookie-local/static-audit.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({findings:findings.length,bundleSha256:report.bundleSha256}));if(findings.length)process.exitCode=1;
