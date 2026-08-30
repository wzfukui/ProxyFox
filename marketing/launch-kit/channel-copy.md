# Channel-ready copy

Replace only the version/state details that have been verified at posting time. Do not post these drafts before v1.4.2 is actually available through the linked channel.

## V2EX / 掘金 / 少数派式中文长帖

### 标题

我做了一个开源、本地优先的 Chrome 代理切换器 ProxyFox

### 正文

开发和测试时，我经常要在本地代理、测试网络和办公网络之间切换。Chrome 原生设置能完成这件事，但多个配置、认证代理、直连规则和保存前验证组合起来后，操作会变得很碎。

所以做了 ProxyFox：一个 Manifest V3 的开源 Chrome 代理切换器。

它目前专注几件事：

- 管理 HTTP、HTTPS、SOCKS4、SOCKS5 多个配置；
- 为全局或单个配置维护直连白名单；
- 保存前测试连接，测试后恢复原设置；
- 认证信息只在请求与当前代理端点严格匹配时提供；
- 配置保存在本地，导出时默认排除凭据；
- 提供中、英、日、韩、繁中五种界面语言。

边界也写清楚：ProxyFox 不提供代理服务器，不是 VPN，不读取或修改网页内容，也不会按网站自动选择代理。`<all_urls>` 权限用于接收 Chrome 的代理认证请求，原因和代码都可以公开检查。

项目主页：https://proxyfox.io/
源码：https://github.com/wzfukui/ProxyFox
权限与隐私：https://proxyfox.io/privacy.html

如果你平时也要管理认证代理或大型直连规则，欢迎试用并反馈具体工作流；比“好用/不好用”更希望知道是哪一步仍然费事。

## Show HN

### Title

Show HN: ProxyFox – an open-source, local-first proxy switcher for Chrome

### Text

I built ProxyFox for a narrow workflow: switching among proxy endpoints I already trust without repeatedly editing Chrome settings.

It manages HTTP/HTTPS/SOCKS4/SOCKS5 profiles, global and profile-specific bypass rules, pre-save connection tests, strict proxy-auth endpoint matching, and credential-safe exports. It is Manifest V3, has five UI languages, and stores configuration in Chrome extension storage on the device.

The scope is intentionally explicit: it is not a VPN or proxy provider, does not inspect page content, and does not automatically route different sites through different proxies. The all-host permission exists for Chrome proxy-auth challenges and is documented in the privacy page.

Site: https://proxyfox.io/
Source: https://github.com/wzfukui/ProxyFox

I would especially value feedback from people managing authenticated enterprise or test proxies: where does your current workflow still break down?

## Reddit

### Suggested title

ProxyFox: open-source MV3 proxy profiles, strict auth matching, and local-only configuration

### Body

I made ProxyFox for developers and QA/enterprise-network users who already have proxy endpoints and need a small, inspectable Chrome switcher.

It supports HTTP/HTTPS/SOCKS4/SOCKS5 profiles, bypass rules, connection tests, local credential handling, safe exports, and five UI languages. It does not provide proxies, act as a VPN, inspect pages, or do per-site automatic routing.

The code and permission rationale are public:

- https://github.com/wzfukui/ProxyFox
- https://proxyfox.io/privacy.html

I am looking for workflow feedback, particularly around authenticated proxies and large bypass lists. Please disclose that you are the author and follow each community's self-promotion rules.

## GitHub About

Open-source, local-first Chrome proxy switcher with strict authentication matching, bypass rules, connection tests, and safe exports.

## Suggested GitHub topics

`chrome-extension`, `proxy`, `proxy-switcher`, `manifest-v3`, `socks5`, `developer-tools`, `open-source`, `privacy`
