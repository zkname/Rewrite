import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditLibs,auditWalk} from '../../../jd_scripts-audit/tools/decoder.mjs';
const root=new URL('../../',import.meta.url),source=await fs.readFile(new URL('get_jd_app_wskey.js',root),'utf8');
const ast=auditLibs.acorn.parse(source,{ecmaVersion:'latest',locations:true}),findings=[];
const banned=new Set(['eval','Function','require','fetch','Worker','WebSocket','XMLHttpRequest','process','console',
  '$httpClient','$task','setTimeout','setInterval']);
auditWalk(ast,node=>{
  const flag=reason=>findings.push({line:node.loc.start.line,reason});
  if(['ImportExpression','ImportDeclaration','WithStatement'].includes(node.type))flag('import or dynamic scope');
  if(node.type==='Identifier'&&banned.has(node.name))flag('forbidden capability: '+node.name);
  if(node.type==='Literal'&&typeof node.value==='string'&&/^https?:/.test(node.value))flag('unexpected endpoint literal');
});
const report={bundleSha256:createHash('sha256').update(source).digest('hex'),findings,mode:'app-wskey',
  emittedRequestHosts:[],runtimeDependencies:[],
  reviewed:['Only exact blackhole/perf HTTPS hosts, sh.jd.com /j/<id> and mars.jd.com /log/sdk/v2 HTTPS requests are read','No network, process, dynamic code or logging API',
    'Capture and manual status forward the original request unchanged','Credentials are stored only in dedicated local App storage',
    'Cross-request pairing is explicitly unverified and limited to fifteen minutes; observed changes suspend pairing without deleting raw peer data',
    'V2 isolates legacy writers; merged output and status are rechecked after writes with bounded reconciliation',
    'Only explicit clear deletes raw records; malformed requests and expiry never delete a fresh peer capture','Only fixed status codes reach notifications'],
  limits:['Current JD App and Loon compatibility still require phone testing','Local storage is not claimed to be encrypted',
    'Expired raw values remain until explicit clear; view expiry is checked on execution, not by BoxJs',
    'No cross-execution transaction or chronological guarantee for simultaneous writes to the same field; sustained changes report busy',
    'Pause App traffic before clear; an already-started raw write can finish late but its revoked generation cannot merge',
    'Time proximity cannot prove that wskey and pin belong to the same account','No conversion, renewal or Qinglong acceptance is performed']};
await fs.writeFile(new URL('jd-wskey-local/static-audit.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({findings:findings.length,bundleSha256:report.bundleSha256}));if(findings.length)process.exitCode=1;
