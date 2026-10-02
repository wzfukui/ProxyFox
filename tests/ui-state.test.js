const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise the async page controller without adding a DOM/runtime dependency.
function createOptionsHarness() {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: false, hidden: false, disabled: false, textContent: '', dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {}, addEventListener() {}, focus() {}, reset() {}, click() {},
      querySelectorAll: () => [], querySelector: () => null, checkValidity: () => true
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    document: { getElementById: element, createElement: element, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {}, ProxyFoxConfig: require('../js/utils/config.js'),
      i18nManager: { fetchMessage: key => key } },
    chrome: { storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } }, runtime: {} },
    console, URL, Blob, confirm: () => true, setTimeout, clearTimeout
  });
  const run = source => vm.runInContext(source, context);
  run(fs.readFileSync(path.join(__dirname, '../js/options.js'), 'utf8'));
  run(`
    renderProxyList = () => {};
    updateActiveSummary = () => {};
    showStatusMessage = () => {};
    proxyConfigs = [
      { id: 'a', name: 'A', type: 'http', host: 'a.example.com', port: 8080, whitelist: [] },
      { id: 'b', name: 'B', type: 'http', host: 'b.example.com', port: 8080, whitelist: [] }
    ];
    selectConfig('a');
  `);
  return { context, run, element };
}

test('refresh preserves edits entered while the background request is pending', async () => {
  const h = createOptionsHarness();
  let respond;
  h.context.chrome.runtime.sendMessage = () => new Promise(resolve => { respond = resolve; });
  const refreshing = h.run('refreshProxyState()');
  h.element('proxyName').value = 'Unsent edit';
  respond({ configs: h.run('proxyConfigs'), activeConfigId: 'a' });
  await refreshing;
  assert.equal(h.element('proxyName').value, 'Unsent edit');
  assert.equal(h.run('isFormDirty()'), true);
});

test('refresh preserves a new draft even before its first edit', async () => {
  const h = createOptionsHarness();
  h.run('startNewDraft()');
  h.context.chrome.runtime.sendMessage = async () => ({ configs: h.run('proxyConfigs'), activeConfigId: 'a' });
  await h.run('refreshProxyState()');
  assert.equal(h.run('isNewDraft'), true);
  assert.equal(h.run('selectedConfigId'), '__draft__');
});

test('a delayed refresh does not undo a newer selection', async () => {
  const h = createOptionsHarness();
  let respond;
  h.context.chrome.runtime.sendMessage = () => new Promise(resolve => { respond = resolve; });
  const refreshing = h.run('refreshProxyState()');
  h.run("selectConfig('b')");
  respond({ configs: h.run('proxyConfigs'), activeConfigId: 'a' });
  await refreshing;
  assert.equal(h.run('selectedConfigId'), 'b');
});

test('busy operations block switching, draft creation, discard and duplicate saves', async () => {
  const h = createOptionsHarness();
  let sends = 0;
  h.context.chrome.runtime.sendMessage = async () => { sends++; return { success: false }; };
  h.run("setFormBusy(true); requestSelectConfig('b'); startNewDraft(); discardChanges(); updateDirtyState()");
  await h.run('saveCurrentConfig(true)');
  assert.equal(sends, 0);
  assert.equal(h.run('selectedConfigId'), 'a');
  assert.equal(h.element('saveAndActivateBtn').disabled, true);
  assert.equal(h.element('addProxyBtn').disabled, true);
});

test('state-only refresh keeps a completed connection test visible', async () => {
  const h = createOptionsHarness();
  h.element('connectionTestResult').textContent = 'Network 12 ms';
  h.context.chrome.runtime.sendMessage = async () => ({ configs: h.run('proxyConfigs'), activeConfigId: 'b' });
  await h.run('refreshProxyState()');
  assert.equal(h.element('connectionTestResult').textContent, 'Network 12 ms');
});

test('whitelist parsing failures become form errors, not unhandled rejections', () => {
  const h = createOptionsHarness();
  h.element('whitelist').value = Array.from({ length: 10001 }, (_, i) => `h${i}.example.com`).join('\n');
  assert.equal(h.run('collectValidatedFormConfig()'), null);
});

