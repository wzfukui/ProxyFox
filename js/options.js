// DOM 元素引用
const navItems = document.querySelectorAll('.nav-item');
const tabContents = document.querySelectorAll('.tab-content');

// 代理设置元素
const proxyListEl = document.getElementById('proxyList');
const addProxyBtn = document.getElementById('addProxyBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFileEl = document.getElementById('importFile');

// 表单元素
const proxyFormContainer = document.getElementById('proxyFormContainer');
const formTitle = document.getElementById('formTitle');
const proxyForm = document.getElementById('proxyForm');
const proxyNameEl = document.getElementById('proxyName');
const proxyTypeEl = document.getElementById('proxyType');
const proxyHostEl = document.getElementById('proxyHost');
const proxyPortEl = document.getElementById('proxyPort');
const proxyUsernameEl = document.getElementById('proxyUsername');
const proxyPasswordEl = document.getElementById('proxyPassword');
const useGlobalWhitelistEl = document.getElementById('useGlobalWhitelist');
const whitelistEl = document.getElementById('whitelist');
const proxyIdEl = document.getElementById('proxyId');
const saveProxyBtn = document.getElementById('saveProxyBtn');
const deleteProxyBtn = document.getElementById('deleteProxyBtn');
const cancelProxyBtn = document.getElementById('cancelProxyBtn');
const closeFormBtn = document.getElementById('closeFormBtn');
const httpsProxyWarningEl = document.getElementById('httpsProxyWarning');
const httpsHelpLinkEl = document.getElementById('httpsHelpLink');

// 全局白名单元素
const globalWhitelistInputEl = document.getElementById('globalWhitelistInput');
const saveGlobalWhitelistBtn = document.getElementById('saveGlobalWhitelistBtn');

// 语言设置元素
const languageButtons = document.querySelectorAll('.language-btn');

// 状态变量
let proxyConfigs = [];
let activeConfigId = 'direct';
let editMode = false;
let globalWhitelist = [];

// 获取并更新版本号
async function updateVersionNumbers() {
  try {
    // 获取manifest文件中的版本号
    const manifestUrl = chrome.runtime.getURL('manifest.json');
    const response = await fetch(manifestUrl);
    const manifest = await response.json();
    const version = manifest.version;
    
    // 更新所有版本号显示位置
    const sidebarVersionEl = document.getElementById('sidebarVersion');
    const aboutVersionEl = document.getElementById('aboutVersion');
    const currentVersionEl = document.getElementById('currentVersion');
    
    if (sidebarVersionEl) {
      sidebarVersionEl.textContent = `v${version}`;
    }
    if (aboutVersionEl) {
      aboutVersionEl.textContent = `ProxyFox v${version}`;
    }
    if (currentVersionEl) {
      currentVersionEl.textContent = `v${version}`;
    }
    
    console.log(`版本号已更新为: ${version}`);
  } catch (error) {
    console.error('获取版本号失败:', error);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 首先加载国际化文本和语言数据
  await preloadMessages();
  localizeHtml();
  
  // 更新版本号
  await updateVersionNumbers();
  
  await loadProxyConfigs();
  await loadGlobalWhitelist();
  await initLanguageSettings();
  bindEvents();
});

// 加载代理配置列表
async function loadProxyConfigs() {
  try {
    // 从后台脚本获取配置
    const response = await chrome.runtime.sendMessage({
      action: 'getConfigs'
    });
    
    if (response) {
      proxyConfigs = response.configs || [];
      activeConfigId = response.activeConfigId || 'direct';
      renderProxyList();
    }
  } catch (error) {
    console.error('加载代理配置失败:', error);
    showStatusMessage('加载配置失败，请重试', 'error');
  }
}

// 渲染代理配置列表
function renderProxyList() {
  // 清空列表
  proxyListEl.innerHTML = '';
  
  // 获取当前语言
  chrome.storage.local.get('userLanguage', function(data) {
    const currentLang = data.userLanguage || 'zh_CN';
    
    // 添加代理配置项
    proxyConfigs.forEach(config => {
      const proxyItemEl = document.createElement('div');
      proxyItemEl.className = `proxy-item ${config.id === activeConfigId ? 'active' : ''}`;
      proxyItemEl.dataset.id = config.id;
      
      const statusEl = document.createElement('div');
      statusEl.className = `proxy-status ${config.id === activeConfigId ? 'active' : 'inactive'}`;
      
      const nameEl = document.createElement('div');
      nameEl.className = 'proxy-name';
      nameEl.textContent = config.name;
      
      let infoText = '';
      if (config.type === 'direct') {
        infoText = fetchMessage('proxy_mode_direct', currentLang);
      } else if (config.type === 'system') {
        infoText = fetchMessage('proxy_mode_system', currentLang);
      } else {
        infoText = `${config.type.toUpperCase()} ${config.host}:${config.port}`;
      }
      
      const infoEl = document.createElement('div');
      infoEl.className = 'proxy-info';
      infoEl.textContent = infoText;
      
      // 添加操作按钮
      const actionsEl = document.createElement('div');
      actionsEl.className = 'proxy-actions';
      
      if (!config.isSystem) {
        const editBtn = document.createElement('button');
        editBtn.className = 'proxy-action-btn edit-btn';
        editBtn.title = fetchMessage('btn_edit', currentLang) || '编辑';
        editBtn.innerHTML = '✏️';
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditForm(config);
        });
        
        actionsEl.appendChild(editBtn);
      }
      
      proxyItemEl.appendChild(statusEl);
      proxyItemEl.appendChild(nameEl);
      proxyItemEl.appendChild(infoEl);
      proxyItemEl.appendChild(actionsEl);
      
      proxyListEl.appendChild(proxyItemEl);
    });
  });
}

