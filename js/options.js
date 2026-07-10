const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');
const proxyListEl = document.getElementById('proxyList');
const proxyCountEl = document.getElementById('proxyCount');
const activeProxySummaryEl = document.getElementById('activeProxySummary');
const addProxyBtn = document.getElementById('addProxyBtn');
const emptyAddProxyBtn = document.getElementById('emptyAddProxyBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFileEl = document.getElementById('importFile');
const autoRefreshToggleEl = document.getElementById('autoRefreshToggle');
const includeCredentialsToggleEl = document.getElementById('includeCredentialsToggle');
const DEFAULT_PROXY_TEST_URL = 'https://www.gstatic.com/generate_204';
const DEFAULT_PROXY_TEST_TIMEOUT_MS = 10000;

const editorEmptyState = document.getElementById('editorEmptyState');
const systemConfigPanel = document.getElementById('systemConfigPanel');
const systemConfigTitle = document.getElementById('systemConfigTitle');
const systemConfigState = document.getElementById('systemConfigState');
const systemConfigDescription = document.getElementById('systemConfigDescription');
const systemModeNode = document.getElementById('systemModeNode');
const activateSystemBtn = document.getElementById('activateSystemBtn');

const proxyForm = document.getElementById('proxyForm');
const formTitle = document.getElementById('formTitle');
const formModeLabel = document.getElementById('formModeLabel');
const formStateBadge = document.getElementById('formStateBadge');
const editorActions = document.getElementById('editorActions');
const proxyNameEl = document.getElementById('proxyName');
const proxyTypeEl = document.getElementById('proxyType');
const proxyHostEl = document.getElementById('proxyHost');
const proxyPortEl = document.getElementById('proxyPort');
const proxyUsernameEl = document.getElementById('proxyUsername');
const proxyPasswordEl = document.getElementById('proxyPassword');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const testProxyBtn = document.getElementById('testProxyBtn');
const connectionTestResult = document.getElementById('connectionTestResult');
const testTargetSummary = document.getElementById('testTargetSummary');
const proxyTestSettingsPopover = document.getElementById('proxyTestSettingsPopover');
const proxyTestUrlEl = document.getElementById('proxyTestUrl');
const proxyTestTimeoutEl = document.getElementById('proxyTestTimeout');
const resetProxyTestSettingsBtn = document.getElementById('resetProxyTestSettingsBtn');
const saveProxyTestSettingsBtn = document.getElementById('saveProxyTestSettingsBtn');
const useGlobalWhitelistEl = document.getElementById('useGlobalWhitelist');
const whitelistEl = document.getElementById('whitelist');
const proxyIdEl = document.getElementById('proxyId');
const saveProxyBtn = document.getElementById('saveProxyBtn');
const saveAndActivateBtn = document.getElementById('saveAndActivateBtn');
const deleteProxyBtn = document.getElementById('deleteProxyBtn');
const cancelProxyBtn = document.getElementById('cancelProxyBtn');
const httpsProxyWarningEl = document.getElementById('httpsProxyWarning');
const httpsHelpLinkEl = document.getElementById('httpsHelpLink');

const globalWhitelistInputEl = document.getElementById('globalWhitelistInput');
const saveGlobalWhitelistBtn = document.getElementById('saveGlobalWhitelistBtn');
const languageButtons = document.querySelectorAll('.language-btn');

let proxyConfigs = [];
let activeConfigId = 'direct';
let lastProxyConfig = null;
let selectedConfigId = null;
let isNewDraft = false;
let originalFormSnapshot = '';
let pendingSelectionId = null;
let globalWhitelist = [];
let statusShowTimer = null;
let statusHideTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const currentLang = await preloadMessages();
    localizeHtml(currentLang);
    bindEvents();
    await Promise.all([
      updateVersionNumbers(),
      loadGlobalWhitelist(),
      loadBehaviorSettings(),
      initLanguageSettings()
    ]);
    await loadProxyConfigs();
    restoreLastActiveTab();
    selectConfig(proxyConfigs.some(config => config.id === activeConfigId) ? activeConfigId : 'direct');
  } catch (error) {
    console.error('Failed to initialize options page:', error);
    showStatusMessage(`${fetchMessage('status_error', window.currentLang)}: ${error.message}`, 'error');
  }
});

