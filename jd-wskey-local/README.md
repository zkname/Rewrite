# 京东 App WSKEY 本地抓取与合并

捕获 App 请求中的 `wskey` 与 `pt_pin`（兼容旧 `pin` 输入），十五分钟内到齐后自动合并为
`pt_pin=…; wskey=…;`，只保存到手机本地，不上传、不转换、不续期、不改变原请求。
跨请求结果标为 `cross-request-unverified`：时间接近不能证明两个字段属于同一账号，也不能证明凭据有效。

## 更新与使用

本次修复两类请求交错时合并结果被覆盖、过期或异常请求误删 wskey，以及旧版脚本破坏新版缓存的问题。
使用独立 **V2 缓存**，不自动迁移 V1 凭据。源码和配置的固定提交、发布核对结果见 `release.json`。

1. 同时更新 Loon 插件和 BoxJs 订阅，保留现有订阅地址：
   - Loon：`https://raw.githubusercontent.com/zkname/Rewrite/refs/heads/feat/jd-cookie-local/jd-cookie-local/get_jd_cookie.plugin`
   - BoxJs：`https://raw.githubusercontent.com/zkname/Rewrite/refs/heads/feat/jd-cookie-local/jd-cookie-local/boxjs.json`
2. Loon 3.5.1 Build 983+ 使用上面的插件，旧客户端使用同路径 `.legacy.plugin`。
   只启用其中一个，停用其他旧 wskey 规则。启用 MitM 并信任证书。
3. 先退出京东 App，待请求结束后运行“京东App清除暂存”，再重新打开 App，保持同一账号正常使用。
   没有保证触发的固定页面；四个域名应为 `blackhole.m.jd.com`、`perf.m.jd.com`、`sh.jd.com`、`mars.jd.com`。
4. 两项到齐会自动合并。复制前运行“京东App抓取状态”，再刷新 BoxJs → 应用 → “京东App WSKEY”
   → “合并结果（待核验，敏感）”，复制 JSON 中的 `cookie` 字段。
5. 切换账号前、复制完成后，退出 App 并运行“京东App清除暂存”。不要把凭据发到聊天或日志。

BoxJs 未更新时仍显示旧 V1 字段，会看起来“抓不到”。新版状态含 `storageVersion: 2`、
`hasWskey`、`hasPin` 和两项抓取时间，不含凭据。单独打开 BoxJs 不会执行脚本或刷新合并状态。

| 状态 | 含义 |
| --- | --- |
| APP_NOT_SEEN | 尚未看到匹配请求；检查 MitM、证书、插件及请求记录 |
| APP_NO_COOKIE / APP_NO_WSKEY | 最近匹配请求没有 Cookie / 没有需要的字段 |
| APP_WSKEY_ONLY | 已抓到 wskey，等待 pt_pin |
| APP_PIN_CAPTURED | 已抓到账号，等待 wskey |
| APP_MERGED_UNVERIFIED | 已跨请求合并，尚未核验归属和有效性 |
| APP_CAPTURED | 同一请求带有 wskey 和账号，尚未核验有效性 |
| APP_PAIR_CHANGED | 已观察到账号或 wskey 变化，暂停旧配对，等待另一侧重新捕获 |
| APP_BUSY | 持续交错写入，暂未取得稳定结果；稍后运行抓取状态 |
| APP_EXPIRED | 已过本地十五分钟窗口或设备时间回退；不代表京东判定失效 |

只接受 `blackhole.m.jd.com`、`perf.m.jd.com` 的 HTTPS，以及
`sh.jd.com/j/<标识>`、`mars.jd.com/log/sdk/v2`。不扩大到所有京东接口。
只提取 wskey、pin、pt_pin；不保存 pt_key、pin_hash、设备字段和完整 URL。
两个账号字段同时出现必须解码为同一账号，优先保留 pt_pin 原编码；pin_hash 不能代替账号。

## 缓存与并发边界

每个请求只写它实际携带的字段；没有字段或格式错误不会删除之前的有效记录。
账号或 wskey 改变时，记录需要重新捕获的另一侧，暂停旧配对，保留原始抓取数据。
合并和状态写入前后重新核对来源，有限次数内修复旧快照覆盖；不使用延时或假定锁是原子的。

两个字段分别计算十五分钟，合并期限取较早的一侧。过期值不参与合并，原始值保留到手动清除，
避免“读取旧过期值 → 误删刚写入的新值”的竞争。脚本不常驻，本地存储不承诺加密。
复制前运行抓取状态；不要使用过期视图，也不要云备份敏感字段。

Loon 没有跨执行事务或 CAS，不能保证同一字段并发写入按请求时间排序。
持续变化会报告 APP_BUSY；通知顺序也可能交错。切换账号前仍须清除，结果始终未核验。
清除先更换缓存代次，使清除前未结束的执行不能恢复可用配对，再删除原始值和 V1 暂存。
极端情况下已开始的写操作仍可晚到，留下带旧代次的原始值；它不会参与合并。
因此清除时应先退出 App，等待请求结束；如发生交错，再执行一次清除以移除残留。

旧 `wskeyList`、网页“京东本地Cookie”和 `jdCookieList` 独立保留。
网页插件归档入口为 `jd-cookie-local/get_jd_web_cookie.plugin` 与 `.legacy.plugin`。
根目录 `get_jd_wskey.js` 仍为网页兼容脚本；App 脚本是 `get_jd_app_wskey.js`。

## 验证与发布

```text
node jd-wskey-local/tools/build.mjs
node --test jd-wskey-local/test/*.test.mjs
node jd-wskey-local/tools/audit.mjs
node jd-wskey-local/tools/prepare-isolation.mjs
```

生成脚本只含三份明文源码，无运行依赖。通过检查后先本地提交源码，再运行
`node jd-wskey-local/tools/write-config.mjs <完整源码提交号>` 固定插件引用。
该工具不提交、不推送；发布须用户授权，不自动合并 main。
隔离包以固定青龙镜像运行：断网、非 root、只读根目录、不挂载宿主数据。
验证详情见 `AUDIT.md`、`isolation-report.json` 和 `test/isolation.tap`。

原版用途参考：`zkname/Rewrite@a8b75ba3433521bc334627dc8f7a1ba540feecb4:get_jd_wskey.js`。
解析、状态、适配器及未核验限时配对重新实现；不含旧 Env、签名、HTTP 客户端或自动提交配置。