// 加载全局白名单
async function loadGlobalWhitelist() {
  try {
    const data = await chrome.storage.local.get(['globalWhitelist', 'globalWhitelistRaw']);
    globalWhitelist = data.globalWhitelist || [];
    
    // 优先显示原始输入（包含注释），否则显示处理后的规则
    const displayValue = data.globalWhitelistRaw || globalWhitelist.join('\n');
    globalWhitelistInputEl.value = displayValue;
  } catch (error) {
    console.error('加载全局白名单失败:', error);
    showStatusMessage('加载全局白名单失败', 'error');
  }
}

// 解析带注释的白名单输入
function parseWhitelistWithComments(input) {
  if (!input || typeof input !== 'string') return [];
  
  return input.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#')) // 过滤空行和注释行
    .map(line => {
      // 移除行内注释 (例如: *.example.com # CDN servers)
      const commentIndex = line.indexOf('#');
      return commentIndex !== -1 ? line.substring(0, commentIndex).trim() : line;
    })
    .filter(rule => rule.length > 0); // 移除处理后的空行
}

// 保存全局白名单
async function saveGlobalWhitelist() {
  try {
    // 从输入框获取原始输入（保留注释）
    const rawInput = globalWhitelistInputEl.value;
    
    // 解析有效规则（去除注释）
    const rules = parseWhitelistWithComments(rawInput);
    
    // 保存原始输入和处理后的规则
    await chrome.storage.local.set({ 
      globalWhitelist: rules,
      globalWhitelistRaw: rawInput // 保存原始输入以便编辑时显示
    });
    globalWhitelist = rules;
    
    // 重新应用当前激活的代理配置，使新的全局白名单立即生效
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'activateConfig',
        configId: activeConfigId
      });
      
      if (response && response.success) {
        showStatusMessage('全局白名单已保存并应用');
      } else {
        showStatusMessage('全局白名单已保存，但应用配置时出错', 'warning');
      }
    } catch (activateError) {
      console.error('重新应用代理配置失败:', activateError);
      showStatusMessage('全局白名单已保存，但应用配置时出错', 'warning');
    }
  } catch (error) {
    console.error('保存全局白名单失败:', error);
    showStatusMessage('保存全局白名单失败', 'error');
  }
}

