const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  normalizeConfig,
  parseWhitelistText,
  expandWhitelist,
  proxySettingsMatch,
  authChallengeMatches
} = require('../js/utils/config.js');

const projectRoot = path.resolve(__dirname, '..');

test('normalizes a valid custom proxy configuration', () => {
  const config = normalizeConfig({
    id: 'config_test',
    name: 'Test proxy',
    type: 'HTTP',
    host: 'Proxy.Example.com',
    port: '8080',
    whitelist: [' example.com ', 'example.com']
  });
  assert.equal(config.type, 'http');
  assert.equal(config.host, 'proxy.example.com');
  assert.equal(config.port, 8080);
  assert.deepEqual(config.whitelist, ['example.com']);
});

test('rejects invalid hosts, ports, and proxy types', () => {
  const base = { id: 'config_test', name: 'Test', type: 'http', host: 'proxy.example.com', port: 8080 };
  assert.throws(() => normalizeConfig({ ...base, host: 'https://proxy.example.com' }));
  assert.throws(() => normalizeConfig({ ...base, port: 0 }));
  assert.throws(() => normalizeConfig({ ...base, port: 65536 }));
  assert.throws(() => normalizeConfig({ ...base, type: 'pac_script' }));
});

test('parses comments and expands wildcard root domains', () => {
  const parsed = parseWhitelistText(`
# Internal services
*.example.com # CDN
localhost
`);
  assert.deepEqual(parsed, ['*.example.com', 'localhost']);
  assert.deepEqual(expandWhitelist(parsed), ['*.example.com', 'localhost', 'example.com']);
});

test('matches effective proxy settings exactly', () => {
  const config = normalizeConfig({
    id: 'config_test',
    name: 'Test',
    type: 'http',
    host: 'proxy.example.com',
    port: 8080
  });
  const value = {
    mode: 'fixed_servers',
    rules: { singleProxy: { scheme: 'http', host: 'proxy.example.com', port: 8080 } }
  };
  assert.equal(proxySettingsMatch(value, config), true);
  assert.equal(proxySettingsMatch({ ...value, rules: { singleProxy: { ...value.rules.singleProxy, port: 8081 } } }, config), false);
});

test('does not leak credentials to a partial host match', () => {
  const config = normalizeConfig({
    id: 'config_test',
    name: 'Test',
    type: 'http',
    host: 'proxy.example.com',
    port: 8080,
    username: 'user',
    password: 'secret'
  });
  assert.equal(authChallengeMatches({
    isProxy: true,
    challenger: { host: 'proxy.example.com', port: 8080 }
  }, config), true);
  assert.equal(authChallengeMatches({
    isProxy: true,
    challenger: { host: 'proxy.example.com.evil.test', port: 8080 }
  }, config), false);
});