window.addEventListener('beforeunload', event => {
  if (!isFormDirty()) return;
  event.preventDefault();
  event.returnValue = '';
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
  document.title = fetchMessage('options_title', currentLang);
  window.i18nManager.localizeDocument(currentLang);
}

async function updateVersionNumbers() {
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version;
  document.getElementById('sidebarVersion').textContent = `v${version}`;
  document.getElementById('aboutVersion').textContent = `ProxyFox v${version}`;
  document.getElementById('currentVersion').textContent = `v${version}`;
}

async function loadProxyConfigs() {
  const response = await chrome.runtime.sendMessage({ action: 'getConfigs' });
  if (!response || response.success === false) {
    throw new Error(response?.error || 'Failed to load proxy configurations');
  }
  proxyConfigs = response.configs || [];
  activeConfigId = response.activeConfigId || 'direct';
  lastProxyConfig = response.lastProxyConfig || null;
  renderProxyList();
  updateActiveSummary();
}

function renderProxyList() {
  const fragment = document.createDocumentFragment();
  const systemConfigs = proxyConfigs.filter(config => config.isSystem);
  const customConfigs = proxyConfigs.filter(config => !config.isSystem);

  fragment.appendChild(createGroupLabel(fetchMessage('proxy_builtin_group')));
  systemConfigs.forEach(config => fragment.appendChild(createProxyItemElement(config)));

  fragment.appendChild(createGroupLabel(fetchMessage('proxy_custom_group')));
  if (isNewDraft) {
    fragment.appendChild(createProxyItemElement({
      id: '__draft__',
      name: proxyNameEl.value.trim() || fetchMessage('status_draft'),
      type: proxyTypeEl.value || 'http',
      host: proxyHostEl.value.trim(),
      port: proxyPortEl.value,
      isDraft: true
    }));
  }
  customConfigs.forEach(config => fragment.appendChild(createProxyItemElement(config)));

  if (customConfigs.length === 0 && !isNewDraft) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = fetchMessage('proxy_empty_list');
    fragment.appendChild(empty);
  }

  proxyListEl.replaceChildren(fragment);
  proxyCountEl.textContent = String(proxyConfigs.length + (isNewDraft ? 1 : 0));
}

function createGroupLabel(text) {
  const label = document.createElement('div');
  label.className = 'proxy-group-label';
  label.textContent = text;
  return label;
}

function createProxyItemElement(config) {
  const isSelected = selectedConfigId === config.id;
  const isActive = activeConfigId === config.id;
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `proxy-item${isSelected ? ' selected' : ''}${isActive ? ' active-config' : ''}`;
  item.dataset.id = config.id;
  item.setAttribute('aria-pressed', String(isSelected));

  const status = document.createElement('span');
  status.className = `proxy-status${isActive ? ' active' : ''}`;
  status.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'proxy-item-copy';
  const name = document.createElement('span');
  name.className = 'proxy-name';
  name.textContent = getConfigDisplayName(config);
  const info = document.createElement('span');
  info.className = 'proxy-info';
  info.textContent = getProxyInfoText(config);
  copy.append(name, info);

  const state = document.createElement('span');
  state.className = 'item-state';
  state.textContent = isActive ? fetchMessage('status_active') : '';

  item.append(status, copy, state);
  return item;
}

function getConfigDisplayName(config) {
  if (config.id === 'direct') return fetchMessage('proxy_direct');
  if (config.id === 'system') return fetchMessage('proxy_system');
  return config.name;
}

function getProxyInfoText(config) {
  if (config.isDraft) return fetchMessage('status_draft');
  if (config.type === 'direct') return fetchMessage('proxy_mode_direct');
  if (config.type === 'system') return fetchMessage('proxy_mode_system');
  return `${String(config.type).toUpperCase()} · ${config.host}:${config.port}`;
}

function updateActiveSummary() {
  if (activeConfigId === 'external') {
    activeProxySummaryEl.textContent = lastProxyConfig?.name || fetchMessage('status_externalProxy');
    return;
  }
  const activeConfig = proxyConfigs.find(config => config.id === activeConfigId);
  activeProxySummaryEl.textContent = activeConfig ? getConfigDisplayName(activeConfig) : '—';
}