// 绑定事件
function bindEvents() {
  // 导航菜单切换
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.tab;
      
      // 切换导航项激活状态
      navItems.forEach(navItem => navItem.classList.remove('active'));
      item.classList.add('active');
      
      // 切换内容区域显示
      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      
      // 保存当前选定的选项卡到存储
      chrome.storage.local.set({ lastActiveTab: tabId });
    });
  });
  
  // 代理项点击事件：激活指定代理配置
  proxyListEl.addEventListener('click', handleProxyItemClick);
  
  // 添加代理按钮
  addProxyBtn.addEventListener('click', handleAddProxy);
  
  // 导入导出按钮
  exportBtn.addEventListener('click', handleExportConfig);
  importBtn.addEventListener('click', () => importFileEl.click());
  importFileEl.addEventListener('change', handleImportConfig);
  
  // 表单按钮事件
  saveProxyBtn.addEventListener('click', handleSaveProxy);
  deleteProxyBtn.addEventListener('click', handleDeleteProxy);
  cancelProxyBtn.addEventListener('click', closeForm);
  closeFormBtn.addEventListener('click', closeForm);
  
  // 监听表单快捷键
  proxyForm.addEventListener('keydown', (e) => {
    // Esc键关闭表单
    if (e.key === 'Escape') {
      if (hasFormChanges()) {
        if (confirm('关闭表单将丢失当前所有输入，确定要关闭吗？')) {
          closeForm();
        }
      } else {
        closeForm();
      }
    }
    
    // Enter键提交表单（如果不在文本域内）
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      handleSaveProxy();
    }
  });

  // 代理类型变更事件
  proxyTypeEl.addEventListener('change', () => {
    // 如果选择了HTTPS代理类型，显示提示
    if (proxyTypeEl.value === 'https') {
      httpsProxyWarningEl.style.display = 'block';
    } else {
      httpsProxyWarningEl.style.display = 'none';
    }
  });
  
  // HTTPS帮助链接点击事件
  httpsHelpLinkEl.addEventListener('click', (e) => {
    e.preventDefault();
    // 打开Chrome证书设置页面
    chrome.tabs.create({ url: 'chrome://settings/certificates' });
  });
  
  // 全局白名单保存按钮
  saveGlobalWhitelistBtn.addEventListener('click', saveGlobalWhitelist);
  
  // 语言按钮点击事件
  languageButtons.forEach(button => {
    button.addEventListener('click', handleLanguageButtonClick);
  });
  
  // 初始化时恢复上次选择的选项卡
  restoreLastActiveTab();
}

// 恢复上次选择的选项卡
async function restoreLastActiveTab() {
  try {
    const data = await chrome.storage.local.get('lastActiveTab');
    const lastActiveTab = data.lastActiveTab || 'proxy-settings';
    
    // 激活上次选择的选项卡
    const tabToActivate = document.querySelector(`.nav-item[data-tab="${lastActiveTab}"]`);
    if (tabToActivate) {
      tabToActivate.click();
    }
  } catch (error) {
    console.error('恢复上次选择的选项卡失败:', error);
  }
}

// 检查表单是否有输入内容
function hasFormChanges() {
  if (proxyNameEl.value.trim() || 
      proxyHostEl.value.trim() || 
      proxyPortEl.value.trim() || 
      whitelistEl.value.trim()) {
    return true;
  }
  return false;
}

// 处理代理项点击（激活配置）
async function handleProxyItemClick(event) {
  // 忽略编辑按钮的点击
  if (event.target.closest('.proxy-action-btn')) {
    return;
  }
  
  // 查找最近的代理项元素
  const proxyItemEl = event.target.closest('.proxy-item');
  if (!proxyItemEl) return;
  
  const configId = proxyItemEl.dataset.id;
  
  try {
    // 获取当前语言
    const data = await chrome.storage.local.get('userLanguage');
    const currentLang = data.userLanguage || 'zh_CN';
    
    // 发送激活配置消息
    const response = await chrome.runtime.sendMessage({
      action: 'activateConfig',
      configId
    });
    
    if (response.success) {
      activeConfigId = configId;
      renderProxyList();
      showStatusMessage(fetchMessage('status_proxySwitched', currentLang));
    } else {
      throw new Error(response.error || fetchMessage('status_activationFailed', currentLang));
    }
  } catch (error) {
    console.error('激活代理配置失败:', error);
    showStatusMessage(fetchMessage('status_activationFailed', currentLang), 'error');
  }
}

// 处理添加代理
function handleAddProxy() {
  openAddForm();
}

// 打开添加代理表单
function openAddForm() {
  // 获取当前语言
  chrome.storage.local.get('userLanguage', function(data) {
    const currentLang = data.userLanguage || 'zh_CN';
    
    formTitle.textContent = fetchMessage('form_title_add', currentLang);
    proxyForm.reset();
    proxyIdEl.value = '';
    deleteProxyBtn.style.display = 'none';
    editMode = false;
    proxyFormContainer.classList.add('active');
    // 设置默认值
    proxyTypeEl.value = 'http';
    proxyPortEl.value = '8080';
    useGlobalWhitelistEl.checked = true; // 默认选中使用全局白名单
    
    // 隐藏HTTPS提示（因为默认是HTTP）
    httpsProxyWarningEl.style.display = 'none';
    
    // 聚焦到第一个输入框
    setTimeout(() => proxyNameEl.focus(), 0);
  });
}

