import fs from 'node:fs';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),events=[];
const manifest=JSON.parse(fs.readFileSync('/work/source-manifest.json','utf8'));
for(const f of manifest.files){
  if(createHash('sha256').update(fs.readFileSync('/work/'+f.path)).digest('hex')!==f.sha256)throw Error('Container source mismatch');
}
const deny=name=>()=>{events.push(name);throw Error('ISOLATION_CAPABILITY_DENIED');};
for(const [name,methods] of Object.entries({
  'node:http':['request','get'],'node:https':['request','get'],'node:net':['connect','createConnection'],
  'node:tls':['connect'],'node:dgram':['createSocket'],'node:dns':['lookup','resolve'],
  'node:child_process':['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork']
})){const mod=require(name);for(const method of methods)mod[method]=deny(name+'.'+method);}
globalThis.fetch=deny('fetch');
for(const name of ['writeFile','appendFile','mkdir','mkdtemp','rm','unlink','rmdir','rename','chmod']){
  fs.promises[name]=deny('fs.promises.'+name);
  fs[name]=deny('fs.'+name);if(fs[name+'Sync'])fs[name+'Sync']=deny('fs.'+name+'Sync');
}
syncBuiltinESMExports();
process.on('exit',()=>{console.log('# isolation '+JSON.stringify({events,verifiedFiles:manifest.files.length,node:process.version,uid:process.getuid()}));if(events.length)process.exitCode=1;});
