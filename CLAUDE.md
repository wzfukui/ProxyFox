# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ProxyFox is a Chrome browser extension for proxy management, built with Manifest V3. It provides users with simple and efficient proxy configuration switching, similar to SwitchyOmega. The extension supports multiple proxy configurations, global and proxy-specific whitelists, one-click switching, and complete import/export functionality.

## Architecture

### Core Components

- **Background Service Worker** (`js/background.js:1-884`): Main extension logic handling:
  - Proxy configuration management and persistence
  - Chrome proxy API integration and settings synchronization  
  - Internationalization (i18n) message handling
  - Proxy authentication and health monitoring
  - Tab refresh functionality after proxy switches

- **Popup Interface** (`popup.html` + `js/popup.js:1-466`): Quick proxy switching interface with:
  - Real-time proxy status display
  - One-click proxy activation
  - Language-aware UI rendering
  - Status message notifications

- **Options/Settings Page** (`options.html` + `js/options.js:1-915`): Full configuration interface including:
  - Proxy configuration CRUD operations
  - Global whitelist management
  - Language switching (zh_CN, zh_TW, en, ja, ko)
  - Import/export functionality
  - Update history and about information

### Data Architecture

- **Storage**: Chrome's `chrome.storage.local` API for persistence
- **Configuration Format**: JSON-based proxy configs with fields: `id`, `name`, `type`, `host`, `port`, `username`, `password`, `whitelist`, `useGlobalWhitelist`
- **Default Configs**: Built-in "direct" and "system" proxy modes
- **State Management**: Active configuration ID tracking with Chrome proxy settings synchronization

### Internationalization

- Multi-language support via Chrome i18n API
- Language files in `_locales/` directory (zh_CN, zh_TW, en, ja, ko)
- Runtime language switching with UI refresh
- Message key format: `__MSG_messageName__` in HTML, resolved via `fetchMessage()` function

## Development Commands

This is a browser extension with no build process. Development workflow:

### Local Development
1. Load extension in Chrome: Go to `chrome://extensions/`, enable Developer mode, click "Load unpacked", select project folder
2. Test changes: Reload extension in chrome://extensions/ after code changes
3. Debug: Use Chrome DevTools on popup, options page, and background script

### File Structure
```
/
├── manifest.json          # Extension manifest (Manifest V3)
├── popup.html/.js         # Popup interface
├── options.html/.js       # Settings page  
├── js/background.js       # Background service worker
├── css/                   # Stylesheets
├── images/                # Extension icons and assets
└── _locales/             # Internationalization files
```

### Key Development Patterns

- **Message Passing**: Background script communication via `chrome.runtime.sendMessage()` with actions: `getConfigs`, `activateConfig`, `saveConfig`, `deleteConfig`, `importConfigs`, `syncState`
- **Event Handling**: Extension lifecycle events (`onInstalled`, `onStartup`) and Chrome API events (`proxy.settings.onChange`)
- **Error Handling**: Try-catch blocks with user-friendly error messages via `showStatusMessage()`
- **State Synchronization**: Regular validation between UI state and actual Chrome proxy settings via `validateProxyState()`

### Configuration Management

- Proxy configs stored as array in Chrome storage with unique IDs
- Global whitelist stored separately as `globalWhitelist` array
- Import/export supports both legacy (array only) and new format (object with configs + metadata)
- Form validation for required fields (name, host, port) with regex patterns

### Proxy Types Supported

- HTTP/HTTPS proxies with optional authentication
- SOCKS4/SOCKS5 proxies  
- Direct connection (no proxy)
- System proxy settings

### Security Considerations

- Extension requests minimal permissions: `proxy`, `storage`, `tabs`
- No external network requests except Chrome proxy API
- User credentials stored locally only
- Proxy authentication handled via Chrome's `proxy.onAuthRequired` API