// 打开编辑代理表单
function openEditForm(config) {
  // 获取当前语言
  chrome.storage.local.get('userLanguage', function(data) {
    const currentLang = data.userLanguage || 'zh_CN';
    
    formTitle.textContent = fetchMessage('form_title_edit', currentLang);
    proxyNameEl.value = config.name;
    proxyTypeEl.value = config.type;
    proxyHostEl.value = config.host || '';
    proxyPortEl.value = config.port || '';
    proxyUsernameEl.value = config.username || '';
    proxyPasswordEl.value = config.password || '';
    // 设置使用全局白名单状态，如果没有该属性则默认选中
    useGlobalWhitelistEl.checked = config.useGlobalWhitelist !== false;
    whitelistEl.value = (config.whitelist || []).join('\n');
    proxyIdEl.value = config.id;
    deleteProxyBtn.style.display = 'block';
    editMode = true;
    proxyFormContainer.classList.add('active');
    
    // 根据代理类型显示或隐藏HTTPS提示
    httpsProxyWarningEl.style.display = config.type === 'https' ? 'block' : 'none';
    
    // 聚焦到第一个输入框
    setTimeout(() => proxyNameEl.focus(), 0);
  });
}

// 关闭表单
function closeForm() {
  proxyFormContainer.classList.remove('active');
  proxyForm.reset();
}

// 处理保存代理配置
async function handleSaveProxy() {
  // 表单验证
  if (!proxyForm.checkValidity()) {
    proxyForm.reportValidity();
    return;
  }
  
  // 收集表单数据
  const configData = {
    name: proxyNameEl.value.trim(),
    type: proxyTypeEl.value,
    host: proxyHostEl.value.trim(),
    port: parseInt(proxyPortEl.value, 10) || 0,
    username: proxyUsernameEl.value.trim(),
    password: proxyPasswordEl.value.trim(),
    useGlobalWhitelist: useGlobalWhitelistEl.checked,
    whitelist: parseWhitelistWithComments(whitelistEl.value)
  };
  
  // 检查是否为编辑模式
  if (editMode) {
    configData.id = proxyIdEl.value;
  }
  
  try {
    // 发送保存配置消息
    const response = await chrome.runtime.sendMessage({
      action: 'saveConfig',
      config: configData
    });
    
    if (response.success) {
      closeForm();
      await loadProxyConfigs();
      showStatusMessage(editMode ? '配置已更新' : '配置已添加');
    } else {
      throw new Error(response.error || '保存配置失败');
    }
  } catch (error) {
    console.error('保存代理配置失败:', error);
    showStatusMessage('保存配置失败: ' + error.message, 'error');
  }
}

// 处理删除代理配置
async function handleDeleteProxy() {
  const configId = proxyIdEl.value;
  
  // 确认删除
  if (!confirm('确定要删除此代理配置吗？')) {
    return;
  }
  
  try {
    // 发送删除配置消息
    const response = await chrome.runtime.sendMessage({
      action: 'deleteConfig',
      configId
    });
    
    if (response.success) {
      closeForm();
      await loadProxyConfigs();
      showStatusMessage('配置已删除');
    } else {
      throw new Error(response.error || '删除配置失败');
    }
  } catch (error) {
    console.error('删除代理配置失败:', error);
    showStatusMessage('删除配置失败: ' + error.message, 'error');
  }
}

// 处理导出配置
async function handleExportConfig() {
  try {
    // 获取全局设置
    const data = await chrome.storage.local.get(['globalWhitelist', 'globalWhitelistRaw', 'activeConfigId']);
    
    // 创建完整导出数据，包括代理配置、全局白名单和当前激活的配置ID
    const exportData = JSON.stringify({
      proxyConfigs: proxyConfigs,
      globalWhitelist: data.globalWhitelist || [],
      globalWhitelistRaw: data.globalWhitelistRaw || '', // 导出原始输入（包含注释）
      activeConfigId: data.activeConfigId || 'direct'
    }, null, 2);
    
    // 创建下载链接
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'proxyfox-config.json';
    a.click();
    
    // 清理 URL 对象
    setTimeout(() => URL.revokeObjectURL(url), 0);
    
    showStatusMessage('配置已导出');
  } catch (error) {
    console.error('导出配置失败:', error);
    showStatusMessage('导出配置失败', 'error');
  }
}