function requestSelectConfig(configId) {
  if (configId === selectedConfigId) return;
  if (isFormDirty()) {
    pendingSelectionId = configId;
    editorActions.classList.add('needs-attention');
    showStatusMessage(fetchMessage('status_unsavedSelection'), 'error');
    cancelProxyBtn.focus();
    return;
  }
  selectConfig(configId);
}

function selectConfig(configId) {
  const config = proxyConfigs.find(item => item.id === configId);
  if (!config) {
    showEmptyEditor();
    return;
  }

  selectedConfigId = config.id;
  isNewDraft = false;
  pendingSelectionId = null;
  editorActions.classList.remove('needs-attention');
  renderProxyList();

  if (config.isSystem) {
    showSystemEditor(config);
  } else {
    showCustomEditor(config);
  }
}

function showEmptyEditor() {
  selectedConfigId = null;
  isNewDraft = false;
  editorEmptyState.hidden = false;
  systemConfigPanel.hidden = true;
  proxyForm.hidden = true;
  renderProxyList();
}

function showSystemEditor(config) {
  editorEmptyState.hidden = true;
  proxyForm.hidden = true;
  systemConfigPanel.hidden = false;
  systemConfigPanel.dataset.configId = config.id;
  systemConfigTitle.textContent = getConfigDisplayName(config);
  systemModeNode.textContent = getConfigDisplayName(config);
  systemConfigDescription.textContent = fetchMessage(
    config.id === 'direct' ? 'system_direct_desc' : 'system_proxy_desc'
  );
  const isActive = config.id === activeConfigId;
  systemConfigState.textContent = fetchMessage(isActive ? 'status_active' : 'status_inactive');
  systemConfigState.classList.toggle('active', isActive);
  activateSystemBtn.disabled = isActive;
  activateSystemBtn.textContent = fetchMessage(isActive ? 'status_active' : 'btn_activateProxy');
}

function showCustomEditor(config) {
  editorEmptyState.hidden = true;
  systemConfigPanel.hidden = true;
  proxyForm.hidden = false;
  fillForm(config);
  formModeLabel.textContent = fetchMessage('editor_editing');
  formTitle.textContent = config.name;
  deleteProxyBtn.hidden = false;
  originalFormSnapshot = captureFormSnapshot();
  updateDirtyState();
}

function startNewDraft() {
  if (isFormDirty()) {
    pendingSelectionId = '__new__';
    showStatusMessage(fetchMessage('status_unsavedSelection'), 'error');
    cancelProxyBtn.focus();
    return;
  }

  isNewDraft = true;
  clearConnectionTestResult();
  selectedConfigId = '__draft__';
  pendingSelectionId = null;
  editorEmptyState.hidden = true;
  systemConfigPanel.hidden = true;
  proxyForm.hidden = false;
  proxyForm.reset();
  proxyIdEl.value = '';
  proxyTypeEl.value = 'http';
  proxyPortEl.value = '8080';
  useGlobalWhitelistEl.checked = true;
  proxyPasswordEl.type = 'password';
  togglePasswordBtn.textContent = fetchMessage('show_password');
  httpsProxyWarningEl.hidden = true;
  formModeLabel.textContent = fetchMessage('editor_creating');
  formTitle.textContent = fetchMessage('form_title_add');
  deleteProxyBtn.hidden = true;
  originalFormSnapshot = captureFormSnapshot();
  updateDirtyState();
  renderProxyList();
  proxyNameEl.focus();
}

function fillForm(config) {
  clearConnectionTestResult();
  proxyNameEl.value = config.name || '';
  proxyTypeEl.value = config.type || 'http';
  proxyHostEl.value = config.host || '';
  proxyPortEl.value = config.port || '';
  proxyUsernameEl.value = config.username || '';
  proxyPasswordEl.value = config.password || '';
  useGlobalWhitelistEl.checked = config.useGlobalWhitelist !== false;
  whitelistEl.value = (config.whitelist || []).join('\n');
  proxyIdEl.value = config.id || '';
  httpsProxyWarningEl.hidden = config.type !== 'https';
  proxyPasswordEl.type = 'password';
  togglePasswordBtn.textContent = fetchMessage('show_password');
}

