importScripts('utils/config.js');

const {
  SYSTEM_CONFIG_IDS,
  normalizeConfig,
  parseWhitelistText,
  expandWhitelist,
  proxyValuesMatch,
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
let proxyControlLevel = 'controllable_by_this_extension';
let initializationPromise = null;
let mutationQueue = Promise.resolve();
let proxySyncQueued = false;
let cachedProxyConfigs = null;
const authAttempts = new Map();
const DEFAULT_PROXY_TEST_URL = 'https://www.gstatic.com/generate_204';
const DEFAULT_PROXY_TEST_TIMEOUT_MS = 10000;
const ALLOWED_PROXY_TEST_TIMEOUTS = new Set([5000, 10000, 15000]);
const MAX_CUSTOM_CONFIGS = 1000;
const MAX_SERIALIZED_CONFIG_BYTES = 6 * 1024 * 1024;
const MAX_GLOBAL_WHITELIST_BYTES = 1024 * 1024;
const PROXY_TEST_RECOVERY_KEY = 'proxyTestRecovery';
let temporaryAuthConfig = null;

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

function clearChromeProxySettings() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.clear({ scope: 'regular' }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function enqueueProxyMutation(task) {
  const operation = mutationQueue.then(task, task);
  mutationQueue = operation.catch(() => {});
  return operation;
}

async function waitForProxyMutations() {
  await mutationQueue;
}

function setCachedProxyConfigs(configs) {
  cachedProxyConfigs = ensureSystemConfigs(configs).map(config => ({ ...config }));
}

function assertConfigCollectionSize(configs) {
  const customConfigCount = configs.filter(config => !config.isSystem).length;
  if (customConfigCount > MAX_CUSTOM_CONFIGS) {
    throw new Error(`Proxy configuration count cannot exceed ${MAX_CUSTOM_CONFIGS}`);
  }
  const serializedBytes = new TextEncoder().encode(JSON.stringify(configs)).byteLength;
  if (serializedBytes > MAX_SERIALIZED_CONFIG_BYTES) {
    throw new Error('Proxy configurations are too large to store safely');
  }
}

function assertProxyControllable(details) {
  if (details.levelOfControl === 'not_controllable'
      || details.levelOfControl === 'controlled_by_other_extensions') {
    throw new Error('Chrome proxy settings are controlled by another policy or extension');
  }
}

async function captureProxySnapshot() {
  const details = await getChromeProxySettings();
  return {
    levelOfControl: details.levelOfControl,
    value: cloneRestorableProxyValue(details.value)
  };
}

async function restoreProxySnapshot(snapshot) {
  if (!snapshot) return;
  if (snapshot.levelOfControl === 'controllable_by_this_extension') {
    await clearChromeProxySettings();
    const restoredSettings = await getChromeProxySettings();
    if (restoredSettings.levelOfControl === 'controlled_by_this_extension') {
      throw new Error('Chrome proxy ownership was not released');
    }
    return;
  }
  if (snapshot.levelOfControl === 'controlled_by_this_extension') {
    await setChromeProxySettings(snapshot.value);
    const restoredSettings = await getChromeProxySettings();
    const restored = snapshot.value.mode === 'pac_script'
      ? restoredSettings.value?.mode === 'pac_script'
        && JSON.stringify(restoredSettings.value.pacScript || {}) === JSON.stringify(snapshot.value.pacScript || {})
      : proxyValuesMatch(restoredSettings.value, snapshot.value);
    if (!restored) throw new Error('Chrome did not restore the previous proxy configuration');
  }
}

async function captureStorageSnapshot(keys) {
  return chrome.storage.local.get(keys);
}

async function restoreStorageSnapshot(keys, snapshot) {
  const values = {};
  const missingKeys = [];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(snapshot, key)) values[key] = snapshot[key];
    else missingKeys.push(key);
  }
  if (Object.keys(values).length > 0) await chrome.storage.local.set(values);
  if (missingKeys.length > 0) await chrome.storage.local.remove(missingKeys);
  if (keys.includes('proxyConfigs')) cachedProxyConfigs = null;
  if (keys.includes('activeConfigId')) activeConfigId = snapshot.activeConfigId || 'external';
  if (keys.includes('lastProxyConfig')) {
    lastProxyConfig = snapshot.lastProxyConfig || summarizeExternalProxy(null);
  }
  if (keys.includes('proxyControlLevel')) {
    proxyControlLevel = snapshot.proxyControlLevel || 'controllable_by_this_extension';
  }
}

