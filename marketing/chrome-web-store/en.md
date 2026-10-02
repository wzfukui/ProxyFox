# English listing

## Name

ProxyFox – Proxy Switcher

## Summary

Open-source Chrome proxy switcher with local profiles, strict authentication matching, bypass rules, tests, and safe exports.

## Detailed description

ProxyFox is an open-source, local-first proxy switcher for Chrome. It helps developers, testers, and enterprise-network users keep several trusted proxy profiles and move between them without repeatedly editing browser settings.

What you can do:

- Create, edit, duplicate, enable, and disable HTTP, HTTPS, SOCKS4, and SOCKS5 profiles.
- Keep global and profile-specific bypass rules, including readable comments and wildcard root-domain handling.
- Test a proxy before saving, set the test URL and timeout, and restore the previous browser setting after the test.
- Store proxy credentials locally and provide them only when the authentication request strictly matches the active proxy endpoint.
- Import and export configurations. Credentials are excluded from exports by default and appear only after an explicit choice.
- Use the interface in English, Simplified Chinese, Traditional Chinese, Japanese, or Korean.

Privacy and scope:

ProxyFox stores its configuration in Chrome extension storage on your device. It has no analytics SDK, advertising SDK, or ProxyFox account system. It does not provide a proxy server, operate as a VPN, read or change page content, or automatically choose a different proxy per website.

The broad host permission is used only so Chrome can deliver proxy authentication challenges for the endpoint selected by the user. The source code and permission checks are public.

Source: https://github.com/wzfukui/ProxyFox
Privacy policy: https://proxyfox.io/privacy.html

## Single purpose

Configure, test, and quickly switch Chrome proxy settings selected by the user.

## Permission explanations

- `proxy`: apply and inspect the Chrome proxy configuration selected by the user.
- `storage`: save profiles, bypass rules, preferences, and optional credentials locally.
- `webRequest` and `webRequestAuthProvider`: respond to authentication challenges for the exact active proxy endpoint.
- `<all_urls>`: allow Chrome to surface proxy-authentication challenges regardless of the requested destination; ProxyFox does not read or modify page content.

## v1.4.3 release notes

- Protect unsaved edits and prevent conflicting editor operations
- Fix full-size and legacy backup imports, prioritize matching IDs, and preserve external proxy connections
- Handle large combined bypass lists and compare rules without sorting
- Restore per-protocol proxy settings after tests and release probe response streams
- Retry failed popup loads and preserve keyboard focus after switching
- Reflow the editor for narrow windows and keep connection-test results visible
