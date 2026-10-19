// Local release preparation only. Never commits, pushes or calls GitHub.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {wskeyConfigs} from './loon-config.mjs';
import {loonConfigs} from '../../jd-cookie-local/tools/loon-config.mjs';
const root = new URL('../../',import.meta.url), revision = process.argv[2], configs = wskeyConfigs(revision);
const committed = execFileSync('git',['show',revision+':get_jd_app_wskey.js'],{cwd:root,encoding:'utf8'});
if (committed !== await fs.readFile(new URL('get_jd_app_wskey.js',root),'utf8')) throw Error('Commit does not contain this bundle');
const web = loonConfigs('0b4a30a933a4bc549dbff0c592e10400b182abce');
await fs.writeFile(new URL('jd-cookie-local/get_jd_web_cookie.plugin',root),web['get_jd_cookie.plugin']);
await fs.writeFile(new URL('jd-cookie-local/get_jd_web_cookie.legacy.plugin',root),web['get_jd_cookie.legacy.plugin']);
for (const [path,content] of Object.entries(configs)) await fs.writeFile(new URL('jd-wskey-local/'+path,root),content);
// Existing subscription URLs switch back to App capture only when these files are published.
await fs.writeFile(new URL('jd-cookie-local/get_jd_cookie.plugin',root),configs['get_jd_wskey.plugin']);
await fs.writeFile(new URL('jd-cookie-local/get_jd_cookie.legacy.plugin',root),configs['get_jd_wskey.legacy.plugin']);
// Keep the existing BoxJs subscription: add the App entry without removing web results.
const existing = JSON.parse(await fs.readFile(new URL('jd-cookie-local/boxjs.json',root),'utf8'));
existing.apps = existing.apps.filter(a => a.id !== 'zkname.jd-app-wskey');
existing.apps.push(...JSON.parse(configs['boxjs.json']).apps);
existing.name = '京东本地凭据（App WSKEY / 网页 Cookie）';
await fs.writeFile(new URL('jd-cookie-local/boxjs.json',root),JSON.stringify(existing,null,2)+'\n');
console.log(JSON.stringify({prepared:true,scriptCommit:revision,pushed:false}));
