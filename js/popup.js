const proxyListEl = document.getElementById('proxyList');
const proxyCountEl = document.getElementById('proxyCount');
const currentProxyEl = document.getElementById('currentProxy');
const currentProxyInfoEl = document.getElementById('currentProxyInfo');
const connectionStateEl = document.getElementById('connectionState');
const liveIndicatorEl = document.getElementById('liveIndicator');
const popupTitleEl = document.getElementById('popupTitle');
const popupVersionEl = document.getElementById('popupVersion');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const statusMessageEl = document.getElementById('statusMessage');

let proxyConfigs = [];
let activeConfigId = 'direct';
let lastProxyConfig = null;
let userSettings = {};
let statusShowTimer = null;
let statusHideTimer = null;
let switchingConfigId = null;
let proxyRefreshTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const currentLang = await preloadMessages();
    localizeHtml(currentLang);
    popupVersionEl.textContent = `v${chrome.runtime.getManifest().version}`;
    await loadUserSettings();
    bindEvents();
    await loadProxyConfigs();
  } catch (error) {
    console.error('Failed to initialize popup:', error);
    showStatusMessage(`${fetchMessage('status_error')}: ${error.message}`, 'error');
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!changes.proxyConfigs && !changes.activeConfigId && !changes.lastProxyConfig && !changes.proxyControlLevel) return;
  clearTimeout(proxyRefreshTimer);
  proxyRefreshTimer = setTimeout(() => {
    if (switchingConfigId === null) loadProxyConfigs().catch(error => {
      console.error('Failed to refresh popup proxy state:', error);
    });
  }, 40);
});

async function preloadMessages() {
  const data = await chrome.storage.local.get('userLanguage');
  const currentLang = data.userLanguage || 'en';
  window.i18nManager.setCurrentLanguage(currentLang);
  await window.i18nManager.preloadMessages(currentLang);
  return currentLang;
}

function fetchMessage(messageName, language = window.currentLang) {
  return window.i18nManager.fetchMessage(messageName, language);
}

function localizeHtml(currentLang) {
  window.currentLang = currentLang;
  document.documentElement.lang = currentLang.replace('_', '-');
  document.title = fetchMessage('extName', currentLang);
  window.i18nManager.localizeDocument(currentLang);
}

async function loadUserSettings() {
  const data = await chrome.storage.local.get('userSettings');
  userSettings = data.userSettings || {};
  if (userSettings.popupTitle) popupTitleEl.textContent = userSettings.popupTitle;
}

async function loadProxyConfigs() {
  proxyListEl.setAttribute('aria-busy', 'true');
  const response = await chrome.runtime.sendMessage({ action: 'getConfigSummaries' });
  if (!response || response.success === false) {
    throw new Error(response?.error || 'Failed to load proxy configurations');
  }
  proxyConfigs = response.configs || [];
  activeConfigId = response.activeConfigId || 'direct';
  lastProxyConfig = response.lastProxyConfig || null;
  renderProxyList();
  updateCurrentProxy();
  proxyListEl.setAttribute('aria-busy', 'false');
}

function renderProxyList() {
  const fragment = document.createDocumentFragment();
  const systemConfigs = proxyConfigs.filter(config => config.isSystem);
  const customConfigs = proxyConfigs.filter(config => !config.isSystem);

  fragment.appendChild(createGroupLabel(fetchMessage('proxy_builtin_group')));
  systemConfigs.forEach(config => fragment.appendChild(createProxyItem(config)));

  if (customConfigs.length > 0) {
    fragment.appendChild(createGroupLabel(fetchMessage('proxy_custom_group')));
    customConfigs.forEach(config => fragment.appendChild(createProxyItem(config)));
  }

  proxyListEl.replaceChildren(fragment);
  proxyCountEl.textContent = String(proxyConfigs.length);
}

function createGroupLabel(text) {
  const label = document.createElement('div');
  label.className = 'proxy-group-label';
  label.textContent = text;
  return label;
}

