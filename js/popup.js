// DOM 元素引用
const proxyListEl = document.getElementById('proxyList');
const currentProxyEl = document.getElementById('currentProxy');
const popupTitleEl = document.getElementById('popupTitle');
const settingsBtn = document.getElementById('settingsBtn');
const openSettingsBtn = document.getElementById('openSettingsBtn');

// 状态变量
let proxyConfigs = [];
let activeConfigId = 'direct';
let userSettings = {};

// 使用共享的i18n模块（已优化性能）
async function preloadMessages() {
  await window.i18nManager.preloadMessages();
  refreshTranslations();
}

// 刷新翻译（优化版本）
function refreshTranslations() {
  chrome.storage.local.get('userLanguage', function(data) {
    const currentLang = data.userLanguage || 'zh_CN';
    window.i18nManager.setCurrentLanguage(currentLang);
    
    // 使用优化的批量更新
    localizeHtml();
    window.i18nManager.refreshInterfaceText(currentLang);
  });
}

// 获取国际化消息的函数（使用共享模块）
function fetchMessage(messageName, language) {
  return window.i18nManager.fetchMessage(messageName, language);
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 首先预加载语言数据
  await preloadMessages();
  
  // 然后加载用户设置和国际化文本
  await loadUserSettings();
  localizeHtml();
  
  await loadProxyConfigs();
  bindEvents();
});

// 替换HTML中的国际化文本
function localizeHtml() {
  try {
    // 获取当前用户语言设置
    chrome.storage.local.get('userLanguage', function(data) {
      const currentLang = data.userLanguage || 'zh_CN';
      window.currentLang = currentLang;
      
      // 替换页面标题
      document.title = fetchMessage('extName', currentLang);
      
      // 替换popup标题
      if (!userSettings.popupTitle) {
        popupTitleEl.textContent = fetchMessage('extName', currentLang);
      }
      
      // 替换设置按钮标题
      settingsBtn.title = fetchMessage('btn_settings', currentLang);
      
      // 替换当前代理标签
      const currentProxyLabel = document.querySelector('.current-proxy .label');
      if (currentProxyLabel) {
        currentProxyLabel.textContent = fetchMessage('current_proxy', currentLang) + ':';
      }
      
      // 替换加载文本
      const loadingText = document.querySelector('.loading');
      if (loadingText) {
        loadingText.textContent = fetchMessage('loading', currentLang) + '...';
      }
      
      // 替换打开设置按钮文本
      openSettingsBtn.textContent = fetchMessage('btn_manageProxySettings', currentLang);
      
      // 查找所有带有i18n占位符的标签元素
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        // 检查元素本身的文本内容
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
      });
      
      // 可能需要更新已经渲染的代理列表
      if (proxyConfigs.length > 0) {
        renderProxyList(proxyConfigs, activeConfigId);
      }
    });
  } catch (error) {
    console.error('处理国际化文本时出错:', error);
  }
}

// 加载用户设置
async function loadUserSettings() {
  try {
    // 从存储中获取用户设置
    const data = await chrome.storage.local.get('userSettings');
    
    if (data.userSettings) {
      userSettings = data.userSettings;
      
      // 应用设置到界面
      if (userSettings.popupTitle) {
        popupTitleEl.textContent = userSettings.popupTitle;
      }
      
      // 应用主题
      if (userSettings.theme) {
        applyTheme(userSettings.theme);
      }
    }
  } catch (error) {
    console.error('加载用户设置失败:', error);
  }
}

// 应用主题
function applyTheme(theme) {
  const themes = {
    orange: {
      primary: '#ff6600',
      hover: '#e55c00'
    },
    blue: {
      primary: '#1890ff',
      hover: '#096dd9'
    },
    green: {
      primary: '#52c41a',
      hover: '#389e0d'
    },
    purple: {
      primary: '#722ed1',
      hover: '#531dab'
    }
  };
  
  if (themes[theme]) {
    document.documentElement.style.setProperty('--primary-color', themes[theme].primary);
    document.documentElement.style.setProperty('--primary-hover', themes[theme].hover);
  }
}

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
      
      renderProxyList(proxyConfigs, activeConfigId);
      updateCurrentProxy();
    }
  } catch (error) {
    console.error('加载代理配置失败:', error);
    showStatusMessage('加载配置失败，请重试', 'error');
  }
}

