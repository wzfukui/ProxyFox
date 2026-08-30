# Security policy

## Reporting a vulnerability

Do not open a public issue for a vulnerability that could expose proxy credentials, alter proxy routing without clear user action, or affect the Chrome Web Store package.

Send a concise report to `support@proxyfox.io` with:

- the affected ProxyFox version;
- Chrome version and operating system;
- reproduction steps or a minimal proof of concept;
- the security impact you observed;
- whether the report may be discussed publicly after a fix.

Do not include real proxy passwords, private proxy addresses, browser profiles, or other users' data. Use test values that demonstrate the issue.

## Security model

ProxyFox configures proxy servers selected by the user. It does not provide a proxy service, VPN, certificate authority, encrypted credential vault, or anonymity guarantee.

Proxy credentials are stored with `chrome.storage.local` in the current Chrome profile. They are supplied only for proxy authentication challenges whose host and port strictly match the active or candidate profile. Exports exclude credentials by default; explicit opt-in writes them to JSON as plaintext.

## Supported version

Security fixes target the latest source release and the newest version available in the Chrome Web Store. Older unpacked builds may not receive fixes.
