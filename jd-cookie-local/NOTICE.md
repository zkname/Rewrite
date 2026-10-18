# 来源与归属

捕获入口来自 `zkname/Rewrite` 提交 `a8b75ba3433521bc334627dc8f7a1ba540feecb4` 的
`get_jd_wskey.js`，原文件注明 FoKit/Scripts 来源。本版保留文件入口，重新实现 Loon 专用流程。

genToken 签名及设备参数参考 `z1988com/jd_scripts` 提交
`43823192b751ac2061edb7c7e69bfdcfb9fe76a3` 中的 `jd_wskey.py`。
`test/reference-sign.py` 的两个纯函数原样保留，用于合成数据对照；不导入或执行上游完整程序。
未确认该上游提供可重新授权的许可证，不将移植部分标为本项目原创或重新授予开源许可证。
文件哈希和来源见 `provenance.json`。

本地 MD5 与 Base64 按 RFC 1321 / RFC 4648 编写，并用标准向量和 Node 内置实现对照。
这些算法随脚本内嵌，不从网络加载，不用于保存密码。运行代码无第三方 npm 依赖。

固定参考参数使用 Android 11.1.4。此版本不保证京东当前接受该协议，也不表示 iPhone App
使用相同签名。只有真实 Loon 转换、登录校验和京豆查询全部通过后，才能确认本工具可用。