test('older config responses cannot overwrite a newer response', async () => {
  const h = createOptionsHarness();
  const responders = [];
  h.context.chrome.runtime.sendMessage = () => new Promise(resolve => responders.push(resolve));
  const first = h.run('loadProxyConfigs()');
  const second = h.run('loadProxyConfigs()');
  responders[1]({ configs: h.run('proxyConfigs'), activeConfigId: 'b' });
  await second;
  responders[0]({ configs: h.run('proxyConfigs'), activeConfigId: 'a' });
  await first;
  assert.equal(h.run('activeConfigId'), 'b');
});

test('saving before creating another draft honors the pending selection', async () => {
  const h = createOptionsHarness();
  h.element('proxyName').value = 'Edited';
  h.run('startNewDraft()');
  h.context.chrome.runtime.sendMessage = async message => message.action === 'saveConfig'
    ? { success: true, config: { id: 'a' } }
    : { configs: h.run('proxyConfigs'), activeConfigId: 'b' };
  await h.run('saveCurrentConfig(false)');
  assert.equal(h.run('isNewDraft'), true);
  assert.equal(h.run('selectedConfigId'), '__draft__');
});

test('legacy exports with an empty raw field retain parsed whitelist rules on import', async () => {
  const h = createOptionsHarness();
  let bundle;
  h.context.chrome.runtime.sendMessage = async message => {
    if (message.action === 'importBundle') { bundle = message; return { success: true }; }
    return { configs: h.run('proxyConfigs'), activeConfigId: 'a' };
  };
  h.context.importEvent = { target: { value: 'file.json', files: [{ text: async () => JSON.stringify({
    proxyConfigs: [], globalWhitelist: ['internal.example.com'], globalWhitelistRaw: ''
  }) }] } };
  await h.run('importConfigurations(importEvent)');
  assert.equal(bundle.globalWhitelistRaw, 'internal.example.com');
  assert.equal(h.run('formBusy'), false);
});

test('unsaved global whitelist changes prevent an import from overwriting the editor', async () => {
  const h = createOptionsHarness();
  h.element('globalWhitelistInput').value = 'unsaved.example.com';
  let fileRead = false;
  h.context.importEvent = { target: { value: 'file.json', files: [{ text: async () => { fileRead = true; } }] } };
  await h.run('importConfigurations(importEvent)');
  assert.equal(h.run('hasUnsavedChanges()'), true);
  assert.equal(fileRead, false);
});

function createPopupHarness() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, disabled: false, textContent: '',
      setAttribute(key, value) { this[key] = value; }, replaceChildren() {},
      querySelectorAll: () => [], addEventListener() {}
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: { getElementById: element, addEventListener() {} },
    window: { i18nManager: { fetchMessage: key => key } },
    chrome: { runtime: {}, storage: { onChanged: { addListener() {} } } },
    performance: { mark() {} }, console, setTimeout, clearTimeout
  });
  const run = source => vm.runInContext(source, context);
  run(fs.readFileSync(path.join(__dirname, '../js/popup.js'), 'utf8'));
  run('renderProxyList = () => {}; updateCurrentProxy = () => {};');
  return { context, run, element };
}

test('popup exposes retry and exits loading state after a failed request', async () => {
  const h = createPopupHarness();
  h.context.chrome.runtime.sendMessage = async () => { throw new Error('Background unavailable'); };
  await assert.rejects(h.run('loadProxyConfigs()'), /Background unavailable/);
  assert.equal(h.element('proxyList')['aria-busy'], 'false');
  assert.equal(h.element('retryLoadBtn').hidden, false);
  assert.equal(h.element('retryLoadBtn').disabled, false);
  h.context.chrome.runtime.sendMessage = async () => ({ configs: [], activeConfigId: 'system' });
  await h.run('loadProxyConfigs()');
  assert.equal(h.run('activeConfigId'), 'system');
  assert.equal(h.element('retryLoadBtn').hidden, true);
});

test('popup ignores an old refresh that resolves during a proxy switch', async () => {
  const h = createPopupHarness();
  let respond;
  h.context.chrome.runtime.sendMessage = () => new Promise(resolve => { respond = resolve; });
  const refreshing = h.run('loadProxyConfigs()');
  h.run("switchingConfigId = 'b'; activeConfigId = 'b'");
  respond({ configs: [], activeConfigId: 'a' });
  await refreshing;
  assert.equal(h.run('activeConfigId'), 'b');
});