async function runProxyTransaction(storageKeys, task) {
  const [proxySnapshot, storageSnapshot] = await Promise.all([
    captureProxySnapshot(),
    captureStorageSnapshot(storageKeys)
  ]);
  try {
    return await task(proxySnapshot);
  } catch (error) {
    const rollbackErrors = [];
    await restoreProxySnapshot(proxySnapshot).catch(rollbackError => rollbackErrors.push(rollbackError));
    await restoreStorageSnapshot(storageKeys, storageSnapshot).catch(rollbackError => rollbackErrors.push(rollbackError));
    if (rollbackErrors.length > 0) {
      throw new Error(`${error.message}; rollback failed: ${rollbackErrors.map(item => item.message).join('; ')}`);
    }
    throw error;
  }
}

async function getProxyConfigs() {
  if (cachedProxyConfigs) return cachedProxyConfigs.map(config => ({ ...config }));
  const data = await chrome.storage.local.get('proxyConfigs');
  setCachedProxyConfigs(data.proxyConfigs);
  return cachedProxyConfigs.map(config => ({ ...config }));
}

async function initializeState() {
  const data = await chrome.storage.local.get([
    'proxyConfigs',
    'activeConfigId',
    'lastProxyConfig',
    'proxyControlLevel',
    'userLanguage'
  ]);
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
  proxyControlLevel = data.proxyControlLevel || 'controllable_by_this_extension';
  setCachedProxyConfigs(configs);

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  await recoverInterruptedProxyTest();
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
  const [proxyDetails, configs, whitelistData] = await Promise.all([
    getChromeProxySettings(),
    getProxyConfigs(),
    chrome.storage.local.get('globalWhitelist')
  ]);
  const externallyControlled = proxyDetails.levelOfControl === 'not_controllable'
    || proxyDetails.levelOfControl === 'controlled_by_other_extensions';
  const globalWhitelist = whitelistData.globalWhitelist || [];
  let matchedConfig = null;

  if (!externallyControlled) {
    for (const config of configs) {
      const expectedValue = await buildProxySettings(config, globalWhitelist);
      if (proxyValuesMatch(proxyDetails.value, expectedValue)) {
        matchedConfig = config;
        break;
      }
    }
  }

  if (matchedConfig) {
    activeConfigId = matchedConfig.id;
    lastProxyConfig = summarizeConfig(matchedConfig);
  } else {
    activeConfigId = 'external';
    lastProxyConfig = summarizeExternalProxy(proxyDetails.value);
  }

  proxyControlLevel = proxyDetails.levelOfControl;

  await chrome.storage.local.set({
    activeConfigId,
    lastProxyConfig,
    proxyControlLevel
  });
  updateExtensionIcon(proxyDetails.value && proxyDetails.value.mode !== 'direct');
  return { activeConfigId, lastProxyConfig, proxyControlLevel };
}

function summarizeExternalProxy(value) {
  const proxy = value?.rules?.singleProxy;
  return {
    id: 'external',
    name: getMessage('status_externalProxy') || 'External proxy configuration',
    type: proxy?.scheme || value?.mode || 'unknown',
    host: proxy?.host || '',
    port: proxy?.port || 0,
    isExternal: true
  };
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
  const currentSettings = await getChromeProxySettings();
  assertProxyControllable(currentSettings);
  await setChromeProxySettings(value);
  const effectiveSettings = await getChromeProxySettings();
  if (!proxyValuesMatch(effectiveSettings.value, value)) {
    throw new Error('Chrome did not apply the requested proxy configuration');
  }

  return normalizedConfig;
}

async function persistActiveConfig(config, extraStorage = {}) {
  if (extraStorage.proxyConfigs) assertConfigCollectionSize(extraStorage.proxyConfigs);
  activeConfigId = config.id;
  lastProxyConfig = summarizeConfig(config);
  proxyControlLevel = 'controlled_by_this_extension';
  await chrome.storage.local.set({
    ...extraStorage,
    activeConfigId,
    lastProxyConfig,
    proxyControlLevel
  });
  if (extraStorage.proxyConfigs) setCachedProxyConfigs(extraStorage.proxyConfigs);
  updateExtensionIcon(config.type !== 'direct');
}

