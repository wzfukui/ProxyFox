importScripts('utils/config.js');

const {
  SYSTEM_CONFIG_IDS,
  normalizeConfig,
  normalizeWhitelist,
  parseWhitelistText,
  expandWhitelist,
  proxySettingsMatch,
  authChallengeMatches
} = ProxyFoxConfig;

const DEFAULT_CONFIGS = [
  {
    id: 'direct',
    name: '__MSG_proxy_direct__',
    type: 'direct',
    host: '',
    port: 0,
    whitelist: [],
    isSystem: true
  },
  {
    id: 'system',
    name: '__MSG_proxy_system__',
    type: 'system',
    host: '',
    port: 0,
    whitelist: [],
    isSystem: true
  }
];

let activeConfigId = 'direct';
let lastProxyConfig = { id: 'direct', name: 'Direct', type: 'direct' };
let initializationPromise = null;
let internalProxyChange = false;
const authAttempts = new Map();
const DEFAULT_PROXY_TEST_URL = 'https://www.gstatic.com/generate_204';
const DEFAULT_PROXY_TEST_TIMEOUT_MS = 10000;
const ALLOWED_PROXY_TEST_TIMEOUTS = new Set([5000, 10000, 15000, 30000]);
let temporaryAuthConfig = null;
let proxyTestInProgress = false;

function getMessage(messageName) {
  return chrome.i18n.getMessage(messageName) || messageName;
}

function getLocalizedDefaultConfigs() {
  return DEFAULT_CONFIGS.map(config => ({
    ...config,
    name: config.id === 'direct' ? getMessage('proxy_direct') : getMessage('proxy_system')
  }));
}

function ensureSystemConfigs(configs) {
  const source = Array.isArray(configs) ? configs : [];
  const defaults = getLocalizedDefaultConfigs();
  const systemConfigs = defaults.map(defaultConfig => {
    const existing = source.find(config => config && config.id === defaultConfig.id);
    return existing ? { ...defaultConfig, name: existing.name || defaultConfig.name } : defaultConfig;
  });
  const customConfigs = source.filter(config => config && !SYSTEM_CONFIG_IDS.has(config.id));
  return [...systemConfigs, ...customConfigs];
}

function summarizeConfig(config) {
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    host: config.host || '',
    port: config.port || 0
  };
}

function updateExtensionIcon(isProxyActive) {
  const prefix = isProxyActive ? 'proxyfox-working-logo' : 'proxyfox-logo';
  chrome.action.setIcon({
    path: {
      16: chrome.runtime.getURL(`images/${prefix}-16.png`),
      48: chrome.runtime.getURL(`images/${prefix}-48.png`),
      128: chrome.runtime.getURL(`images/${prefix}-128.png`)
    }
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to update extension icon:', chrome.runtime.lastError.message);
    }
  });
}

function getChromeProxySettings() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.get({ incognito: false }, details => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(details);
    });
  });
}

function setChromeProxySettings(value) {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value, scope: 'regular' }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

async function getProxyConfigs() {
  const data = await chrome.storage.local.get('proxyConfigs');
  return ensureSystemConfigs(data.proxyConfigs);
}

async function initializeState() {
  const data = await chrome.storage.local.get(['proxyConfigs', 'activeConfigId', 'lastProxyConfig', 'userLanguage']);
  const configs = ensureSystemConfigs(data.proxyConfigs);
  const updates = {};

  if (!Array.isArray(data.proxyConfigs)) {
    updates.proxyConfigs = configs;
  }

  if (!data.userLanguage) {
    updates.userLanguage = detectInitialLanguage();
  }

  activeConfigId = data.activeConfigId || 'direct';
  lastProxyConfig = data.lastProxyConfig || summarizeConfig(configs[0]);

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  await syncWithChromeProxySettings();
}