// 渲染代理列表（优化版本）
function renderProxyList(configs, activeConfigId) {
  // 获取当前用户语言
  chrome.storage.local.get('userLanguage', function(data) {
    const currentLang = data.userLanguage || 'zh_CN';
    
    // 使用DocumentFragment优化DOM操作
    const fragment = document.createDocumentFragment();
    
    // 添加直连模式
    const directItem = createProxyItem({
      id: 'direct',
      name: fetchMessage('proxy_direct', currentLang),
      type: 'direct'
    }, activeConfigId === 'direct', currentLang);
    fragment.appendChild(directItem);
    
    // 添加系统代理
    const systemItem = createProxyItem({
      id: 'system',
      name: fetchMessage('proxy_system', currentLang),
      type: 'system'
    }, activeConfigId === 'system', currentLang);
    fragment.appendChild(systemItem);
    
    // 添加自定义代理
    configs.filter(c => !c.isSystem).forEach(config => {
      const item = createProxyItem(config, activeConfigId === config.id, currentLang);
      fragment.appendChild(item);
    });
    
    // 一次性更新DOM，减少重绘
    proxyListEl.textContent = ''; // 比innerHTML更快
    proxyListEl.appendChild(fragment);
  });
}

// 创建代理项目
function createProxyItem(config, isActive, language) {
  const item = document.createElement('div');
  item.className = `proxy-item${isActive ? ' active' : ''}`;
  item.dataset.id = config.id;
  
  const status = document.createElement('div');
  status.className = `proxy-status${isActive ? ' active' : ' inactive'}`;
  
  const name = document.createElement('div');
  name.className = 'proxy-name';
  name.textContent = config.name;
  
  const info = document.createElement('div');
  info.className = 'proxy-info';
  
  if (config.type === 'direct') {
    info.textContent = fetchMessage('proxy_mode_direct', language);
  } else if (config.type === 'system') {
    info.textContent = fetchMessage('proxy_mode_system', language);
  } else {
    info.textContent = `${config.type.toUpperCase()} ${config.host}:${config.port}`;
  }
  
  item.appendChild(status);
  item.appendChild(name);
  item.appendChild(info);
  
  return item;
}

// 更新当前代理显示
function updateCurrentProxy() {
  const activeConfig = proxyConfigs.find(c => c.id === activeConfigId);
  
  if (activeConfig) {
    currentProxyEl.textContent = activeConfig.name;
  } else {
    currentProxyEl.textContent = '未知';
  }
}

// 绑定事件
function bindEvents() {
  // 代理项点击事件：激活指定代理配置
  proxyListEl.addEventListener('click', handleProxyItemClick);
  
  // 设置按钮
  settingsBtn.addEventListener('click', openOptionsPage);
  openSettingsBtn.addEventListener('click', openOptionsPage);
}

// 处理代理项点击（激活配置）
async function handleProxyItemClick(event) {
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
      renderProxyList(proxyConfigs, activeConfigId);
      updateCurrentProxy();
      showStatusMessage(fetchMessage('status_proxySwitched', currentLang));
    } else {
      throw new Error(response.error || fetchMessage('status_activationFailed', currentLang));
    }
  } catch (error) {
    console.error('激活代理配置失败:', error);
    
    // 获取当前语言
    const data = await chrome.storage.local.get('userLanguage');
    const currentLang = data.userLanguage || 'zh_CN';
    
    showStatusMessage(fetchMessage('status_activationFailed', currentLang), 'error');
  }
}

// 打开选项页面
function openOptionsPage() {
  chrome.runtime.openOptionsPage();
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
  
  // 使用优化的定时器（如果可用）
  const useOptimizedTimer = typeof window.timerManager !== 'undefined';
  
  // 显示消息
  const showTimer = useOptimizedTimer ? 
    window.timerManager.setTimeout(() => messageEl.classList.add('show'), 10) :
    setTimeout(() => messageEl.classList.add('show'), 10);
  
  // 2秒后隐藏
  const hideTimer = useOptimizedTimer ?
    window.timerManager.setTimeout(() => messageEl.classList.remove('show'), 2000) :
    setTimeout(() => messageEl.classList.remove('show'), 2000);
} 