async function activateConfig(configId, options = {}) {
  const configs = await getProxyConfigs();
  const config = configs.find(item => item.id === configId);
  if (!config) throw new Error(`Proxy configuration not found: ${configId}`);

  const normalizedConfig = await runProxyTransaction(
    ['activeConfigId', 'lastProxyConfig', 'proxyControlLevel'],
    async () => {
      const normalized = await applyProxySettings(config);
      await persistActiveConfig(normalized);
      return normalized;
    }
  );

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

async function saveProxyConfig(config, options = {}) {
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
  assertConfigCollectionSize(nextConfigs);

  const shouldActivate = options.activate === true || normalizedConfig.id === activeConfigId;
  if (shouldActivate) {
    return runProxyTransaction(
      ['proxyConfigs', 'activeConfigId', 'lastProxyConfig', 'proxyControlLevel'],
      async () => {
        const normalized = await applyProxySettings(normalizedConfig);
        await persistActiveConfig(normalized, { proxyConfigs: nextConfigs });
        return normalized;
      }
    );
  } else {
    await chrome.storage.local.set({ proxyConfigs: nextConfigs });
    setCachedProxyConfigs(nextConfigs);
  }

  return normalizedConfig;
}

async function deleteProxyConfig(configId) {
  if (SYSTEM_CONFIG_IDS.has(configId)) throw new Error('System proxy configurations cannot be deleted');
  const configs = await getProxyConfigs();
  if (!configs.some(config => config.id === configId)) throw new Error('Proxy configuration not found');
  const nextConfigs = configs.filter(config => config.id !== configId);

  if (configId === activeConfigId) {
    await runProxyTransaction(
      ['proxyConfigs', 'activeConfigId', 'lastProxyConfig', 'proxyControlLevel'],
      async () => {
        const directConfig = nextConfigs.find(config => config.id === 'direct');
        const normalizedDirect = await applyProxySettings(directConfig);
        await persistActiveConfig(normalizedDirect, { proxyConfigs: nextConfigs });
      }
    );
  } else {
    await chrome.storage.local.set({ proxyConfigs: nextConfigs });
    setCachedProxyConfigs(nextConfigs);
  }
  return true;
}

function normalizeImportedConfigs(newConfigs) {
  if (!Array.isArray(newConfigs)) throw new Error('Imported proxy configurations must be an array');
  if (newConfigs.length > MAX_CUSTOM_CONFIGS) {
    throw new Error(`Imported configuration cannot exceed ${MAX_CUSTOM_CONFIGS} proxy entries`);
  }

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

  assertConfigCollectionSize(nextConfigs);
  let nextActiveConfig = nextConfigs.find(config => config.id === activeConfigId);
  if (!nextActiveConfig) nextActiveConfig = nextConfigs.find(config => config.id === 'direct');
  await runProxyTransaction(
    ['proxyConfigs', 'activeConfigId', 'lastProxyConfig', 'proxyControlLevel'],
    async () => {
      const normalizedActive = await applyProxySettings(nextActiveConfig);
      await persistActiveConfig(normalizedActive, { proxyConfigs: nextConfigs });
    }
  );
  return true;
}

async function saveGlobalWhitelist(rawInput) {
  const rawValue = String(rawInput || '');
  if (new TextEncoder().encode(rawValue).byteLength > MAX_GLOBAL_WHITELIST_BYTES) {
    throw new Error('Global whitelist is too large to store safely');
  }
  const rules = parseWhitelistText(rawValue);
  const configs = await getProxyConfigs();
  const activeConfig = configs.find(config => config.id === activeConfigId);

  await runProxyTransaction(
    ['globalWhitelist', 'globalWhitelistRaw', 'activeConfigId', 'lastProxyConfig', 'proxyControlLevel'],
    async () => {
      if (activeConfig && !SYSTEM_CONFIG_IDS.has(activeConfig.id) && activeConfig.useGlobalWhitelist !== false) {
        await applyProxySettings(activeConfig, rules);
      }
      await chrome.storage.local.set({
        globalWhitelist: rules,
        globalWhitelistRaw: rawValue
      });
    }
  );
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

async function clearProxyTestRecovery() {
  await chrome.storage.local.remove(PROXY_TEST_RECOVERY_KEY);
}

async function recoverInterruptedProxyTest() {
  const data = await chrome.storage.local.get(PROXY_TEST_RECOVERY_KEY);
  const recovery = data[PROXY_TEST_RECOVERY_KEY];
  if (!recovery?.snapshot || !recovery?.testValue) return false;

  const currentSettings = await getChromeProxySettings();
  const candidateStillApplied = currentSettings.levelOfControl === 'controlled_by_this_extension'
    && proxyValuesMatch(currentSettings.value, recovery.testValue);
  if (candidateStillApplied) {
    await restoreProxySnapshot(recovery.snapshot);
  }
  await clearProxyTestRecovery();
  return candidateStillApplied;
}

async function testProxyConfig(config) {
  let proxySnapshot = null;
  let testValue = null;
  let timeoutId = null;
  let testSettings = null;
  let recoveryWritten = false;

  try {
    const candidate = normalizeConfig({ ...config, id: config.id || 'temporary_test' });
    testSettings = await getProxyTestSettings();
    proxySnapshot = await captureProxySnapshot();
    assertProxyControllable(proxySnapshot);

    testValue = await buildProxySettings(candidate);
    await chrome.storage.local.set({
      [PROXY_TEST_RECOVERY_KEY]: {
        snapshot: proxySnapshot,
        testValue,
        createdAt: Date.now()
      }
    });
    recoveryWritten = true;
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), testSettings.timeoutMs);
    const startedAt = performance.now();
    temporaryAuthConfig = candidate;

    await setChromeProxySettings(testValue);
    const effectiveSettings = await getChromeProxySettings();
    if (!proxyValuesMatch(effectiveSettings.value, testValue)) {
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
    if (recoveryWritten && proxySnapshot && testValue) {
      try {
        const currentSettings = await getChromeProxySettings();
        const candidateStillApplied = currentSettings.levelOfControl === 'controlled_by_this_extension'
          && proxyValuesMatch(currentSettings.value, testValue);
        if (candidateStillApplied) {
          await restoreProxySnapshot(proxySnapshot);
        }
        await clearProxyTestRecovery();
      } catch (error) {
        restoreError = error;
        console.error('Failed to restore proxy settings after connection test:', error);
      }
    }
    temporaryAuthConfig = null;
    if (restoreError) {
      throw new Error(`Failed to restore the previous proxy settings: ${restoreError.message}`);
    }
  }
}

async function handleMessage(message) {
  await ensureInitialized();
  switch (message && message.action) {
    case 'getConfigs': {
      await waitForProxyMutations();
      return { configs: await getProxyConfigs(), activeConfigId, lastProxyConfig, proxyControlLevel };
    }
    case 'getConfigSummaries': {
      await waitForProxyMutations();
      const configs = await getProxyConfigs();
      return {
        configs: configs.map(config => ({
          id: config.id,
          name: config.name,
          type: config.type,
          host: config.host || '',
          port: config.port || 0,
          isSystem: config.isSystem === true
        })),
        activeConfigId,
        lastProxyConfig,
        proxyControlLevel
      };
    }
    case 'activateConfig':
      return enqueueProxyMutation(async () => {
        await activateConfig(message.configId, { refreshTab: message.refreshTab === true });
        return { success: true };
      });
    case 'saveConfig':
      return enqueueProxyMutation(async () => ({
        success: true,
        config: await saveProxyConfig(message.config)
      }));
    case 'saveAndActivateConfig':
      return enqueueProxyMutation(async () => ({
        success: true,
        config: await saveProxyConfig(message.config, { activate: true })
      }));
    case 'deleteConfig':
      return enqueueProxyMutation(async () => {
        await deleteProxyConfig(message.configId);
        return { success: true };
      });
    case 'importConfigs':
      return enqueueProxyMutation(async () => {
        await importProxyConfigs(message.configs, message.mode);
        return { success: true };
      });
    case 'saveGlobalWhitelist':
      return enqueueProxyMutation(async () => ({
        success: true,
        rules: await saveGlobalWhitelist(message.rawInput)
      }));
    case 'testConfig':
      return enqueueProxyMutation(() => testProxyConfig(message.config));
    case 'syncState':
      return enqueueProxyMutation(async () => ({
        success: true,
        ...(await syncWithChromeProxySettings())
      }));
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
  cachedProxyConfigs = null;
  ensureInitialized().catch(error => console.error('Extension initialization failed:', error));
});

chrome.runtime.onStartup.addListener(() => {
  initializationPromise = null;
  cachedProxyConfigs = null;
  ensureInitialized().catch(error => console.error('Extension startup failed:', error));
});

chrome.proxy.settings.onChange.addListener(() => {
  if (proxySyncQueued) return;
  proxySyncQueued = true;
  enqueueProxyMutation(async () => {
    try {
      await syncWithChromeProxySettings();
    } finally {
      proxySyncQueued = false;
    }
  }).catch(error => console.error('Proxy state synchronization failed:', error));
});

chrome.proxy.onProxyError.addListener(details => {
  console.error('Chrome proxy error:', details.error, details.fatal ? '(fatal)' : '');
});

chrome.webRequest.onAuthRequired.addListener(
  proxyAuthHandler,
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);
