# 本轮复核记录

范围：本目录的明文 core/runner/adapter 和生成的 `get_jd_wskey.js`，不包括仓库其他脚本。
固定来源、算法声明和哈希分别见 NOTICE.md、provenance.json、source-manifest.json。

已确认并处理：

- 原捕获脚本打印完整 wskey、Cookie 和请求头，成功通知也包含凭据。本版没有 console 输出，通知只接受固定状态码及脱敏账号。
- 原捕获逻辑可跨请求拼接 wskey/pin，且同一请求同时包含两项时使用 else-if。新逻辑只关联同一请求中的信息，独立 pin 请求不参与拼接。
- 用户反馈打开 App 即出现 COOKIE_FORMAT，定位到捕获分支。使用合成的数字开头字段名、带空格的设备元数据可复现旧解析器误拒绝；未采集真实请求头，不能确认手机上具体是哪一字段触发。捕获改为仅提取 wskey/pin，忽略无关字段；保留头部类型/长度/控制字符限制、凭据合法性及重复冲突检查。带成对双引号的凭据会去除外层引号后校验，未配对引号仍拒绝。
- 参考 Python 使用 HTTP 发送 wskey，并关闭证书验证；还包含读取青龙账号及修改环境的代码。本版只移植签名与必要的协议参数。
- Loon 的 HTTP API 文档将 insecure 默认值列为 true。本版所有请求显式设置 false，并关闭自动跳转、自动 Cookie jar。
- appjmp 的 302/303 仅作为提取 Set-Cookie 的响应处理，不访问 Location，不把 tokenKey 交给其他主机。
- 成功输出需通过 Cookie 格式、过期/冲突/占位值、已有 pin 与返回身份检查，以及京东 retcode=0 登录校验；失败不会替换原有效记录。

凭据流向：wskey 只发送给 `api.m.jd.com` 的固定 genToken；返回的 tokenKey 只发送给
`un.m.jd.com` 的固定 appjmp；获得的 Cookie 只发送给 `me-api.jd.com` 的固定登录验证。
`plogin.m.jd.com` 是固定跳转目标参数、`home.m.jd.com` 是 Referer，本脚本不向它们主动发请求。
所有请求都在手动转换入口执行，App 请求捕获入口只读请求头并写 Loon 本地存储。

测试：72 项合成测试通过；包含 32 组与固定 Python 纯函数的签名对照、10 组 MD5/UTF8/Base64
对照、Set-Cookie 解析、账号切换、重复触发、存储失败、超时/证书错误、回调仅结束一次等。
新增回归覆盖数字开头及标点字段名、无关元数据、引用值、重复/无效凭据与畸形请求头；
完整单文件脚本的模拟捕获确认原请求不变、结束一次、无网络/日志调用。失败保留之前的有效捕获。
隔离容器非 root、断网、只读根文件系统、capabilities 全部丢弃、无宿主挂载；10 个文件逐个校验哈希。
监测未记录真实联网、子进程或文件写入调用；隔离 Python 重新生成的 32 个向量与提交向量一致。
详见 isolation-report.json 及 test/isolation.tap。
本次证据在本地 `.local/jd-loon-capture.WIxyyL/`；可用
`node jd-cookie-local/tools/record-isolation.mjs .local/jd-loon-capture.WIxyyL/ 72`
重新核对文件哈希、测试计数、容器限制、监测结果与参考向量。

未完成与限制：

- 截图证明旧固定版本的捕获入口已在 Loon 触发；修正版的手机捕获、完整转换及京东当前协议仍待验证，不能据此声称转换可用。固定参数来自旧 Android 11.1.4 实现。
- Loon 本地存储不是本工具提供的加密保险箱；BoxJs 显示/备份行为由用户客户端决定，不能启用凭据云同步。
- 同步状态与 nonce 复查提供协作防重叠，Loon 存储本身没有跨进程原子事务原语。
- 响应大小上限在 Loon HTTP 回调收到正文后检查，无法限制客户端在回调前的缓冲。
- 单元测试和 AST 扫描只证明已覆盖路径；不代表审计了整个 Loon、BoxJs 或青龙镜像。
- 当前全部为合成凭据，真实转换、登录校验和京豆查询验收完成前不得合并主分支。

本次没有执行或接入原 Python 的青龙管理、自动推送、远程参数、更新或关闭 TLS 的路径。
此修复经用户授权发布到 `feat/jd-cookie-local` 测试分支，插件引用固定的修复提交；main 不变。
以前按固定提交号安装的插件需要换成 README 中的测试分支订阅地址，才能在手动更新时获取新配置。