function captureFormSnapshot() {
  return JSON.stringify({
    name: proxyNameEl.value,
    type: proxyTypeEl.value,
    host: proxyHostEl.value,
    port: proxyPortEl.value,
    username: proxyUsernameEl.value,
    password: proxyPasswordEl.value,
    useGlobalWhitelist: useGlobalWhitelistEl.checked,
    whitelist: whitelistEl.value,
    id: proxyIdEl.value
  });
}

function isFormDirty() {
  return !proxyForm.hidden && captureFormSnapshot() !== originalFormSnapshot;
}

function updateDirtyState() {
  const dirty = isFormDirty();
  const isActive = !isNewDraft && selectedConfigId === activeConfigId;
  formTitle.textContent = proxyNameEl.value.trim()
    || fetchMessage(isNewDraft ? 'form_title_add' : 'form_title_edit');
  formStateBadge.textContent = fetchMessage(
    dirty ? 'status_unsaved' : isNewDraft ? 'status_draft' : isActive ? 'status_active' : 'status_saved'
  );
  formStateBadge.classList.toggle('dirty', dirty || isNewDraft);
  formStateBadge.classList.toggle('active', isActive && !dirty);
  saveProxyBtn.hidden = isActive;
  saveProxyBtn.disabled = !dirty;
  saveAndActivateBtn.disabled = !dirty && isActive;
  const primaryActionKey = isActive
    ? 'btn_saveAndKeepActive'
    : (dirty || isNewDraft) ? 'btn_saveAndActivate' : 'btn_activateProxy';
  saveAndActivateBtn.textContent = fetchMessage(primaryActionKey);
  if (isNewDraft) renderProxyList();
}

function collectValidatedFormConfig() {
  if (!proxyForm.checkValidity()) {
    proxyForm.reportValidity();
    return null;
  }

  const configData = {
    id: proxyIdEl.value || 'pending',
    name: proxyNameEl.value.trim(),
    type: proxyTypeEl.value,
    host: proxyHostEl.value.trim(),
    port: Number(proxyPortEl.value),
    username: proxyUsernameEl.value.trim(),
    password: proxyPasswordEl.value,
    useGlobalWhitelist: useGlobalWhitelistEl.checked,
    whitelist: window.ProxyFoxConfig.parseWhitelistText(whitelistEl.value)
  };

  try {
    const normalized = window.ProxyFoxConfig.normalizeConfig(configData);
    if (isNewDraft) delete normalized.id;
    return normalized;
  } catch (error) {
    showStatusMessage(error.message, 'error');
    return null;
  }
}

async function saveCurrentConfig(activateAfterSave) {
  const config = collectValidatedFormConfig();
  if (!config) return;
  setFormBusy(true);

  try {
    const saveResponse = await chrome.runtime.sendMessage({ action: 'saveConfig', config });
    if (!saveResponse?.success) throw new Error(saveResponse?.error || 'Failed to save proxy configuration');
    const savedConfig = saveResponse.config;

    if (activateAfterSave && activeConfigId !== savedConfig.id) {
      const activateResponse = await chrome.runtime.sendMessage({
        action: 'activateConfig',
        configId: savedConfig.id
      });
      if (!activateResponse?.success) throw new Error(activateResponse?.error || 'Failed to activate proxy configuration');
    }

    isNewDraft = false;
    selectedConfigId = savedConfig.id;
    const nextId = pendingSelectionId;
    pendingSelectionId = null;
    await loadProxyConfigs();
    selectConfig(savedConfig.id);
    showStatusMessage(fetchMessage(activateAfterSave ? 'status_savedAndActivated' : 'status_configSaved'));

    if (nextId) {
      if (nextId === '__new__') startNewDraft();
      else selectConfig(nextId);
    }
  } catch (error) {
    console.error('Failed to save proxy configuration:', error);
    showStatusMessage(`${fetchMessage('status_error')}: ${error.message}`, 'error');
  } finally {
    setFormBusy(false);
  }
}

