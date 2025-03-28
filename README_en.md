# ProxyFox - Simple and Efficient Proxy Switching Tool

ProxyFox is a Chrome browser extension for proxy management, designed to provide users with simple and efficient proxy configuration switching functionality, similar to the classic SwitchyOmega tool. The project is compatible with the latest Manifest V3 standard, supporting multiple proxy configurations, global whitelist and proxy-specific whitelist management, one-click switching, and providing complete import/export functionality with clear status indicators.

ProxyFox Official Website: [proxyfox.io](https://proxyfox.io)

## Features

- **Multiple Proxy Configuration Management**: Create, edit, and delete multiple proxy configurations
- **Support for Various Proxy Types**: HTTP, HTTPS, SOCKS4, SOCKS5
- **Global Whitelist**: Set common whitelist rules applicable to all proxies
- **Proxy-Specific Whitelist**: Each proxy configuration can have its own whitelist rules
- **Whitelist Merging**: Optionally merge global whitelist with proxy-specific whitelist
- **One-Click Switching**: Quickly switch between different proxy configurations
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
- **Manifest V3 Compatible**: Ensures long-term usability

## Installation Methods

### Install from Chrome Web Store

1. Visit the Chrome Web Store (link pending)
2. Click the "Add to Chrome" button

### Manual Installation (Development Version)

1. Download the repository code
2. Open Chrome browser and go to the extensions management page (chrome://extensions/)
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked"
5. Select the project folder

## Usage Guide

1. **View Proxies**: Click the ProxyFox icon in the browser toolbar
2. **Switch Proxies**: Click the desired proxy configuration in the popup window
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
   Click the extension icon, then click the desired proxy configuration.

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

7. **How to handle HTTPS proxy certificate issues?**  
   When using HTTPS proxies, if you encounter self-signed certificates or untrusted certificates, Chrome will display certificate warnings. You need to manually add exceptions in Chrome's certificate settings.

## Update History

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