// 处理导入配置
async function handleImportConfig(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    // 读取文件内容
    const fileContent = await readFileAsText(file);
    const importedData = JSON.parse(fileContent);
    
    // 检查导入的数据格式
    let importedConfigs;
    let importedWhitelist;
    let importedWhitelistRaw;
    let importedActiveId;
    
    if (Array.isArray(importedData)) {
      // 兼容旧版格式，只有代理配置数组
      importedConfigs = importedData;
      importedWhitelist = null;
      importedWhitelistRaw = null;
      importedActiveId = null;
    } else if (importedData && typeof importedData === 'object') {
      // 新版格式，包含代理配置、全局白名单和激活ID
      importedConfigs = importedData.proxyConfigs || [];
      importedWhitelist = importedData.globalWhitelist || null;
      importedWhitelistRaw = importedData.globalWhitelistRaw || null;
      importedActiveId = importedData.activeConfigId || null;
    } else {
      throw new Error('导入的数据格式无效');
    }
    
    // 询问导入模式
    const importMode = confirm('是否替换现有配置？\n点击"确定"替换，点击"取消"合并。') 
      ? 'replace' 
      : 'merge';
    
    // 发送导入代理配置消息
    const response = await chrome.runtime.sendMessage({
      action: 'importConfigs',
      configs: importedConfigs,
      mode: importMode
    });
    
    if (!response.success) {
      throw new Error(response.error || '导入代理配置失败');
    }
    
    // 如果有全局白名单数据，则导入
    if (importedWhitelist) {
      // 如果是替换模式或者用户确认，则导入全局白名单
      const importWhitelist = importMode === 'replace' || 
        confirm('是否替换全局白名单？\n点击"确定"替换，点击"取消"保留当前设置。');
      
      if (importWhitelist) {
        await chrome.storage.local.set({ 
          globalWhitelist: importedWhitelist,
          globalWhitelistRaw: importedWhitelistRaw || importedWhitelist.join('\n')
        });
        globalWhitelist = importedWhitelist;
        // 优先显示原始输入（包含注释），否则显示处理后的规则
        globalWhitelistInputEl.value = importedWhitelistRaw || importedWhitelist.join('\n');
      }
    }
    
    // 如果有激活ID且在导入的配置中存在，则设置为当前激活配置
    if (importedActiveId && importMode === 'replace') {
      // 获取导入后的配置
      const currentConfigs = await getProxyConfigs();
      // 检查激活ID是否在导入的配置中
      if (currentConfigs.some(c => c.id === importedActiveId)) {
        await chrome.runtime.sendMessage({
          action: 'activateConfig',
          configId: importedActiveId
        });
      }
    }
    
    // 重新加载配置
    await loadProxyConfigs();
    await loadGlobalWhitelist();
    
    showStatusMessage('配置已导入');
  } catch (error) {
    console.error('导入配置失败:', error);
    showStatusMessage('导入配置失败: ' + error.message, 'error');
  }
  
  // 重置文件输入，允许重新选择同一文件
  event.target.value = '';
}

// 辅助函数：获取代理配置
async function getProxyConfigs() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getConfigs'
    });
    
    if (response) {
      return response.configs || [];
    }
    return [];
  } catch (error) {
    console.error('获取代理配置失败:', error);
    return [];
  }
}

// 辅助函数：读取文件内容
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = error => reject(error);
    reader.readAsText(file);
  });
}

// 显示状态消息
function showStatusMessage(message, type = 'success') {
  // 检查是否已有消息元素
  let messageEl = document.querySelector('.status-message');
  
  if (!messageEl) {
    // 创建消息元素
    messageEl = document.createElement('div');
    messageEl.className = 'status-message';
    document.body.appendChild(messageEl);
  }
  
  // 设置消息内容和样式
  messageEl.textContent = message;
  messageEl.className = `status-message ${type === 'error' ? 'error' : 'success'}`;
  
  // 显示消息
  setTimeout(() => {
    messageEl.classList.add('show');
  }, 10);
  
  // 2秒后隐藏
  setTimeout(() => {
    messageEl.classList.remove('show');
  }, 2000);
}