async function testCurrentProxy() {
  const config = collectValidatedFormConfig();
  if (!config) return;
  testProxyBtn.disabled = true;
  testProxyBtn.textContent = fetchMessage('status_testingProxy');
  connectionTestResult.textContent = fetchMessage('status_testingProxy');
  connectionTestResult.className = '';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'testConfig', config });
    if (!response?.success) throw new Error(response?.error || 'Proxy connection test failed');
    const totalLatencyMs = getFiniteLatency(response.latencyMs);
    const networkLatencyMs = getFiniteLatency(response.requestLatencyMs);
    const applyLatencyMs = getFiniteLatency(response.applyLatencyMs);
    const timingParts = [];
    if (networkLatencyMs !== null) {
      timingParts.push(`${fetchMessage('test_latency_network')} ${networkLatencyMs} ms`);
    } else if (totalLatencyMs !== null) {
      timingParts.push(`${fetchMessage('test_latency_total')} ${totalLatencyMs} ms`);
    }
    if (applyLatencyMs !== null) {
      timingParts.push(`${fetchMessage('test_latency_apply')} ${applyLatencyMs} ms`);
    }
    connectionTestResult.textContent = timingParts[0] || fetchMessage('status_proxyTestSuccess');
    connectionTestResult.className = 'success';
    showStatusMessage([fetchMessage('status_proxyTestSuccess'), ...timingParts].join(' · '));
  } catch (error) {
    console.error('Proxy connection test failed:', error);
    connectionTestResult.textContent = fetchMessage('status_proxyTestFailed');
    connectionTestResult.className = 'error';
    showStatusMessage(`${fetchMessage('status_proxyTestFailed')}: ${error.message}`, 'error');
  } finally {
    testProxyBtn.disabled = false;
    testProxyBtn.textContent = fetchMessage('btn_testProxy');
  }
}

function getFiniteLatency(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null;
}

function setFormBusy(busy) {
  proxyForm.setAttribute('aria-busy', String(busy));
  for (const control of proxyForm.querySelectorAll('button, input, select, textarea')) {
    control.disabled = busy;
  }
  if (!busy) updateDirtyState();
}

function discardChanges() {
  const nextId = pendingSelectionId;
  pendingSelectionId = null;
  editorActions.classList.remove('needs-attention');

  if (nextId === '__new__') {
    isNewDraft = false;
    originalFormSnapshot = captureFormSnapshot();
    startNewDraft();
    return;
  }
  if (nextId) {
    originalFormSnapshot = captureFormSnapshot();
    selectConfig(nextId);
    return;
  }
  if (isNewDraft) {
    isNewDraft = false;
    selectConfig(proxyConfigs.some(config => config.id === activeConfigId) ? activeConfigId : 'direct');
    return;
  }
  const config = proxyConfigs.find(item => item.id === selectedConfigId);
  if (config) showCustomEditor(config);
}

async function deleteCurrentConfig() {
  const config = proxyConfigs.find(item => item.id === selectedConfigId);
  if (!config || config.isSystem) return;
  const wasActive = config.id === activeConfigId;
  setFormBusy(true);

  try {
    const response = await chrome.runtime.sendMessage({ action: 'deleteConfig', configId: config.id });
    if (!response?.success) throw new Error(response?.error || 'Failed to delete proxy configuration');
    await loadProxyConfigs();
    selectConfig(proxyConfigs.some(item => item.id === activeConfigId) ? activeConfigId : 'direct');
    showUndoMessage(fetchMessage('status_configDeleted'), async () => {
      const restoreResponse = await chrome.runtime.sendMessage({ action: 'saveConfig', config });
      if (!restoreResponse?.success) throw new Error(restoreResponse?.error || 'Failed to restore proxy configuration');
      if (wasActive) {
        const activateResponse = await chrome.runtime.sendMessage({ action: 'activateConfig', configId: config.id });
        if (!activateResponse?.success) throw new Error(activateResponse?.error || 'Failed to reactivate proxy configuration');
      }
      await loadProxyConfigs();
      selectConfig(config.id);
      showStatusMessage(fetchMessage('status_configRestored'));
    });
  } catch (error) {
    console.error('Failed to delete proxy configuration:', error);
    showStatusMessage(`${fetchMessage('status_error')}: ${error.message}`, 'error');
  } finally {
    setFormBusy(false);
  }
}

async function activateSelectedSystemConfig() {
  const configId = systemConfigPanel.dataset.configId;
  const response = await chrome.runtime.sendMessage({ action: 'activateConfig', configId });
  if (!response?.success) {
    showStatusMessage(`${fetchMessage('status_error')}: ${response?.error || ''}`, 'error');
    return;
  }
  await loadProxyConfigs();
  selectConfig(configId);
  showStatusMessage(fetchMessage('status_proxySwitched'));
}

