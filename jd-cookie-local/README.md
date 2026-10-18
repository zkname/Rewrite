# 京东网页 Cookie → Loon 本地保存（实验版）

用 Safari 正常登录京东网页版，捕获同一请求中的 `pt_key/pt_pin`，再手动校验登录并保存到 BoxJs。
已移除 App 捕获、wskey 换取、签名算法及设备参数。网页捕获和查看状态均不发起网络请求；
只有手动登录校验访问一次京东官方 HTTPS 接口。没有第三方上传、推送或定时任务。

当前已通过合成与断网测试；真实手机捕获、带账号的登录校验和京豆查询仍待用户实测。

## 更新和使用

1. 更新 Loon 中原来的插件，更新后应显示“京东网页 Cookie（实验版）”。只保留一份启用的插件。
   订阅地址保持不变：[Build 983+](https://raw.githubusercontent.com/zkname/Rewrite/refs/heads/feat/jd-cookie-local/jd-cookie-local/get_jd_cookie.plugin)；
   [旧版 Loon](https://raw.githubusercontent.com/zkname/Rewrite/refs/heads/feat/jd-cookie-local/jd-cookie-local/get_jd_cookie.legacy.plugin)。
   若此前安装的是带固定提交号的旧地址，需要换成以上测试分支地址；它内部的脚本仍固定到已检查的提交。
2. 保持 Loon 插件及 MitM 启用，证书已安装并信任。新规则只匹配 `m.jd.com`、`home.m.jd.com`、`my.m.jd.com`。
   更新后如有客户端要求刷新 MitM 配置，请按 Loon 提示应用；不要关闭证书验证。
3. 在 **Safari 地址栏**打开 <https://my.m.jd.com/index.html>，按网页提示登录，再打开这个“我的”页面。
   留在网页，不点击“打开京东 App”。App 登录状态和 Safari 登录状态并不相同。
4. 出现“已捕获网页 Cookie”后，十五分钟内在 Loon 脚本列表手动运行 **京东网页Cookie校验并保存**。
   这是一次官方登录状态检查，不涉及 Cookie 换取或签名。失败不自动重试，之前已保存的账号记录保留。
5. 提示“登录校验通过”后，到 BoxJs 的 **京东本地Cookie**，复制所需账号的 `cookie` 字段。
   [BoxJs 订阅](https://raw.githubusercontent.com/zkname/Rewrite/refs/heads/feat/jd-cookie-local/jd-cookie-local/boxjs.json)已更新为网页版说明；存储键保持兼容。

```json
[{"userName":"账号标识","cookie":"pt_key=实际值; pt_pin=实际值;"}]
```

只复制 `cookie` 字段，不要复制整个数组。任务项目仍通过受保护的本地配置接收 Cookie，勿粘贴到聊天。
`LOGIN_VERIFIED` 只代表该次登录校验成功；`queryVerification=pending` 表示京豆查询尚未验收。

## 没有提示时

在 Loon 手动运行 **京东网页抓取状态**。该操作不联网，每次都会尝试显示通知，并写入 BoxJs 的状态字段。

| 状态 | 含义与操作 |
| --- | --- |
| WEB_NOT_SEEN | 尚未看到匹配的网页请求。确认使用 Safari、插件与 MitM 已启用，打开上述网页。 |
| WEB_NO_COOKIE | 请求已触发，但没有 Cookie。先在 Safari 登录。 |
| WEB_INCOMPLETE | 请求中没有同时出现 pt_key 和 pt_pin。完成网页登录后重新打开“我的”。 |
| WEB_CAPTURED | 已抓到完整 Cookie，等待手动校验。 |
| WEB_EXPIRED | 暂存超过十五分钟；重新访问网页抓取。 |
| LOGIN_UNCONFIRMED | 京东未确认登录；在 Safari 重新登录后再抓取。 |
| LOGIN_VERIFIED | 校验通过，结果已保存到 Cookie 列表。 |

自动通知对同一种结果在一分钟内去重；新捕获的账号或 Cookie 立即通知。手动状态不受去重限制。
状态字段同时保留最近请求的结果和时间。通知完全不出现时，可检查 iOS 的 Loon 通知权限，
并从 BoxJs 状态字段区分脚本已运行但通知被屏蔽与脚本未触发。

## 保存与安全边界

- 只取同一请求中的两项凭据，不读取登录密码或请求正文，不拼接不同请求或账号的数据。
- 暂存与已验证列表分离。暂存十五分钟内可校验，过期在手动查看或校验时清除；没有后台清理定时。
- 手动校验只访问 `https://me-api.jd.com/user_new/info/GetJDUserInfoUnion`，显式校验证书，关闭自动跳转和 Cookie jar。
- 原网页请求原样放行。登录校验失败、账号不匹配、超时、限流等不自动重试或覆盖已验证列表。
- 原 App 的 wskey 缓存不会读取、迁移或上传；需要清理时由用户在本机处理。已经验证的 `jdCookieList` 保留。
- 本地 Loon/BoxJs 存储不承诺加密；勿分享截图、导出数据或启用凭据云备份。Cookie 仍可能被京东撤销或过期。

## 开发与验证

```text
node jd-cookie-local/tools/build.mjs
node --test jd-cookie-local/test/*.test.mjs
node jd-cookie-local/tools/build.mjs --check
```

发布配置：`node jd-cookie-local/tools/write-loon-config.mjs <已审查的40位脚本提交>`。
两个手动入口与网页捕获入口都使用同一固定脚本。`get_jd_wskey.js` 文件名仅为兼容既有插件入口保留。
源码清单、静态报告和断网证据见 source-manifest.json、static-audit.json、isolation-report.json。
AST 审计工具沿用相邻 `jd_scripts-audit` 工作区的固定解析器；独立检出可直接运行上述构建与合成测试，无 npm 运行依赖。

旧 App 实现及其签名参考向量保留在 Git 历史 `5c57b205a102ce52b21beb932a6bbf62ce70da42`。
本版重建网页流程测试，不再运行已移除的签名对照。来源说明见 [NOTICE.md](NOTICE.md)。
GitHub 发布仅在用户明确授权后执行。手机验收及任务项目验收完成前不合并主分支，不启用生产任务。