function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = initializeState().catch(error => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

function detectInitialLanguage() {
  const browserLanguage = chrome.i18n.getUILanguage().replace('-', '_');
  if (browserLanguage.startsWith('zh_TW') || browserLanguage.startsWith('zh_HK') || browserLanguage.startsWith('zh_MO')) return 'zh_TW';
  if (browserLanguage.startsWith('zh')) return 'zh_CN';
  if (browserLanguage.startsWith('ja')) return 'ja';
  if (browserLanguage.startsWith('ko')) return 'ko';
  return 'en';
}

async function syncWithChromeProxySettings() {
  const [proxyDetails, configs] = await Promise.all([
    getChromeProxySettings(),
    getProxyConfigs()
  ]);
  const matchedConfig = configs.find(config => proxySettingsMatch(proxyDetails.value, config));

  if (matchedConfig) {
    activeConfigId = matchedConfig.id;
    lastProxyConfig = summarizeConfig(matchedConfig);
  } else {
    activeConfigId = 'external';
    lastProxyConfig = {
      id: 'external',
      name: getMessage('status_externalProxy') || 'External proxy configuration',
      type: proxyDetails.value && proxyDetails.value.mode ? proxyDetails.value.mode : 'unknown'
    };
  }

  await chrome.storage.local.set({ activeConfigId, lastProxyConfig });
  updateExtensionIcon(proxyDetails.value && proxyDetails.value.mode !== 'direct');
  return { activeConfigId, lastProxyConfig };
}

async function buildProxySettings(config, globalWhitelistOverride) {
  if (config.type === 'direct' || config.type === 'system') {
    return { mode: config.type };
  }

  const globalRules = globalWhitelistOverride === undefined
    ? (await chrome.storage.local.get('globalWhitelist')).globalWhitelist || []
    : globalWhitelistOverride;
  const combinedRules = config.useGlobalWhitelist === false
    ? config.whitelist
    : [...globalRules, ...config.whitelist];

  return {
    mode: 'fixed_servers',
    rules: {
      singleProxy: {
        scheme: config.type,
        host: config.host,
        port: config.port
      },
      bypassList: expandWhitelist(combinedRules)
    }
  };
}

async function applyProxySettings(config, globalWhitelistOverride) {
  const normalizedConfig = SYSTEM_CONFIG_IDS.has(config.id)
    ? normalizeConfig(config, { allowSystem: true })
    : normalizeConfig(config);
  const value = await buildProxySettings(normalizedConfig, globalWhitelistOverride);

  internalProxyChange = true;
  try {
    await setChromeProxySettings(value);
    const effectiveSettings = await getChromeProxySettings();
    if (!proxySettingsMatch(effectiveSettings.value, normalizedConfig)) {
      throw new Error('Chrome did not apply the requested proxy configuration');
    }
  } finally {
    internalProxyChange = false;
  }

  return normalizedConfig;
}

async function persistActiveConfig(config, extraStorage = {}) {
  activeConfigId = config.id;
  lastProxyConfig = summarizeConfig(config);
  await chrome.storage.local.set({
    ...extraStorage,
    activeConfigId,
    lastProxyConfig
  });
  updateExtensionIcon(config.type !== 'direct');
}

async function activateConfig(configId, options = {}) {
  const configs = await getProxyConfigs();
  const config = configs.find(item => item.id === configId);
  if (!config) throw new Error(`Proxy configuration not found: ${configId}`);

  const previousConfig = configs.find(item => item.id === activeConfigId);
  const normalizedConfig = await applyProxySettings(config);
  try {
    await persistActiveConfig(normalizedConfig);
  } catch (error) {
    if (previousConfig) {
      await applyProxySettings(previousConfig).catch(() => {});
    }
    throw error;
  }

  if (options.refreshTab) {
    await refreshCurrentTab();
  }
  return normalizedConfig;
}

function createConfigId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `config_${crypto.randomUUID()}`;
  }
  return `config_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function saveProxyConfig(config) {
  const configs = await getProxyConfigs();
  const candidate = { ...config, id: config.id || createConfigId() };
  const normalizedConfig = normalizeConfig(candidate);
  const index = configs.findIndex(item => item.id === normalizedConfig.id);
  const nextConfigs = [...configs];

  if (index >= 0) {
    if (configs[index].isSystem) throw new Error('System proxy configurations cannot be modified');
    nextConfigs[index] = normalizedConfig;
  } else {
    nextConfigs.push(normalizedConfig);
  }

  if (normalizedConfig.id === activeConfigId) {
    const previousConfig = configs[index];
    await applyProxySettings(normalizedConfig);
    try {
      await persistActiveConfig(normalizedConfig, { proxyConfigs: nextConfigs });
    } catch (error) {
      if (previousConfig) await applyProxySettings(previousConfig).catch(() => {});
      throw error;
    }
  } else {
    await chrome.storage.local.set({ proxyConfigs: nextConfigs });
  }

  return normalizedConfig;
}

async function deleteProxyConfig(configId) {
  if (SYSTEM_CONFIG_IDS.has(configId)) throw new Error('System proxy configurations cannot be deleted');
  const configs = await getProxyConfigs();
  if (!configs.some(config => config.id === configId)) throw new Error('Proxy configuration not found');
  const nextConfigs = configs.filter(config => config.id !== configId);

  if (configId === activeConfigId) {
    const directConfig = nextConfigs.find(config => config.id === 'direct');
    const normalizedDirect = await applyProxySettings(directConfig);
    await persistActiveConfig(normalizedDirect, { proxyConfigs: nextConfigs });
  } else {
    await chrome.storage.local.set({ proxyConfigs: nextConfigs });
  }
  return true;
}

function normalizeImportedConfigs(newConfigs) {
  if (!Array.isArray(newConfigs)) throw new Error('Imported proxy configurations must be an array');
  if (newConfigs.length > 1000) throw new Error('Imported configuration contains too many proxy entries');

  const normalized = [];
  const ids = new Set();
  for (const config of newConfigs) {
    if (config && SYSTEM_CONFIG_IDS.has(config.id)) continue;
    const item = normalizeConfig({ ...config, id: config && config.id ? config.id : createConfigId() });
    if (ids.has(item.id)) throw new Error(`Duplicate proxy configuration ID: ${item.id}`);
    ids.add(item.id);
    normalized.push(item);
  }
  return normalized;
}

async function importProxyConfigs(newConfigs, mode = 'merge') {
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Invalid import mode');
  const imported = normalizeImportedConfigs(newConfigs);
  const currentConfigs = await getProxyConfigs();
  let nextConfigs;

  if (mode === 'replace') {
    nextConfigs = [...currentConfigs.filter(config => config.isSystem), ...imported];
  } else {
    nextConfigs = [...currentConfigs];
    for (const importedConfig of imported) {
      const index = nextConfigs.findIndex(config =>
        !config.isSystem && (config.id === importedConfig.id || config.name === importedConfig.name)
      );
      if (index >= 0) {
        nextConfigs[index] = { ...importedConfig, id: nextConfigs[index].id };
      } else {
        nextConfigs.push(importedConfig);
      }
    }
  }

  let nextActiveConfig = nextConfigs.find(config => config.id === activeConfigId);
  if (!nextActiveConfig) nextActiveConfig = nextConfigs.find(config => config.id === 'direct');
  const normalizedActive = await applyProxySettings(nextActiveConfig);
  await persistActiveConfig(normalizedActive, { proxyConfigs: nextConfigs });
  return true;
}

async function saveGlobalWhitelist(rawInput) {
  const rules = parseWhitelistText(rawInput);
  const configs = await getProxyConfigs();
  const activeConfig = configs.find(config => config.id === activeConfigId);

  if (activeConfig && !SYSTEM_CONFIG_IDS.has(activeConfig.id) && activeConfig.useGlobalWhitelist !== false) {
    await applyProxySettings(activeConfig, rules);
  }

  await chrome.storage.local.set({
    globalWhitelist: rules,
    globalWhitelistRaw: String(rawInput || '')
  });
  return rules;
}

async function refreshCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id != null) {
      await chrome.tabs.reload(tab.id);
    }
  } catch (error) {
    console.warn('Unable to refresh the active tab:', error.message);
  }
}

function cloneRestorableProxyValue(value) {
  if (!value || !value.mode) return { mode: 'system' };
  if (value.mode === 'fixed_servers') {
    return { mode: value.mode, rules: JSON.parse(JSON.stringify(value.rules || {})) };
  }
  if (value.mode === 'pac_script') {
    return { mode: value.mode, pacScript: JSON.parse(JSON.stringify(value.pacScript || {})) };
  }
  return { mode: value.mode };
}

function normalizeProxyTestSettings(userSettings = {}) {
  let url;
  try {
    url = new URL(userSettings.proxyTestUrl || DEFAULT_PROXY_TEST_URL);
  } catch {
    throw new Error('Proxy test URL is invalid');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Proxy test URL must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('Proxy test URL must not include credentials');
  }

  const requestedTimeout = Number(userSettings.proxyTestTimeoutMs);
  const timeoutMs = ALLOWED_PROXY_TEST_TIMEOUTS.has(requestedTimeout)
    ? requestedTimeout
    : DEFAULT_PROXY_TEST_TIMEOUT_MS;
  return { url: url.toString(), timeoutMs };
}

async function getProxyTestSettings() {
  const data = await chrome.storage.local.get('userSettings');
  return normalizeProxyTestSettings(data.userSettings);
}

async function testProxyConfig(config) {
  if (proxyTestInProgress) throw new Error('A proxy connection test is already running');
  proxyTestInProgress = true;
  let restoreValue = null;
  let timeoutId = null;
  let testSettings = null;

  try {
    const candidate = normalizeConfig({ ...config, id: config.id || 'temporary_test' });
    testSettings = await getProxyTestSettings();
    const previousSettings = await getChromeProxySettings();
    if (previousSettings.levelOfControl === 'not_controllable'
        || previousSettings.levelOfControl === 'controlled_by_other_extensions') {
      throw new Error('Chrome proxy settings are controlled by another policy or extension');
    }

    restoreValue = cloneRestorableProxyValue(previousSettings.value);
    const testValue = await buildProxySettings(candidate);
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), testSettings.timeoutMs);
    const startedAt = performance.now();
    temporaryAuthConfig = candidate;
    internalProxyChange = true;

    await setChromeProxySettings(testValue);
    const effectiveSettings = await getChromeProxySettings();
    if (!proxySettingsMatch(effectiveSettings.value, candidate)) {
      throw new Error('Chrome did not apply the temporary proxy configuration');
    }
    const appliedAt = performance.now();

    const testUrl = new URL(testSettings.url);
    testUrl.searchParams.set('proxyfox', String(Date.now()));
    const requestStartedAt = performance.now();
    const response = await fetch(testUrl.toString(), {
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal
    });
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`Connectivity probe returned HTTP ${response.status}`);
    }
    const finishedAt = performance.now();
    return {
      success: true,
      latencyMs: Math.max(1, Math.round(finishedAt - startedAt)),
      applyLatencyMs: Math.max(1, Math.round(appliedAt - startedAt)),
      requestLatencyMs: Math.max(1, Math.round(finishedAt - requestStartedAt)),
      testUrl: testSettings.url,
      status: response.status
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutSeconds = (testSettings?.timeoutMs || DEFAULT_PROXY_TEST_TIMEOUT_MS) / 1000;
      throw new Error(`Proxy connection test timed out after ${timeoutSeconds} seconds`);
    }
    throw error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    let restoreError = null;
    if (restoreValue) {
      try {
        await setChromeProxySettings(restoreValue);
      } catch (error) {
        restoreError = error;
        console.error('Failed to restore proxy settings after connection test:', error);
      }
    }
    internalProxyChange = false;
    temporaryAuthConfig = null;
    proxyTestInProgress = false;
    if (restoreError) {
      throw new Error(`Failed to restore the previous proxy settings: ${restoreError.message}`);
    }
  }
}

function assertProxyTestIdle() {
  if (proxyTestInProgress) {
    throw new Error('Wait for the proxy connection test to finish');
  }
}

async function handleMessage(message) {
  await ensureInitialized();
  switch (message && message.action) {
    case 'getConfigs':
      return { configs: await getProxyConfigs(), activeConfigId, lastProxyConfig };
    case 'activateConfig':
      assertProxyTestIdle();
      await activateConfig(message.configId, { refreshTab: message.refreshTab === true });
      return { success: true };
    case 'saveConfig':
      assertProxyTestIdle();
      return { success: true, config: await saveProxyConfig(message.config) };
    case 'deleteConfig':
      assertProxyTestIdle();
      await deleteProxyConfig(message.configId);
      return { success: true };
    case 'importConfigs':
      assertProxyTestIdle();
      await importProxyConfigs(message.configs, message.mode);
      return { success: true };
    case 'saveGlobalWhitelist':
      assertProxyTestIdle();
      return { success: true, rules: await saveGlobalWhitelist(message.rawInput) };
    case 'testConfig':
      return await testProxyConfig(message.config);
    case 'syncState':
      return { success: true, ...(await syncWithChromeProxySettings()) };
    default:
      throw new Error('Unsupported message action');
  }
}

function proxyAuthHandler(details, callback) {
  if (!details.isProxy) {
    callback();
    return;
  }

  ensureInitialized()
    .then(getProxyConfigs)
    .then(configs => {
      const activeConfig = temporaryAuthConfig || configs.find(config => config.id === activeConfigId);
      if (!activeConfig || !activeConfig.username || !authChallengeMatches(details, activeConfig)) {
        callback();
        return;
      }

      if (!authAttempts.has(details.requestId) && authAttempts.size >= 100) {
        authAttempts.delete(authAttempts.keys().next().value);
      }
      const attemptCount = authAttempts.get(details.requestId) || 0;
      if (attemptCount >= 2) {
        callback();
        return;
      }
      authAttempts.set(details.requestId, attemptCount + 1);
      callback({
        authCredentials: {
          username: activeConfig.username,
          password: activeConfig.password || ''
        }
      });
    })
    .catch(error => {
      console.error('Proxy authentication failed:', error);
      callback();
    });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(error => {
      console.error('Background action failed:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  initializationPromise = null;
  ensureInitialized().catch(error => console.error('Extension initialization failed:', error));
});

chrome.runtime.onStartup.addListener(() => {
  initializationPromise = null;
  ensureInitialized().catch(error => console.error('Extension startup failed:', error));
});

chrome.proxy.settings.onChange.addListener(() => {
  if (internalProxyChange) return;
  syncWithChromeProxySettings().catch(error => console.error('Proxy state synchronization failed:', error));
});

chrome.proxy.onProxyError.addListener(details => {
  console.error('Chrome proxy error:', details.error, details.fatal ? '(fatal)' : '');
});

chrome.webRequest.onAuthRequired.addListener(
  proxyAuthHandler,
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);