async function loadGlobalWhitelist() {
  const data = await chrome.storage.local.get(['globalWhitelist', 'globalWhitelistRaw']);
  globalWhitelist = data.globalWhitelist || [];
  globalWhitelistInputEl.value = data.globalWhitelistRaw || globalWhitelist.join('\n');
}

async function saveGlobalWhitelist() {
  const rawInput = globalWhitelistInputEl.value;
  const response = await chrome.runtime.sendMessage({ action: 'saveGlobalWhitelist', rawInput });
  if (!response?.success) {
    showStatusMessage(`${fetchMessage('status_error')}: ${response?.error || ''}`, 'error');
    return;
  }
  globalWhitelist = response.rules || [];
  showStatusMessage(fetchMessage('status_globalWhitelistSaved'));
}

async function loadBehaviorSettings() {
  const data = await chrome.storage.local.get('userSettings');
  const settings = data.userSettings || {};
  autoRefreshToggleEl.checked = settings.autoRefresh === true;
  includeCredentialsToggleEl.checked = false;
  proxyTestUrlEl.value = settings.proxyTestUrl || DEFAULT_PROXY_TEST_URL;
  proxyTestTimeoutEl.value = String(settings.proxyTestTimeoutMs || DEFAULT_PROXY_TEST_TIMEOUT_MS);
  updateProxyTestSummary();
}

async function saveAutoRefreshSetting() {
  const data = await chrome.storage.local.get('userSettings');
  await chrome.storage.local.set({
    userSettings: { ...(data.userSettings || {}), autoRefresh: autoRefreshToggleEl.checked }
  });
  showStatusMessage(fetchMessage('status_behaviorSaved'));
}

function getValidatedProxyTestSettings() {
  proxyTestUrlEl.setCustomValidity('');
  let url;
  try {
    url = new URL(proxyTestUrlEl.value.trim());
  } catch {
    proxyTestUrlEl.setCustomValidity(fetchMessage('test_url_error'));
    proxyTestUrlEl.reportValidity();
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    proxyTestUrlEl.setCustomValidity(fetchMessage('test_url_error'));
    proxyTestUrlEl.reportValidity();
    return null;
  }
  return {
    proxyTestUrl: url.toString(),
    proxyTestTimeoutMs: Number(proxyTestTimeoutEl.value)
  };
}

function updateProxyTestSummary() {
  try {
    const url = new URL(proxyTestUrlEl.value || DEFAULT_PROXY_TEST_URL);
    const seconds = Number(proxyTestTimeoutEl.value || DEFAULT_PROXY_TEST_TIMEOUT_MS) / 1000;
    testTargetSummary.textContent = `${url.host} · ${seconds} ${fetchMessage('unit_seconds')}`;
  } catch {
    testTargetSummary.textContent = fetchMessage('test_target_custom');
  }
}

async function saveProxyTestSettings() {
  const settings = getValidatedProxyTestSettings();
  if (!settings) return;
  const data = await chrome.storage.local.get('userSettings');
  await chrome.storage.local.set({
    userSettings: { ...(data.userSettings || {}), ...settings }
  });
  updateProxyTestSummary();
  proxyTestSettingsPopover.hidePopover?.();
  showStatusMessage(fetchMessage('status_testSettingsSaved'));
}

async function resetProxyTestSettings() {
  proxyTestUrlEl.value = DEFAULT_PROXY_TEST_URL;
  proxyTestTimeoutEl.value = String(DEFAULT_PROXY_TEST_TIMEOUT_MS);
  await saveProxyTestSettings();
}

