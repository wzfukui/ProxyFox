# Contributing to ProxyFox

ProxyFox favors small, auditable changes to a focused Chrome proxy-switching workflow.

## Before changing code

1. Open an issue for behavior changes or new permissions.
2. Keep proxy servers, credentials, and customer network details out of issues, fixtures, screenshots, and commits.
3. Confirm that the proposed feature fits the product boundary: ProxyFox manages user-provided proxies and does not provide a VPN or proxy service.

## Local verification

Chrome 114 or later and Node.js are required.

```bash
npm run check
./build.sh
```

`npm run check` runs syntax checks and the regression suite. `build.sh` repeats validation and produces a release ZIP with `manifest.json` at the archive root.

For UI changes, load the repository as an unpacked extension from `chrome://extensions`, verify both the popup and options page, and check at least English and one CJK locale.

## Pull request scope

- Keep unrelated formatting and generated artifacts out of the change.
- Update all five locale files when adding a user-facing message.
- Explain any permission change and update the privacy policy and store copy.
- Add or update tests for proxy state, authentication, import/export, and migration behavior.
- Do not add remotely hosted code, analytics, advertising, or telemetry.

## Commit and release notes

Use a short imperative subject. User-visible changes should also update the in-extension history, README history, and `RELEASE_NOTES.md` when preparing a release.
