import fs from 'node:fs/promises';
import {loonConfigs} from './loon-config.mjs';
const configs = loonConfigs(process.argv[2]), root = new URL('../',import.meta.url);
for (const [path,text] of Object.entries(configs)) {
  if (path === 'boxjs.json') {
    const existing = JSON.parse(await fs.readFile(new URL(path,root),'utf8'));
    const web = JSON.parse(text).apps[0];
    existing.apps = [web,...existing.apps.filter(a => a.id !== web.id)];
    await fs.writeFile(new URL(path,root),JSON.stringify(existing,null,2)+'\n');
  } else {
    const target = path.startsWith('get_jd_cookie.') ? path.replace('get_jd_cookie.','get_jd_web_cookie.') : path;
    await fs.writeFile(new URL(target,root),text);
  }
}
console.log(JSON.stringify({scriptCommit:process.argv[2],mode:'web',configs:Object.keys(configs).length}));
