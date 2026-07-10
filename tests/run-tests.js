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
  proxyValuesMatch,
  authChallengeMatches
} = require('../js/utils/config.js');

const projectRoot = path.resolve(__dirname, '..');

function createBackgroundHarness(options = {}) {
  const listeners = {};
  const event = name => ({
    addListener(callback, ...args) { listeners[name] = { callback, args }; }
  });
  const defaultConfigs = [
    { id: 'direct', name: 'Direct', type: 'direct', isSystem: true, whitelist: [] },
    { id: 'system', name: 'System', type: 'system', isSystem: true, whitelist: [] },
    { id: 'a', name: 'A', type: 'http', host: 'a.example.com', port: 8001, whitelist: [] },
    { id: 'b', name: 'B', type: 'http', host: 'b.example.com', port: 8002, whitelist: [] }
  ];
  const configs = structuredClone(options.configs || defaultConfigs);
  const initialActiveId = options.activeConfigId || 'direct';
  const initialActiveConfig = configs.find(config => config.id === initialActiveId) || configs[0];
  const storageData = {
    proxyConfigs: configs,
    activeConfigId: initialActiveId,
    lastProxyConfig: structuredClone(initialActiveConfig),
    userLanguage: 'en',
    globalWhitelist: [],
    userSettings: {},
    ...(structuredClone(options.storageData || {}))
  };
  let currentProxyValue = structuredClone(options.currentProxyValue || { mode: 'direct' });
  let levelOfControl = options.levelOfControl || 'controlled_by_this_extension';
  let failNextStoragePredicate = null;
  const timeline = [];
  const backgroundErrors = [];
  const appliedValues = [];
  let clearCount = 0;

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
          callback({ value: structuredClone(currentProxyValue), levelOfControl });
        },
        set({ value }, callback) {
          const apply = () => {
            currentProxyValue = structuredClone(value);
            levelOfControl = 'controlled_by_this_extension';
            appliedValues.push(structuredClone(value));
            timeline.push(`proxy:${value.rules?.singleProxy?.host || value.mode}`);
            callback();
          };
          const delay = options.proxySetDelay?.(value) || 0;
          delay > 0 ? setTimeout(apply, delay) : apply();
        },
        clear(_details, callback) {
          currentProxyValue = structuredClone(options.clearedProxyValue || { mode: 'system' });
          levelOfControl = 'controllable_by_this_extension';
          clearCount += 1;
          timeline.push('proxy:clear');
          callback();
        },
        onChange: event('proxy.settings.onChange')
      }
    },
    storage: {
      local: {
        async get(keys) {
          const requested = Array.isArray(keys)
            ? keys
            : typeof keys === 'string' ? [keys] : Object.keys(keys || {});
          return Object.fromEntries(
            requested.filter(key => key in storageData).map(key => [key, structuredClone(storageData[key])])
          );
        },
        async set(values) {
          if (failNextStoragePredicate?.(values)) {
            failNextStoragePredicate = null;
            throw new Error('Simulated storage failure');
          }
          const delay = options.storageSetDelay?.(values) || 0;
          if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
          Object.assign(storageData, structuredClone(values));
          if (values.activeConfigId) timeline.push(`storage:${values.activeConfigId}`);
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storageData[key];
        }
      }
    },
    tabs: { query: async () => [], reload: async () => {} },
    webRequest: { onAuthRequired: event('webRequest.onAuthRequired') }
  };
  const context = {
    AbortController,
    TextEncoder,
    URL,
    chrome,
    console: {
      ...console,
      error(...args) { backgroundErrors.push(args); }
    },
    crypto: { randomUUID: () => 'generated-id' },
    fetch: options.fetch || (async () => ({ status: 204 })),
    performance,
    setTimeout,
    clearTimeout,
    importScripts() { context.ProxyFoxConfig = require('../js/utils/config.js'); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(projectRoot, 'js/background.js'), 'utf8'), context);

  return {
    listeners,
    storageData,
    timeline,
    backgroundErrors,
    appliedValues,
    send(message) {
      return new Promise(resolve => listeners['runtime.onMessage'].callback(message, {}, resolve));
    },
    failNextStorageSet(predicate = () => true) { failNextStoragePredicate = predicate; },
    getCurrentProxyValue() { return structuredClone(currentProxyValue); },
    getLevelOfControl() { return levelOfControl; },
    getClearCount() { return clearCount; }
  };
}

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
  assert.equal(proxySettingsMatch({
    ...value,
    rules: { ...value.rules, bypassList: ['unexpected.example.com'] }
  }, config), false);
  assert.equal(proxyValuesMatch(value, value), true);
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
  assert.doesNotMatch(html, /value="30000"/);
  assert.match(script, /requestSelectConfig\(item\.dataset\.id\)/);
  assert.match(script, /showUndoMessage\(/);
});