test('all locale files are valid and cover every HTML message key', () => {
  const html = ['popup.html', 'options.html']
    .map(file => fs.readFileSync(path.join(projectRoot, file), 'utf8'))
    .join('\n');
  const usedKeys = new Set([...html.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map(match => match[1]));
  const localeRoot = path.join(projectRoot, '_locales');
  const englishMessages = JSON.parse(fs.readFileSync(path.join(localeRoot, 'en', 'messages.json'), 'utf8'));
  const referenceKeys = new Set([...usedKeys, ...Object.keys(englishMessages)]);

  for (const locale of fs.readdirSync(localeRoot)) {
    const messages = JSON.parse(fs.readFileSync(path.join(localeRoot, locale, 'messages.json'), 'utf8'));
    const missing = [...referenceKeys].filter(key => !messages[key]);
    assert.deepEqual(missing, [], `${locale} is missing: ${missing.join(', ')}`);
  }
});

test('UI scripts reference existing unique DOM element IDs', () => {
  for (const [htmlFile, scriptFile] of [['options.html', 'js/options.js'], ['popup.html', 'js/popup.js']]) {
    const html = fs.readFileSync(path.join(projectRoot, htmlFile), 'utf8');
    const script = fs.readFileSync(path.join(projectRoot, scriptFile), 'utf8');
    const htmlIds = [...html.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)].map(match => match[1]);
    const referencedIds = [...script.matchAll(/getElementById\(['"]([A-Za-z0-9_-]+)['"]\)/g)].map(match => match[1]);
    assert.equal(new Set(htmlIds).size, htmlIds.length, `${htmlFile} contains duplicate IDs`);
    const missing = referencedIds.filter(id => !htmlIds.includes(id));
    assert.deepEqual(missing, [], `${scriptFile} references missing IDs: ${missing.join(', ')}`);
  }
});

test('proxy management uses a single-screen selection and editor workspace', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'options.html'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(projectRoot, 'popup.html'), 'utf8');
  const script = fs.readFileSync(path.join(projectRoot, 'js/options.js'), 'utf8');
  assert.match(html, /class="proxy-workspace"/);
  assert.match(html, /id="saveAndActivateBtn"/);
  assert.match(html, /id="systemConfigPanel"/);
  assert.match(html, /id="proxyTestSettingsPopover"/);
  assert.match(popupHtml, /class="active-connection"/);
  assert.match(popupHtml, /class="quick-switch"/);
  assert.match(script, /requestSelectConfig\(item\.dataset\.id\)/);
  assert.match(script, /showUndoMessage\(/);
});

test('manifest declares the authentication API permissions and omits tabs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('webRequest'));
  assert.ok(manifest.permissions.includes('webRequestAuthProvider'));
  assert.equal(manifest.permissions.includes('tabs'), false);
});

test('background registers MV3 wake-up listeners synchronously at top level', () => {
  const listeners = {};
  const event = name => ({
    addListener(callback, ...args) {
      listeners[name] = { callback, args };
    }
  });
  const chrome = {
    action: { setIcon: () => Promise.resolve() },
    i18n: { getMessage: key => key, getUILanguage: () => 'en' },
    runtime: {
      getURL: value => value,
      onInstalled: event('runtime.onInstalled'),
      onMessage: event('runtime.onMessage'),
      onStartup: event('runtime.onStartup'),
      lastError: null
    },
    proxy: {
      onProxyError: event('proxy.onProxyError'),
      settings: {
        get: () => {},
        set: () => {},
        onChange: event('proxy.settings.onChange')
      }
    },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    tabs: { query: async () => [], reload: async () => {} },
    webRequest: {
      onAuthRequired: event('webRequest.onAuthRequired')
    }
  };
  const context = {
    chrome,
    console,
    crypto: { randomUUID: () => 'test-id' },
    importScripts() {
      context.ProxyFoxConfig = require('../js/utils/config.js');
    }
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(projectRoot, 'js/background.js'), 'utf8'),
    context,
    { filename: 'background.js' }
  );

  assert.equal(typeof listeners['runtime.onMessage'].callback, 'function');
  assert.equal(typeof listeners['proxy.settings.onChange'].callback, 'function');
  assert.equal(typeof listeners['proxy.onProxyError'].callback, 'function');
  assert.deepEqual(
    Array.from(listeners['webRequest.onAuthRequired'].args[1]),
    ['asyncBlocking']
  );
});

test('unsaved proxy test restores the previous mode after success and probe failure', async () => {
  const listeners = {};
  const event = name => ({ addListener(callback) { listeners[name] = callback; } });
  const storageData = {
    proxyConfigs: [
      { id: 'direct', name: 'Direct', type: 'direct', isSystem: true, whitelist: [] },
      { id: 'system', name: 'System', type: 'system', isSystem: true, whitelist: [] }
    ],
    activeConfigId: 'system',
    lastProxyConfig: { id: 'system', name: 'System', type: 'system' },
    userLanguage: 'en',
    globalWhitelist: [],
    userSettings: {
      proxyTestUrl: 'https://probe.example/health',
      proxyTestTimeoutMs: 5000
    }
  };
  let currentProxyValue = { mode: 'system' };
  let probeShouldFail = false;
  const appliedValues = [];
  const fetchedUrls = [];
  const backgroundErrors = [];
  const chrome = {
    action: { setIcon(_details, callback) { callback(); } },
    i18n: { getMessage: key => key, getUILanguage: () => 'en' },
    runtime: {
      getURL: value => value,
      onInstalled: event('runtime.onInstalled'),
      onMessage: event('runtime.onMessage'),
      onStartup: event('runtime.onStartup'),
      lastError: null
    },
    proxy: {
      onProxyError: event('proxy.onProxyError'),
      settings: {
        get(_details, callback) {
          callback({ value: structuredClone(currentProxyValue), levelOfControl: 'controlled_by_this_extension' });
        },
        set({ value }, callback) {
          currentProxyValue = structuredClone(value);
          appliedValues.push(structuredClone(value));
          callback();
        },
        onChange: event('proxy.settings.onChange')
      }
    },
    storage: {
      local: {
        async get(keys) {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(requested.filter(key => key in storageData).map(key => [key, structuredClone(storageData[key])]));
        },
        async set(values) { Object.assign(storageData, structuredClone(values)); }
      }
    },
    tabs: { query: async () => [], reload: async () => {} },
    webRequest: { onAuthRequired: event('webRequest.onAuthRequired') }
  };
  const context = {
    AbortController,
    URL,
    chrome,
    console: {
      ...console,
      error(...args) { backgroundErrors.push(args); }
    },
    crypto: { randomUUID: () => 'test-id' },
    fetch: async url => {
      fetchedUrls.push(url);
      if (probeShouldFail) throw new Error('Probe failed');
      return { status: 204 };
    },
    performance,
    setTimeout,
    clearTimeout,
    importScripts() { context.ProxyFoxConfig = require('../js/utils/config.js'); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(projectRoot, 'js/background.js'), 'utf8'), context);

  const response = await new Promise(resolve => {
    listeners['runtime.onMessage']({
      action: 'testConfig',
      config: { name: 'Candidate', type: 'http', host: 'proxy.example.com', port: 8080 }
    }, {}, resolve);
  });

  assert.equal(response.success, true);
  assert.equal(appliedValues.length, 2);
  assert.equal(appliedValues[0].mode, 'fixed_servers');
  assert.equal(appliedValues[1].mode, 'system');
  assert.equal(currentProxyValue.mode, 'system');
  assert.match(fetchedUrls[0], /^https:\/\/probe\.example\/health\?proxyfox=/);
  assert.ok(response.applyLatencyMs >= 1);
  assert.ok(response.requestLatencyMs >= 1);

  probeShouldFail = true;
  const failedResponse = await new Promise(resolve => {
    listeners['runtime.onMessage']({
      action: 'testConfig',
      config: { name: 'Candidate', type: 'http', host: 'proxy.example.com', port: 8080 }
    }, {}, resolve);
  });

  assert.equal(failedResponse.success, false);
  assert.match(failedResponse.error, /Probe failed/);
  assert.equal(appliedValues.length, 4);
  assert.equal(appliedValues[2].mode, 'fixed_servers');
  assert.equal(appliedValues[3].mode, 'system');
  assert.equal(currentProxyValue.mode, 'system');
  assert.equal(backgroundErrors.length, 1);
  assert.match(String(backgroundErrors[0][0]), /Background action failed/);
});