function createProxyItem(config) {
  const isActive = config.id === activeConfigId;
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `proxy-item${isActive ? ' active' : ''}`;
  item.dataset.id = config.id;
  item.setAttribute('aria-pressed', String(isActive));
  item.disabled = switchingConfigId !== null;

  const status = document.createElement('span');
  status.className = `proxy-status${isActive ? ' active' : ''}`;
  status.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'proxy-item-copy';
  const name = document.createElement('span');
  name.className = 'proxy-name';
  name.textContent = getConfigName(config);
  const info = document.createElement('span');
  info.className = 'proxy-info';
  info.textContent = getConfigInfo(config);
  copy.append(name, info);

  item.append(status, copy);
  return item;
}

function getConfigName(config) {
  if (config.id === 'direct') return fetchMessage('proxy_direct');
  if (config.id === 'system') return fetchMessage('proxy_system');
  return config.name;
}

function getConfigInfo(config) {
  if (config.id === 'external' || config.isExternal) {
    if (config.host && config.port) {
      return `${String(config.type || 'proxy').toUpperCase()} · ${config.host}:${config.port}`;
    }
    return String(config.type || fetchMessage('status_externalProxy')).replaceAll('_', ' ').toUpperCase();
  }
  if (config.type === 'direct') return fetchMessage('proxy_mode_direct');
  if (config.type === 'system') return fetchMessage('proxy_mode_system');
  return `${String(config.type).toUpperCase()} · ${config.host}:${config.port}`;
}

function updateCurrentProxy() {
  const isExternal = activeConfigId === 'external';
  const activeConfig = isExternal
    ? lastProxyConfig
    : proxyConfigs.find(config => config.id === activeConfigId);

  currentProxyEl.textContent = activeConfig
    ? getConfigName(activeConfig)
    : fetchMessage('status_externalProxy');
  currentProxyInfoEl.textContent = activeConfig
    ? getConfigInfo(activeConfig)
    : fetchMessage('status_externalProxy');
  connectionStateEl.textContent = fetchMessage(isExternal ? 'status_externalProxy' : 'status_active');
  connectionStateEl.classList.toggle('external', isExternal);
  liveIndicatorEl.classList.toggle('external', isExternal);
}

function bindEvents() {
  proxyListEl.addEventListener('click', handleProxyItemClick);
  openSettingsBtn.addEventListener('click', openOptionsPage);
}

async function handleProxyItemClick(event) {
  const item = event.target.closest('.proxy-item');
  if (!item || switchingConfigId !== null || item.dataset.id === activeConfigId) return;

  switchingConfigId = item.dataset.id;
  renderProxyList();
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'activateConfig',
      configId: switchingConfigId,
      refreshTab: userSettings.autoRefresh === true
    });
    if (!response?.success) {
      throw new Error(response?.error || fetchMessage('status_activationFailed'));
    }
    activeConfigId = switchingConfigId;
    updateCurrentProxy();
    showStatusMessage(fetchMessage('status_proxySwitched'));
  } catch (error) {
    console.error('Failed to activate proxy configuration:', error);
    showStatusMessage(`${fetchMessage('status_activationFailed')}: ${error.message}`, 'error');
  } finally {
    switchingConfigId = null;
    renderProxyList();
  }
}

function openOptionsPage() {
  chrome.runtime.openOptionsPage();
  window.close();
}

function showStatusMessage(message, type = 'success') {
  statusMessageEl.textContent = message;
  statusMessageEl.className = `status-message ${type === 'error' ? 'error' : 'success'}`;
  statusMessageEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
  clearTimeout(statusShowTimer);
  clearTimeout(statusHideTimer);
  statusShowTimer = setTimeout(() => statusMessageEl.classList.add('show'), 10);
  statusHideTimer = setTimeout(() => statusMessageEl.classList.remove('show'), 2200);
}