test('manifest declares the authentication API permissions and omits tabs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(Number(manifest.minimum_chrome_version), 114);
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
        clear(_details, callback) {
          currentProxyValue = { mode: 'system' };
          appliedValues.push({ mode: 'system' });
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
        async set(values) { Object.assign(storageData, structuredClone(values)); },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storageData[key];
        }
      }
    },
    tabs: { query: async () => [], reload: async () => {} },
    webRequest: { onAuthRequired: event('webRequest.onAuthRequired') }
  };
  const context = {
    AbortController,
    TextEncoder,
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

test('serializes concurrent proxy switches so Chrome and storage agree', async () => {
  const harness = createBackgroundHarness({
    proxySetDelay(value) {
      return value.rules?.singleProxy?.host === 'b.example.com' ? 10 : 0;
    },
    storageSetDelay(values) {
      if (values.activeConfigId === 'a') return 50;
      if (values.activeConfigId === 'b') return 5;
      return 0;
    }
  });
  await harness.send({ action: 'getConfigs' });

  const [aResult, bResult] = await Promise.all([
    harness.send({ action: 'activateConfig', configId: 'a' }),
    harness.send({ action: 'activateConfig', configId: 'b' })
  ]);

  assert.equal(aResult.success, true);
  assert.equal(bResult.success, true);
  assert.equal(harness.getCurrentProxyValue().rules.singleProxy.host, 'b.example.com');
  assert.equal(harness.storageData.activeConfigId, 'b');
  assert.equal(harness.storageData.lastProxyConfig.host, 'b.example.com');
  assert.ok(harness.timeline.indexOf('storage:a') < harness.timeline.indexOf('proxy:b.example.com'));
});

test('rolls Chrome and storage back when deleting the active proxy fails', async () => {
  const currentProxyValue = {
    mode: 'fixed_servers',
    rules: {
      singleProxy: { scheme: 'http', host: 'a.example.com', port: 8001 },
      bypassList: []
    }
  };
  const harness = createBackgroundHarness({ activeConfigId: 'a', currentProxyValue });
  await harness.send({ action: 'getConfigs' });
  harness.failNextStorageSet(values => Boolean(values.proxyConfigs));

  const response = await harness.send({ action: 'deleteConfig', configId: 'a' });

  assert.equal(response.success, false);
  assert.match(response.error, /Simulated storage failure/);
  assert.equal(harness.getCurrentProxyValue().rules.singleProxy.host, 'a.example.com');
  assert.equal(harness.storageData.activeConfigId, 'a');
  assert.ok(harness.storageData.proxyConfigs.some(config => config.id === 'a'));
});

test('reports matching settings as external when another extension controls them', async () => {
  const harness = createBackgroundHarness({
    activeConfigId: 'direct',
    levelOfControl: 'controlled_by_other_extensions',
    currentProxyValue: {
      mode: 'fixed_servers',
      rules: {
        singleProxy: { scheme: 'http', host: 'a.example.com', port: 8001 },
        bypassList: []
      }
    }
  });

  const response = await harness.send({ action: 'getConfigs' });

  assert.equal(response.activeConfigId, 'external');
  assert.equal(response.proxyControlLevel, 'controlled_by_other_extensions');
  assert.equal(response.lastProxyConfig.host, 'a.example.com');
});

test('popup summaries omit credentials and whitelist payloads', async () => {
  const configs = [
    { id: 'direct', name: 'Direct', type: 'direct', isSystem: true, whitelist: [] },
    { id: 'system', name: 'System', type: 'system', isSystem: true, whitelist: [] },
    {
      id: 'secret',
      name: 'Secret',
      type: 'http',
      host: 'proxy.example.com',
      port: 8080,
      username: 'user',
      password: 'password',
      whitelist: ['internal.example.com']
    }
  ];
  const harness = createBackgroundHarness({ configs });

  const response = await harness.send({ action: 'getConfigSummaries' });
  const summary = response.configs.find(config => config.id === 'secret');

  assert.equal(summary.host, 'proxy.example.com');
  assert.equal('username' in summary, false);
  assert.equal('password' in summary, false);
  assert.equal('whitelist' in summary, false);
});

test('temporary tests restore unowned proxy settings by clearing extension control', async () => {
  const harness = createBackgroundHarness({
    activeConfigId: 'system',
    currentProxyValue: { mode: 'system' },
    clearedProxyValue: { mode: 'system' },
    levelOfControl: 'controllable_by_this_extension'
  });

  const response = await harness.send({
    action: 'testConfig',
    config: { name: 'Candidate', type: 'http', host: 'proxy.example.com', port: 8080 }
  });

  assert.equal(response.success, true);
  assert.equal(harness.getCurrentProxyValue().mode, 'system');
  assert.equal(harness.getLevelOfControl(), 'controllable_by_this_extension');
  assert.equal(harness.getClearCount(), 1);
  assert.equal('proxyTestRecovery' in harness.storageData, false);
});

test('recovers a temporary proxy left behind by an interrupted service worker', async () => {
  const testValue = {
    mode: 'fixed_servers',
    rules: {
      singleProxy: { scheme: 'http', host: 'proxy.example.com', port: 8080 },
      bypassList: []
    }
  };
  const harness = createBackgroundHarness({
    activeConfigId: 'system',
    currentProxyValue: testValue,
    levelOfControl: 'controlled_by_this_extension',
    storageData: {
      proxyTestRecovery: {
        snapshot: { levelOfControl: 'controlled_by_this_extension', value: { mode: 'system' } },
        testValue,
        createdAt: Date.now()
      }
    }
  });

  const response = await harness.send({ action: 'getConfigs' });

  assert.equal(response.activeConfigId, 'system');
  assert.equal(harness.getCurrentProxyValue().mode, 'system');
  assert.equal('proxyTestRecovery' in harness.storageData, false);
});

test('save and activate is one queued background operation', async () => {
  const harness = createBackgroundHarness();

  const response = await harness.send({
    action: 'saveAndActivateConfig',
    config: { name: 'New', type: 'http', host: 'new.example.com', port: 9000 }
  });

  assert.equal(response.success, true);
  assert.equal(harness.storageData.activeConfigId, response.config.id);
  assert.equal(harness.getCurrentProxyValue().rules.singleProxy.host, 'new.example.com');
  assert.ok(harness.storageData.proxyConfigs.some(config => config.id === response.config.id));
});

test('rejects oversized imports before changing proxy or storage state', async () => {
  const harness = createBackgroundHarness();
  const configs = Array.from({ length: 1001 }, (_value, index) => ({
    id: `import_${index}`,
    name: `Imported ${index}`,
    type: 'http',
    host: 'proxy.example.com',
    port: 8080
  }));

  const response = await harness.send({ action: 'importConfigs', mode: 'replace', configs });

  assert.equal(response.success, false);
  assert.match(response.error, /cannot exceed 1000/);
  assert.equal(harness.storageData.activeConfigId, 'direct');
  assert.equal(harness.getCurrentProxyValue().mode, 'direct');
  assert.equal(harness.storageData.proxyConfigs.length, 4);
});

test('rejects an oversized global whitelist before applying it', async () => {
  const harness = createBackgroundHarness();

  const response = await harness.send({
    action: 'saveGlobalWhitelist',
    rawInput: 'x'.repeat((1024 * 1024) + 1)
  });

  assert.equal(response.success, false);
  assert.match(response.error, /too large to store safely/);
  assert.equal('globalWhitelistRaw' in harness.storageData, false);
  assert.deepEqual(harness.storageData.globalWhitelist, []);
  assert.equal(harness.getCurrentProxyValue().mode, 'direct');
});