// 初始化语言设置
async function initLanguageSettings() {
  try {
    // 获取用户当前选择的语言
    const data = await chrome.storage.local.get('userLanguage');
    const currentLang = data.userLanguage || 'zh_CN';
    
    // 设置活动语言按钮
    setActiveLanguageButton(currentLang);
  } catch (error) {
    console.error('初始化语言设置失败:', error);
  }
}

// 设置活动语言按钮
function setActiveLanguageButton(langCode) {
  // 移除所有按钮的active类
  languageButtons.forEach(button => {
    button.classList.remove('active');
    // 如果这个按钮是当前语言，添加active类
    if (button.dataset.lang === langCode) {
      button.classList.add('active');
    }
  });
}

// 处理语言按钮点击
async function handleLanguageButtonClick(event) {
  const selectedLanguage = event.currentTarget.dataset.lang;
  
  // 如果点击的就是当前语言，不做任何处理
  const data = await chrome.storage.local.get('userLanguage');
  if (data.userLanguage === selectedLanguage) {
    return;
  }
  
  try {
    // 更新活动按钮状态
    setActiveLanguageButton(selectedLanguage);
    
    // 保存用户语言设置
    await chrome.storage.local.set({ userLanguage: selectedLanguage });
    
    // 更新存储中系统配置的名称
    const configs = await getProxyConfigs();
    let needsUpdate = false;
    
    configs.forEach(config => {
      if (config.id === 'direct') {
        config.name = fetchMessage('proxy_direct', selectedLanguage);
        needsUpdate = true;
      } else if (config.id === 'system') {
        config.name = fetchMessage('proxy_system', selectedLanguage);
        needsUpdate = true;
      }
    });
    
    if (needsUpdate) {
      await chrome.storage.local.set({ proxyConfigs: configs });
    }
    
    // 立即重新加载国际化文本
    localizeHtml();
    
    // 显示成功消息
    showStatusMessage(fetchMessage('status_languageChanged', selectedLanguage) || '语言已更改，刷新页面以完全应用新语言');
    
    // 延迟1秒后刷新页面，以确保消息能被看到
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } catch (error) {
    console.error('切换语言失败:', error);
    showStatusMessage(fetchMessage('status_languageChangeFailed', selectedLanguage) || '切换语言失败', 'error');
  }
}

// 处理页面上的国际化文本
function localizeHtml() {
  try {
    // 获取当前语言
    chrome.storage.local.get('userLanguage', function(data) {
      const currentLang = data.userLanguage || 'zh_CN';
      // 将当前语言保存到window对象，方便其他函数使用
      window.currentLang = currentLang;
      
      const elements = document.querySelectorAll('*');
      
      // 处理页面元素
      elements.forEach(el => {
        // 处理元素的内部文本和属性
        if (el.childNodes && el.childNodes.length > 0) {
          for (let i = 0; i < el.childNodes.length; i++) {
            const node = el.childNodes[i];
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.includes('__MSG_')) {
              try {
                const text = node.nodeValue;
                const matches = text.match(/__MSG_([a-zA-Z0-9_]+)__/g);
                if (matches) {
                  let newText = text;
                  matches.forEach(match => {
                    const messageName = match.slice(6, -2); // 去掉 __MSG_ 和 __ 部分
                    const translated = fetchMessage(messageName, currentLang);
                    if (translated) {
                      newText = newText.replace(match, translated);
                    }
                  });
                  node.nodeValue = newText;
                }
              } catch (nodeError) {
                console.error('处理节点文本时出错:', nodeError);
              }
            }
          }
        }
        
        // 检查元素的title属性
        if (el.hasAttribute('title')) {
          const title = el.getAttribute('title');
          if (title && title.includes('__MSG_')) {
            try {
              const matches = title.match(/__MSG_([a-zA-Z0-9_]+)__/g);
              if (matches) {
                let newTitle = title;
                matches.forEach(match => {
                  const messageName = match.slice(6, -2);
                  const translated = fetchMessage(messageName, currentLang);
                  if (translated) {
                    newTitle = newTitle.replace(match, translated);
                  }
                });
                el.setAttribute('title', newTitle);
              }
            } catch (titleError) {
              console.error('处理title属性时出错:', titleError);
            }
          }
        }
        
        // 检查按钮的value属性
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' && el.type === 'button') {
          const value = el.value || el.textContent;
          if (value && value.includes('__MSG_')) {
            try {
              const matches = value.match(/__MSG_([a-zA-Z0-9_]+)__/g);
              if (matches) {
                let newValue = value;
                matches.forEach(match => {
                  const messageName = match.slice(6, -2);
                  const translated = fetchMessage(messageName, currentLang);
                  if (translated) {
                    newValue = newValue.replace(match, translated);
                  }
                });
                
                if (el.hasAttribute('value')) {
                  el.value = newValue;
                } else {
                  el.textContent = newValue;
                }
              }
            } catch (btnError) {
              console.error('处理按钮文本时出错:', btnError);
            }
          }
        }
        
        // 检查输入框的placeholder属性
        if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.hasAttribute('placeholder')) {
          const placeholder = el.getAttribute('placeholder');
          if (placeholder && placeholder.includes('__MSG_')) {
            try {
              const matches = placeholder.match(/__MSG_([a-zA-Z0-9_]+)__/g);
              if (matches) {
                let newPlaceholder = placeholder;
                matches.forEach(match => {
                  const messageName = match.slice(6, -2);
                  const translated = fetchMessage(messageName, currentLang);
                  if (translated) {
                    newPlaceholder = newPlaceholder.replace(match, translated);
                  }
                });
                el.setAttribute('placeholder', newPlaceholder);
              }
            } catch (placeholderError) {
              console.error('处理placeholder属性时出错:', placeholderError);
            }
          }
        }
      });
    });
  } catch (error) {
    console.error('处理国际化文本时出错:', error);
  }
}

