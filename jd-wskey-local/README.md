# 京东 App WSKEY 本地抓取与合并

分别捕获 App 请求中的 `wskey` 和 `pt_pin`（兼容旧 `pin` 输入），在十五分钟内到齐后自动合并为
`pt_pin=…; wskey=…;`，只保存到手机本地。抓取顺序不限，原始记录分别保留。
同一请求同时存在两个账号字段时，必须解码为相同账号，并保留 `pt_pin` 原有编码；冲突则拒绝保存。
合并结果标为“待核验”：时间接近不能证明两个字段属于同一账号，也不能证明凭据有效。
工具不转换 Cookie、不续期、不上传，不改变 App 原请求。

观察的 HTTPS 入口为 `blackhole.m.jd.com`、`perf.m.jd.com`，以及 `sh.jd.com/j/<标识>`、
`mars.jd.com/log/sdk/v2`。前两个域名来自原插件，后两个路径来自用户实际观察到的请求结构。
仅提取 wskey、pin、pt_pin，不保存 pt_key、pin_hash、设备字段或完整 URL。

## 手机使用

`pt_pin` 字段名修复已发布到 `feat/jd-cookie-local` 分支，源码固定为 `16627fb01b74f8facbe7114abfaa6ebde9512257`。
插件配置提交为 `00411cce52cb2998e1bb61455d4724a77edeb7e9`；已从 GitHub 下载核对一致。更新以下现有入口，
无需新建订阅：Loon 的 `jd-cookie-local/get_jd_cookie.plugin`，BoxJs 的 `jd-cookie-local/boxjs.json`。
新版语法适用于 Loon 3.5.1 Build 983+；旧客户端用 `.legacy.plugin`。仅启用其中一个，停用其他旧 wskey 规则。

1. 更新 Loon 插件和 BoxJs 订阅。启用 MitM 并信任 Loon 证书；域名列表应包括
   `blackhole.m.jd.com`、`perf.m.jd.com`、`sh.jd.com`、`mars.jd.com`。
2. 在 Loon 脚本列表先运行“京东App清除暂存”。保持同一京东账号登录，划掉后台重新打开，
   正常使用首页和“我的”。没有保证触发的固定页面；切换账号前必须再次清除暂存。
3. 只有 wskey 时提示等待 pin/pt_pin，只有 pin/pt_pin 时提示等待 wskey；两项到齐后提示“已合并保存”。
   可运行“京东App抓取状态”手动查看状态。
4. 在 BoxJs → 应用 → “京东App WSKEY” → “合并结果（待核验，敏感）”，复制 JSON 中的 `cookie` 字段，
   格式为 `pt_pin=…; wskey=…;`。不要复制整个 JSON，也不要发到聊天或日志。
5. 用完运行“京东App清除暂存”。只有 `pin_hash` 时无法补全 pin，仍需等待另一条请求携带 pin/pt_pin。

| 状态 | 含义 |
| --- | --- |
| APP_NOT_SEEN | 尚未看到匹配请求；检查 MitM、证书、插件及请求记录 |
| APP_NO_COOKIE | 最近匹配请求没有 Cookie 头 |
| APP_NO_WSKEY | 最近匹配请求没有 wskey 或 pin/pt_pin |
| APP_WSKEY_ONLY | 已抓到 wskey，等待 pin/pt_pin |
| APP_PIN_CAPTURED | 已抓到 pin/pt_pin，等待 wskey |
| APP_MERGED_UNVERIFIED | 已跨请求合并保存，未核验账号归属与有效性 |
| APP_CAPTURED | 同一请求已抓到 wskey 和 pin/pt_pin，未核验有效性 |
| APP_EXPIRED | 暂存超过十五分钟或设备时间回退；这是本地期限，不是京东失效结论 |

两个字段分别计算十五分钟期限。观察到 pin 变化会清除旧 wskey；观察到 wskey 变化会清除旧 pin，
并清除旧合并结果。如果新请求同时携带两项，则保存这一请求的完整记录。
未观察到的账号切换仍可能造成误配，因此合并结果始终不算已验证身份。
通知只显示固定状态，不显示凭据或账号；同状态自动提示每分钟最多一次，新凭据可以立即提示。

过期清理在下一次脚本执行时发生；脚本不常驻，单独打开 BoxJs 不会触发清理。
Loon 存储没有跨执行事务保证，高并发下不保证写入顺序，也不承诺加密。不要云备份敏感字段。
旧 `wskeyList` 不读取、不迁移。网页“京东本地Cookie”和 `jdCookieList` 保持独立。

升级修复版后，运行“京东App抓取状态”或下一次触发抓取，会将本插件未过期的旧 `pin=` 输出
迁移为 `pt_pin=`，保持原抓取时间、十五分钟期限和未核验身份标记。过期或损坏记录不会被迁移复活。
仅打开 BoxJs 不会执行迁移；只有孤立旧合并结果、缺少有效来源缓存时不能恢复。

## 保留网页版

归档入口是 `jd-cookie-local/get_jd_web_cookie.plugin` 与 `.legacy.plugin`，固定到已发布的网页脚本提交。
根目录旧文件名 `get_jd_wskey.js` 仍为网页兼容脚本，App 脚本文件为 `get_jd_app_wskey.js`。

## 本地验证与发布准备

```text
node jd-wskey-local/tools/build.mjs
node --test jd-wskey-local/test/*.test.mjs
node jd-wskey-local/tools/audit.mjs
```

生成脚本只含本目录三份明文源码，无运行依赖。先将通过检查的脚本提交到本地 Git，再运行
`node jd-wskey-local/tools/write-config.mjs <完整本地提交号>` 固定插件引用。该工具只生成本地配置，
不提交、不推送。是否推送由用户明确授权，不自动合并 main。隔离验证记录见 `AUDIT.md` 和 `isolation-report.json`。

原版参考：`zkname/Rewrite@a8b75ba3433521bc334627dc8f7a1ba540feecb4:get_jd_wskey.js`。
沿用原版抓取用途；解析、状态、适配器和本次明确标记未核验的限时配对重新实现。
无旧 Env 包装器、签名、HTTP 客户端、凭据日志或自动提交配置。未将上游原版擅自标为自有代码。