async function exportConfigurations() {
  const data = await chrome.storage.local.get(['globalWhitelist', 'globalWhitelistRaw', 'activeConfigId']);
  const exportedConfigs = proxyConfigs.map(config => {
    if (includeCredentialsToggleEl.checked || config.isSystem) return { ...config };
    const { username: _username, password: _password, ...safeConfig } = config;
    return safeConfig;
  });
  const exportData = JSON.stringify({
    formatVersion: 2,
    includesCredentials: includeCredentialsToggleEl.checked,
    proxyConfigs: exportedConfigs,
    globalWhitelist: data.globalWhitelist || [],
    globalWhitelistRaw: data.globalWhitelistRaw || '',
    activeConfigId: data.activeConfigId || 'direct'
  }, null, 2);
  const url = URL.createObjectURL(new Blob([exportData], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'proxyfox-config.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showStatusMessage(fetchMessage('status_exportSuccess'));
}

async function importConfigurations(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (isFormDirty()) {
    showStatusMessage(fetchMessage('status_unsavedSelection'), 'error');
    event.target.value = '';
    return;
  }
  try {
    const importedData = JSON.parse(await file.text());
    const importedConfigs = Array.isArray(importedData) ? importedData : importedData?.proxyConfigs;
    if (!Array.isArray(importedConfigs)) throw new Error('Imported file does not contain proxy configurations');
    const mode = confirm(fetchMessage('confirm_importMode')) ? 'replace' : 'merge';
    const response = await chrome.runtime.sendMessage({ action: 'importConfigs', configs: importedConfigs, mode });
    if (!response?.success) throw new Error(response?.error || 'Failed to import proxy configurations');

    if (!Array.isArray(importedData) && importedData.globalWhitelist != null) {
      const shouldImportWhitelist = mode === 'replace' || confirm(fetchMessage('confirm_importWhitelist'));
      if (shouldImportWhitelist) {
        const rawInput = importedData.globalWhitelistRaw || importedData.globalWhitelist.join('\n');
        const whitelistResponse = await chrome.runtime.sendMessage({ action: 'saveGlobalWhitelist', rawInput });
        if (!whitelistResponse?.success) throw new Error(whitelistResponse?.error || 'Failed to import global whitelist');
      }
    }

    await Promise.all([loadProxyConfigs(), loadGlobalWhitelist()]);
    selectConfig(proxyConfigs.some(config => config.id === activeConfigId) ? activeConfigId : 'direct');
    showStatusMessage(fetchMessage('status_importSuccess'));
  } catch (error) {
    console.error('Failed to import configurations:', error);
    showStatusMessage(`${fetchMessage('status_error')}: ${error.message}`, 'error');
  } finally {
    event.target.value = '';
  }
}

function bindEvents() {
  navItems.forEach(item => item.addEventListener('click', () => activateTab(item.dataset.tab)));
  proxyListEl.addEventListener('click', event => {
    const item = event.target.closest('.proxy-item');
    if (item) requestSelectConfig(item.dataset.id);
  });
  addProxyBtn.addEventListener('click', startNewDraft);
  emptyAddProxyBtn.addEventListener('click', startNewDraft);
  importBtn.addEventListener('click', () => importFileEl.click());
  exportBtn.addEventListener('click', () => exportConfigurations().catch(handleActionError));
  importFileEl.addEventListener('change', importConfigurations);
  autoRefreshToggleEl.addEventListener('change', () => saveAutoRefreshSetting().catch(handleActionError));
  saveGlobalWhitelistBtn.addEventListener('click', () => saveGlobalWhitelist().catch(handleActionError));
  saveProxyBtn.addEventListener('click', () => saveCurrentConfig(false));
  saveAndActivateBtn.addEventListener('click', () => saveCurrentConfig(true));
  testProxyBtn.addEventListener('click', testCurrentProxy);
  saveProxyTestSettingsBtn.addEventListener('click', () => saveProxyTestSettings().catch(handleActionError));
  resetProxyTestSettingsBtn.addEventListener('click', () => resetProxyTestSettings().catch(handleActionError));
  proxyTestUrlEl.addEventListener('input', () => {
    proxyTestUrlEl.setCustomValidity('');
  });
  cancelProxyBtn.addEventListener('click', discardChanges);
  deleteProxyBtn.addEventListener('click', deleteCurrentConfig);
  activateSystemBtn.addEventListener('click', () => activateSelectedSystemConfig().catch(handleActionError));
  httpsHelpLinkEl.addEventListener('click', event => {
    event.preventDefault();
    chrome.tabs.create({ url: 'chrome://settings/certificates' });
  });
  proxyTypeEl.addEventListener('change', () => {
    httpsProxyWarningEl.hidden = proxyTypeEl.value !== 'https';
  });
  togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
  proxyForm.addEventListener('input', () => {
    clearConnectionTestResult();
    updateDirtyState();
  });
  proxyForm.addEventListener('change', () => {
    clearConnectionTestResult();
    updateDirtyState();
  });
  proxyForm.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      discardChanges();
    }
  });
  languageButtons.forEach(button => button.addEventListener('click', handleLanguageButtonClick));
}