// 获取国际化消息的函数，优先使用缓存的语言文件
function fetchMessage(messageName, language) {
  // 优先从缓存获取指定语言的消息
  const cachedMessages = window.cachedMessages || {};
  if (cachedMessages[language] && cachedMessages[language][messageName]) {
    const cachedMessage = cachedMessages[language][messageName].message;
    return cachedMessage;
  }
  
  // 如果缓存中没有找到，尝试使用chrome.i18n.getMessage
  const message = chrome.i18n.getMessage(messageName);
  if (message && message.trim() !== '') {
    // 如果指定了语言且不是浏览器语言，再次尝试从缓存获取其他语言的备选项
    if (language) {
      // 尝试在其他语言中寻找
      const fallbackLangs = ['zh_CN', 'en'];
      for (const fallbackLang of fallbackLangs) {
        if (fallbackLang !== language && 
            cachedMessages[fallbackLang] && 
            cachedMessages[fallbackLang][messageName]) {
          const fallbackMessage = cachedMessages[fallbackLang][messageName].message;
          return fallbackMessage;
        }
      }
    }
    
    return message; // 如果没有找到指定语言的消息，最后才返回chrome.i18n的消息
  }
  
  // 尝试在其他语言中寻找
  const fallbackLangs = ['zh_CN', 'en'];
  for (const fallbackLang of fallbackLangs) {
    if (fallbackLang !== language && 
        cachedMessages[fallbackLang] && 
        cachedMessages[fallbackLang][messageName]) {
      const fallbackMessage = cachedMessages[fallbackLang][messageName].message;
      return fallbackMessage;
    }
  }
  
  console.error(`无法获取 [${messageName}] 的任何翻译`);
  return messageName; // 如果无法获取翻译，返回消息名称
}

// 预加载所有语言数据
async function preloadMessages() {
  window.cachedMessages = {};
  
  // 支持的语言列表
  const languages = ['zh_CN', 'zh_TW', 'en', 'ja', 'ko'];
  
  try {
    // 直接加载语言文件的路径
    const basePath = chrome.runtime.getURL('_locales/');
    
    // 为每种语言加载消息
    for (const lang of languages) {
      try {
        const url = `${basePath}${lang}/messages.json`;
        
        const response = await fetch(url);
        if (response.ok) {
          const text = await response.text();
          
          try {
            // 移除JSON中的注释（// 和 /* */ 格式）
            const cleanedText = text
              .replace(/\/\/.*?$/gm, '') // 移除单行注释
              .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
              .trim();
            
            const messages = JSON.parse(cleanedText);
            window.cachedMessages[lang] = messages;
          } catch (parseError) {
            console.error(`解析 ${lang} 语言数据JSON失败:`, parseError);
          }
        } else {
          console.error(`无法加载 ${lang} 语言数据: ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        console.error(`加载 ${lang} 语言数据时出错:`, err);
      }
    }
  } catch (error) {
    console.error('预加载语言数据失败:', error);
  }
} 