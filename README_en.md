# ProxyFox

**An open-source, local-first proxy switcher for Chrome.** Built for development, testing, and enterprise networks, with authenticated proxies, bypass rules, connection tests, rollback, and safe exports.

[Chrome Web Store](https://chromewebstore.google.com/detail/proxyfox/ejgcljmgjglpeacggbhccbhhojjmkjci) · [Website](https://proxyfox.io/en/) · [中文](README.md) · [Privacy](https://proxyfox.io/en/privacy.html)

> The source and candidate package are v1.4.2; the Chrome Web Store currently carries stable v1.4.1. ProxyFox does not provide proxy servers, is not a VPN, and does not automatically choose different proxies by website.

<img src="images/proxyfox-logo.png" alt="ProxyFox fox mark" width="240">

## Features

- **Multiple Proxy Configuration Management**: Create, edit, and delete multiple proxy configurations
- **Support for Various Proxy Types**: HTTP, HTTPS, SOCKS4, SOCKS5
- **Global Whitelist**: Set common whitelist rules applicable to all proxies
- **Proxy-Specific Whitelist**: Each proxy configuration can have its own whitelist rules
- **Whitelist Merging**: Optionally merge global whitelist with proxy-specific whitelist
- **One-Click Switching**: Quickly switch between different proxy configurations
- **Optional Auto Refresh**: Reload the active page after switching when enabled; disabled by default to protect unsaved content
- **Complete Import/Export**: Easily backup and migrate all configurations, including global whitelist
- **Multi-language Support**:
  - Simplified Chinese
  - Traditional Chinese
  - English
  - Japanese
  - Korean
- **Intuitive Language Switching Interface**: Easily switch between different languages
- **Status Feedback**: Clear display of current proxy status
- **Update History**: Detailed version update records
- **Proxy Authentication**: Responds to matching proxy authentication challenges through Chrome's WebRequest Auth Provider
- **Safe Exports**: Excludes usernames and passwords by default unless explicitly enabled
- **Manifest V3 Compatible**: Ensures long-term usability

## Installation Methods

### Install from Chrome Web Store

1. Open the [ProxyFox Chrome Web Store listing](https://chromewebstore.google.com/detail/proxyfox/ejgcljmgjglpeacggbhccbhhojjmkjci)
2. Click the "Add to Chrome" button

### Manual Installation (Development Version)

Chrome 114 or later is required.

1. Download the repository code
2. Open Chrome browser and go to the extensions management page (chrome://extensions/)
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked"
5. Select the project folder

## Usage Guide

1. **View Proxies**: Click the ProxyFox icon in the browser toolbar
2. **Switch Proxies**: Click the desired proxy configuration in the popup window; optionally enable page reload in settings
3. **Add Proxy**: Click the "Add Configuration" button and fill in proxy information
4. **Edit Proxy**: Click the edit button on existing configuration items
5. **Delete Proxy**: Click the "Delete" button in the edit interface
6. **Global Whitelist**: Set in the "Global Whitelist" tab of the options page
7. **Import Configuration**: Click the "Import" button and select the configuration file
8. **Export Configuration**: Click the "Export" button to save all configurations (including global whitelist)

## Whitelist Rule Format

Whitelist supports the following formats:
- Domain: `example.com`
- Wildcard: `*.example.com`
- IP Address: `192.168.1.1`
- IP Range: `10.0.0.0/8`
- IPv6 Address: `[::1]/128`

One rule per line, traffic matching the whitelist will connect directly without using the proxy.

## Global Whitelist and Proxy Whitelist

- **Global Whitelist**: Applies to all proxy configurations that have "Use Global Whitelist" checked
- **Proxy-Specific Whitelist**: Only applies to specific proxy configurations
- **Whitelist Merging**: When "Use Global Whitelist" is enabled, global whitelist will be merged with proxy-specific whitelist

## FAQ

1. **How to quickly switch proxies?**  
   Click the extension icon, then click the desired proxy configuration. The proxy applies immediately; automatic reload is optional.

2. **What to do if configurations are lost?**  
   Use the export function to regularly backup your configurations, including global whitelist settings.

3. **How to identify the currently active proxy?**  
   The currently active proxy configuration will be highlighted with a green status indicator on the left.

4. **Why do we need a global whitelist?**  
   Global whitelist allows you to set common whitelist rules for all proxy configurations, reducing repetitive configuration work.

5. **How to disable global whitelist for specific proxies?**  
   Uncheck the "Use Global Whitelist" option when editing proxy configurations.

6. **Where can I view update history?**  
   Click the "Update History" option in the left navigation bar of the settings page to view detailed version update records.

7. **How should HTTPS proxy certificate issues be handled?**
   ProxyFox does not bypass Chrome certificate validation. If an enterprise proxy performs TLS inspection, have the network administrator deploy a trusted root certificate and verify its purpose; do not ignore warnings or weaken browser security.

8. **Permission Request Explanation**  
   This extension requests the permissions required for its core features:
   - `proxy`: For managing browser proxy settings (core functionality)
   - `storage`: For storing your proxy configurations
   - `webRequest`: For receiving proxy authentication challenges
   - `webRequestAuthProvider`: For providing credentials to the matching proxy
   - `<all_urls>`: Required by Chrome's authentication event filter; it is not used to read or modify page content

## Development and verification

```bash
npm run check
./build.sh
```

`npm run check` validates JavaScript syntax, proxy configuration rules, strict authentication host matching, manifest permissions, and locale coverage. `build.sh` runs the same checks and verifies that `manifest.json` is at the archive root.

## Update History

### v1.4.2 (2026-08-29)
- Parallelized popup language, settings, and background requests while combining cold-start storage and proxy reads
- Matched proxy endpoints before expanding bypass lists, reducing the large-collection worst-case benchmark from about 1105 ms to about 21 ms
- Imported configurations and the global whitelist in one rollback-safe transaction
- Fixed the credential race while a newly selected proxy becomes active
- Migrated legacy configurations and isolated invalid entries so one bad record cannot block the popup
- Added regression coverage for cold starts, scale performance, atomic imports, authentication races, and invalid stored data

### v1.4.1 (2026-07-10)
- Reduced popup dimensions, spacing, and list height with single-row proxy details
- Removed redundant status copy while preserving the current visual language and scanability

### v1.4.0 (2026-07-10)
- Fixed proxy authentication and strict host matching
- Reworked the MV3 service worker lifecycle and proxy state transactions with serialized switching and rollback protection
- Added safe exports, optional page reload, and background configuration validation
- Rebuilt proxy management as a single-screen workspace with explicit select, save, activate, and undo flows
- Added pre-save connection testing with configurable URL and timeout, split apply/network timing, and recovery after service worker interruption
- Rebuilt the popup as a status panel and quick switcher consistent with the management workspace
- Added automated tests, locale coverage checks, and release package validation

### v1.3.4 (2025-11-02)
- Refactored locale loading and page scripts to reduce repeated DOM and storage work
- Improved popup and management-page rendering performance and status feedback

### v1.3.0 (2025-06-21)
- Added full-line and inline comments for bypass rules
- Fixed wildcard root-domain matching and applied global bypass changes immediately
- Improved bypass-rule editing and localized copy

### v1.2 (2025-04-03)
- Added tabs permission to support automatic page refresh after proxy switching
- Multiple bug fixes and stability improvements

### v1.1 (2025-03-27)
- Added complete internationalization support
- Support for multiple languages (Simplified Chinese, Traditional Chinese, English, Japanese, Korean)
- Implemented intuitive language switching interface
- Multiple bug fixes and performance optimizations

### v1.0 (2025-03-26)
- Initial release
- Support for multiple proxy configuration management
- Implementation of global whitelist and proxy-specific whitelist
- Complete import/export functionality
- Manifest V3 compatibility

## Privacy Statement

ProxyFox fully complies with Chrome extension Manifest V3 standards and does not collect or transmit your personal data. All proxy configuration information is stored only in your local browser.

## License

This project is open source under the MIT License.