function activateTab(tabId) {
  navItems.forEach(item => {
    const active = item.dataset.tab === tabId;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  tabContents.forEach(content => content.classList.toggle('active', content.id === tabId));
  chrome.storage.local.set({ lastActiveTab: tabId });
}

async function restoreLastActiveTab() {
  const data = await chrome.storage.local.get('lastActiveTab');
  activateTab(document.getElementById(data.lastActiveTab || '') ? data.lastActiveTab : 'proxy-settings');
}

function togglePasswordVisibility() {
  const reveal = proxyPasswordEl.type === 'password';
  proxyPasswordEl.type = reveal ? 'text' : 'password';
  togglePasswordBtn.textContent = fetchMessage(reveal ? 'hide_password' : 'show_password');
  togglePasswordBtn.setAttribute('aria-label', fetchMessage(reveal ? 'hide_password' : 'show_password'));
}

function clearConnectionTestResult() {
  connectionTestResult.textContent = '';
  connectionTestResult.className = '';
}

async function initLanguageSettings() {
  const data = await chrome.storage.local.get('userLanguage');
  setActiveLanguageButton(data.userLanguage || 'en');
}

function setActiveLanguageButton(language) {
  languageButtons.forEach(button => {
    const active = button.dataset.lang === language;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

async function handleLanguageButtonClick(event) {
  const selectedLanguage = event.currentTarget.dataset.lang;
  if (isFormDirty()) {
    showStatusMessage(fetchMessage('status_unsavedSelection'), 'error');
    return;
  }
  const data = await chrome.storage.local.get('userLanguage');
  if (data.userLanguage === selectedLanguage) return;
  await window.i18nManager.preloadMessages(selectedLanguage);
  window.i18nManager.setCurrentLanguage(selectedLanguage);
  await chrome.storage.local.set({ userLanguage: selectedLanguage });
  showStatusMessage(fetchMessage('status_languageChanged', selectedLanguage));
  setTimeout(() => window.location.reload(), 700);
}

function handleActionError(error) {
  console.error('Options action failed:', error);
  showStatusMessage(`${fetchMessage('status_error')}: ${error.message}`, 'error');
}

function getStatusMessageElement() {
  let messageEl = document.querySelector('.status-message');
  if (!messageEl) {
    messageEl = document.createElement('div');
    messageEl.className = 'status-message';
    messageEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(messageEl);
  }
  return messageEl;
}

function showStatusMessage(message, type = 'success') {
  const messageEl = getStatusMessageElement();
  messageEl.replaceChildren(document.createTextNode(message));
  messageEl.className = `status-message ${type === 'error' ? 'error' : 'success'}`;
  messageEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
  clearTimeout(statusShowTimer);
  clearTimeout(statusHideTimer);
  statusShowTimer = setTimeout(() => messageEl.classList.add('show'), 10);
  statusHideTimer = setTimeout(() => messageEl.classList.remove('show'), 2600);
}

function showUndoMessage(message, undoAction) {
  const messageEl = getStatusMessageElement();
  const text = document.createElement('span');
  text.textContent = message;
  const undoButton = document.createElement('button');
  undoButton.type = 'button';
  undoButton.className = 'undo-button';
  undoButton.textContent = fetchMessage('btn_undo');
  undoButton.addEventListener('click', async () => {
    undoButton.disabled = true;
    try {
      await undoAction();
    } catch (error) {
      handleActionError(error);
    }
  }, { once: true });
  messageEl.replaceChildren(text, undoButton);
  messageEl.className = 'status-message undo-message';
  messageEl.setAttribute('role', 'status');
  clearTimeout(statusShowTimer);
  clearTimeout(statusHideTimer);
  statusShowTimer = setTimeout(() => messageEl.classList.add('show'), 10);
  statusHideTimer = setTimeout(() => messageEl.classList.remove('show'), 6000);
}
