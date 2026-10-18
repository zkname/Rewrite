# 京东 App → Loon 手动本地转换（实验版）

从京东 App 请求捕获 wskey，在 Loon 手动换取 `pt_key/pt_pin`，经京东登录校验后保存到手机本地。
**当前只通过合成测试；Loon 真机、京东当前转换接口和京豆查询都尚未验收。不要把实验版当成已可用工具。**

脚本只有三个固定 HTTPS 外联：京东 genToken、appjmp、登录状态校验。签名、MD5、Base64 全在本地。
没有第三方签名服务、远程算法、自动上传、Telegram 推送、自动转换定时或青龙管理操作。

## 手机操作

1. 在 Loon 停用原 WSKEY 捕获规则，避免与新规则重复执行。只安装下列一个插件：
   `get_jd_cookie.plugin` 适用于 Loon 3.5.1 Build 983+；更早版本使用 `get_jd_cookie.legacy.plugin`。
   插件中的脚本 URL 固定到经过测试的提交，见 `release.json`。首次下载是安装步骤，不是运行时获取算法。
2. 捕获需要 Loon 已正常启用 MitM，并由用户在系统中完成证书安装和信任。
   仅解密 `blackhole.m.jd.com` 和 `perf.m.jd.com`。脚本自身 HTTPS 请求明确启用证书校验。
   如京东 App 拒绝代理证书或无法捕获，停止并排查兼容性，不关闭证书校验绕过。
3. 保持京东 App 已登录，划掉后台重新打开。出现“已捕获”后，十五分钟内到 Loon 脚本列表手动运行
   “京东Cookie手动转换”。一次只转换最近捕获的凭据，不会在请求钩子里发起转换。
4. 在已有 BoxJs 中添加本目录 `boxjs.json` 的订阅，打开“京东本地Cookie”。成功结果形如：

   ```json
   [{"userName":"账号标识","cookie":"pt_key=实际值; pt_pin=实际值;"}]
   ```

   复制对应的 `cookie` 字段，不要复制整个数组。通知只显示状态，不会展示凭据。
5. 将 Cookie 输入电脑上已准备好的受保护配置助手，再运行京豆查询。不要粘贴到聊天、工单或 GitHub。
   登录校验成功只会标记 `LOGIN_VERIFIED`，不会将京豆查询或其他任务标为已验收。

Loon 本地持久化和 BoxJs 查看数据**不承诺加密存储**。不要开启这些凭据的云同步/备份，勿分享截图。
旧 `wskeyList` 不会被新脚本读取、上传、迁移或清空；需要时可在原 BoxJs 应用中自行清理。

## 失败、账号与频率

- 同一请求带有 pin 时核对返回账号；单独出现 pin 的请求不与其他请求的 wskey 拼接。
  没有 pin 时，以京东返回的 pt_pin 和登录校验确认账号。
- 转换中状态阻止重叠；同一 wskey 十五分钟内不再转换。失败后不自动重试、不覆盖旧的有效 Cookie。
  过期捕获会在下次手动运行时清除。成功后清除已消费的捕获，但保留期间新到达的捕获。
- `CAPTURE_REQUIRED/EXPIRED`：重新打开 App 捕获；`CONVERSION_BUSY/COOLDOWN`：等待，不反复点击。
- `TOKEN_REJECTED/HTTP_REJECTED/LOGIN_UNCONFIRMED`：京东可能不再接受旧协议或当前状态不允许。
  不回退到 HTTP、关闭证书校验、远程签名服务或不明响应的执行路径。
- `NETWORK_ERROR` 包括 TLS 校验失败；错误细节和响应不会打印，避免凭据进入日志。
- Loon 存储没有原子比较交换操作，采用同步状态和 nonce 复查进行协作互斥；不能把它视为跨进程事务锁。

## 开发、审计和来源

仓库其余脚本与本工具无关，本测试只运行本目录和根目录 `get_jd_wskey.js`。

```text
node jd-cookie-local/tools/build.mjs --check
node --test jd-cookie-local/test/*.test.mjs
```

修改明文源代码后运行 `node jd-cookie-local/tools/build.mjs` 重建单文件脚本。
`test/vectors.json` 为已提交的合成向量；`python jd-cookie-local/test/reference-sign.py` 可独立再生成其参考结果。
检查 source-manifest、static-audit 和 isolation-report 后，才可以发布新的测试脚本提交。
发布配置使用 `node jd-cookie-local/tools/write-loon-config.mjs <已审查的40位脚本提交>`，不得引用可变 main。
隔离构建文件及明确的源文件清单在 tools 中；不把整库无关脚本打包进测试镜像。

来源和适用声明见 [NOTICE.md](NOTICE.md)，本地协议参数使用 Android 11.1.4，可能已经失效。
不要因为断网测试通过就修改状态为“可用”。真机转换、登录校验、电脑京豆查询三项全部明确通过，
才允许把测试分支合并到 main。之后原 jd-tasks-local 的四项任务验收和生产发布门槛继续执行。
