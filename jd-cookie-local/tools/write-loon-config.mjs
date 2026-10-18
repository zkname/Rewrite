import fs from 'node:fs/promises';
import {loonConfigs} from './loon-config.mjs';
const configs = loonConfigs(process.argv[2]), root = new URL('../',import.meta.url);
for (const [path,text] of Object.entries(configs)) await fs.writeFile(new URL(path,root),text);
console.log(JSON.stringify({scriptCommit:process.argv[2],mode:'web',configs:Object.keys(configs).length}));
