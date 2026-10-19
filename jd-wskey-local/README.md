# 京东 App WSKEY 本地抓取

恢复 App 抓取用途，独立保留网页版工具。脚本观察 `blackhole.m.jd.com`、`perf.m.jd.com`
的 HTTPS 请求，以及 `https://sh.jd.com/j/<标识>` 请求；不改变请求、不发送网络请求、不自动转换或续期、不上传。
前两个域名来自原插件，`sh.jd.com/j/…` 来自用户实际观察到的 App 请求结构。测试仅使用合成数据，
不保存用户提供的凭据、完整 URL 或设备参数。手机插件仍须实测。

## 手机使用

已发布到 `feat/jd-cookie-local` 测试分支，原 `jd-cookie-local/get_jd_cookie.plugin` 与 `.legacy.plugin` 订阅入口改为 App 抓取。
本次 `sh.jd.com/j/…` 兼容修复先保存在本地，尚未推送；已发布版本仍只有原来的两个域名。
新版语法适用于 Loon 3.5.1 Build 983+；旧客户端用 legacy。仅启用其中一个，停用其他旧 wskey 规则。
在 Loon 更新已有插件、在 BoxJs 更新已有订阅后使用；手机抓取仍须实测。

1. 在 Loon 启用插件与 MitM，安装并信任 Loon 证书。MitM 域名为 `blackhole.m.jd.com`、`perf.m.jd.com`、`sh.jd.com`。
   Loon 的 MitM 按域名生效；脚本对 `sh.jd.com` 只匹配 `/j/<标识>`，不保存其他路径的请求数据。
2. 保持 App 登录，划掉后台重新打开，正常使用首页和“我的”。没有保证触发的固定页面。
3. 在 Loon 脚本列表点“京东App抓取状态”。此操作本地执行，即使没有匹配请求也能提示状态。
4. 更新已有 BoxJs 订阅 `jd-cookie-local/boxjs.json`，打开新增的“京东App WSKEY”。
   原“京东本地Cookie”仍展示网页校验结果，与 wskey 数据互不混用。
5. 在“最近抓到的 WSKEY”中复制 `credential.cookie`。同一请求有 pin 时是
   `pin=…; wskey=…;`；只有 wskey 时保持账号未知，后续换取并验证 Cookie 才能确认身份。
   请求里的 `pin_hash` 不能当作 `pin`；只有 wskey 和 pin_hash 时显示 `APP_WSKEY_ONLY` 是预期结果。
   不发送到聊天或日志，不手动拼接其他请求的 pin。用完运行“京东App清除暂存”。

| 状态 | 含义 |
| --- | --- |
| APP_NOT_SEEN | 插件尚未看到匹配请求；检查 MitM、证书、插件及请求记录 |
| APP_NO_COOKIE | 匹配请求没有 Cookie 头 |
| APP_NO_WSKEY | 匹配请求的 Cookie 没有 wskey |
| APP_WSKEY_ONLY | 已抓到 wskey，同一请求没有 pin |
| APP_CAPTURED | 同一请求有 wskey 和 pin，尚未验证有效性或账号身份 |
| APP_EXPIRED | 暂存超过十五分钟或设备时间回退；这是本地期限，不是京东失效结论 |

通知不显示凭据或账号；同状态自动提示每分钟最多一次，新凭据可以立即提示。手动状态总会提示。
最新一条带 wskey 的请求覆盖本插件暂存，绝不跨请求合并账号。只有 pin 的请求不改写已有凭据。
暂存满十五分钟后，在下一次执行时清除；脚本不常驻，BoxJs 打开不会触发后台过期清理。
本地 Loon/BoxJs 存储不承诺加密，请不要备份或共享其敏感字段。旧 `wskeyList` 不读取、不迁移。

## 保留网页版

归档入口是 `jd-cookie-local/get_jd_web_cookie.plugin` 与 `.legacy.plugin`，内部仍固定到已发布的
网页脚本提交。根目录旧文件名 `get_jd_wskey.js` 仍为网页兼容脚本；新的 App 脚本文件为
`get_jd_app_wskey.js`，避免改变已有固定网页订阅的含义。

## 本地验证与发布准备

```text
node jd-wskey-local/tools/build.mjs
node --test jd-wskey-local/test/*.test.mjs
node jd-wskey-local/tools/audit.mjs
```

生成脚本只含本目录三份明文源码，无运行依赖。先将通过检查的脚本提交到本地 Git，再运行
`node jd-wskey-local/tools/write-config.mjs <完整本地提交号>` 固定插件引用。该工具只写本地配置，
不提交、不推送、不修改远端。是否推送由用户另行明确授权；不自动合并 main。

原版参考：`zkname/Rewrite@a8b75ba3433521bc334627dc8f7a1ba540feecb4:get_jd_wskey.js`。
沿用原版两个监听域名与抓取用途，并加入实测观察到的 sh 路径；解析、状态和适配器重新实现，无旧 Env 包装器、签名、HTTP 客户端、
跨请求缓存拼接、凭据日志及自动提交配置。未将上游原版擅自标为自有代码。
