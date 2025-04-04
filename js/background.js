// 默认配置
let DEFAULT_CONFIGS = [
  {
    id: 'direct',
    name: '__MSG_proxy_direct__',  // 使用国际化消息键
    type: 'direct',
    host: '',
    port: 0,
    whitelist: [],
    isSystem: true
  },
  {
    id: 'system',
    name: '__MSG_proxy_system__',  // 使用国际化消息键
    type: 'system',
    host: '',
    port: 0,
    whitelist: [],
    isSystem: true
  }
];

// 记录当前激活的配置ID
let activeConfigId = 'direct';
// 添加一个标志，表示代理是否是手动切换的
let manuallyChanged = false;

// 记录上一次使用的代理配置信息
let lastProxyConfig = {
  id: 'direct',
  name: '直连模式',
  type: 'direct'
};

// 初始化完成标志
let isInitialized = false;

// 获取国际化消息的函数
function getMessage(messageName) {
  const message = chrome.i18n.getMessage(messageName);
  return message || messageName;
}

// 更新扩展图标
function updateExtensionIcon(isProxyActive) {
  const iconPath = isProxyActive ? {
    16: chrome.runtime.getURL("images/proxyfox-working-logo-16.png"),
    48: chrome.runtime.getURL("images/proxyfox-working-logo-48.png"),
    128: chrome.runtime.getURL("images/proxyfox-working-logo-128.png")
  } : {
    16: chrome.runtime.getURL("images/proxyfox-logo-16.png"),
    48: chrome.runtime.getURL("images/proxyfox-logo-48.png"),
    128: chrome.runtime.getURL("images/proxyfox-logo-128.png")
  };
  
  // 添加回调函数处理可能的错误
  chrome.action.setIcon(
    { path: iconPath },
    () => {
      if (chrome.runtime.lastError) {
        console.error('设置图标出错:', chrome.runtime.lastError);
      } else {
        console.log(`已更新扩展图标为${isProxyActive ? '工作' : '默认'}状态`);
      }
    }
  );
}

// 在初始化时，将消息键替换为实际翻译
function initializeDefaultConfigs() {
  DEFAULT_CONFIGS = DEFAULT_CONFIGS.map(config => {
    // 检查name属性是否为消息键格式
    if (config.name && config.name.startsWith('__MSG_') && config.name.endsWith('__')) {
      const messageName = config.name.slice(6, -2);  // 移除 __MSG_ 和 __
      config.name = getMessage(messageName);
    }
    return config;
  });
}

// 从Chrome存储中加载状态
async function loadStateFromStorage() {
  console.log('从存储中加载状态...');
  
  try {
    const data = await chrome.storage.local.get(['activeConfigId', 'lastProxyConfig']);
    
    if (data.activeConfigId) {
      activeConfigId = data.activeConfigId;
      console.log(`已从存储加载activeConfigId: ${activeConfigId}`);
    }
    
    if (data.lastProxyConfig) {
      lastProxyConfig = data.lastProxyConfig;
      console.log('已从存储加载lastProxyConfig');
    }
    
    // 加载当前真实的Chrome代理设置
    syncWithChromeProxySettings();
  } catch (error) {
    console.error('从存储加载状态时出错:', error);
  }
}

// 与Chrome的实际代理设置同步
async function syncWithChromeProxySettings() {
  console.log('同步UI状态与Chrome实际代理设置...');
  
  try {
    // 获取Chrome当前代理设置
    const proxyInfo = await new Promise((resolve) => {
      chrome.proxy.settings.get({}, (details) => {
        resolve(details);
      });
    });
    
    console.log('Chrome当前代理设置:', JSON.stringify(proxyInfo.value));
    
    // 获取所有配置
    const configs = await getProxyConfigs();
    
    // 根据Chrome实际设置查找匹配的配置
    let matchedConfig = null;
    
    if (proxyInfo.value.mode === 'direct') {
      // Chrome使用直连模式，查找direct配置
      matchedConfig = configs.find(c => c.id === 'direct');
    } else if (proxyInfo.value.mode === 'system') {
      // Chrome使用系统代理，查找system配置
      matchedConfig = configs.find(c => c.id === 'system');
    } else if (proxyInfo.value.mode === 'fixed_servers' && 
               proxyInfo.value.rules && 
               proxyInfo.value.rules.singleProxy) {
      // Chrome使用固定代理服务器，查找匹配的配置
      const chromeSingleProxy = proxyInfo.value.rules.singleProxy;
      
      matchedConfig = configs.find(c => 
        c.type === chromeSingleProxy.scheme && 
        c.host === chromeSingleProxy.host && 
        parseInt(c.port, 10) === chromeSingleProxy.port
      );
    }
    
    // 如果找到匹配的配置且与当前activeConfigId不同，更新状态
    if (matchedConfig && matchedConfig.id !== activeConfigId) {
      console.log(`发现Chrome实际使用配置 "${matchedConfig.name}" 与UI显示的 "${activeConfigId}" 不一致，更新UI状态`);
      
      activeConfigId = matchedConfig.id;
      lastProxyConfig = { 
        id: matchedConfig.id,
        name: matchedConfig.name,
        type: matchedConfig.type,
        host: matchedConfig.host,
        port: matchedConfig.port
      };
      
      // 保存到存储以便后续恢复
      await chrome.storage.local.set({ 
        activeConfigId: activeConfigId,
        lastProxyConfig: lastProxyConfig
      });
      
      // 更新图标
      updateExtensionIcon(matchedConfig.type !== 'direct');
    }
  } catch (error) {
    console.error('同步Chrome代理设置时出错:', error);
  }
}

// 当扩展被调用时（例如点击图标时）确保状态最新
chrome.runtime.onStartup.addListener(async () => {
  console.log('扩展启动，加载状态...');
  await loadStateFromStorage();
});

// 特别处理Service Worker被激活的情况
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup' && !isInitialized) {
    console.log('检测到popup连接且扩展未初始化，立即同步状态');
    loadStateFromStorage();
  }
});

// 初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('ProxyFox 已安装/更新');
  
  try {
    // 初始化默认配置中的国际化文本
    initializeDefaultConfigs();
    
    // 检查是否已有配置数据
    const data = await chrome.storage.local.get(['proxyConfigs', 'activeConfigId', 'userLanguage', 'lastProxyConfig']);
    
    if (!data.proxyConfigs) {
      // 首次安装，初始化默认配置
      await chrome.storage.local.set({
        proxyConfigs: DEFAULT_CONFIGS,
        activeConfigId: 'direct',
        lastProxyConfig: {
          id: 'direct',
          name: getMessage('proxy_direct'),
          type: 'direct'
        }
      });
      console.log('已初始化默认配置');
    } else {
      // 已有配置，加载当前活动配置
      if (data.activeConfigId) {
        activeConfigId = data.activeConfigId;
      }
      
      if (data.lastProxyConfig) {
        lastProxyConfig = data.lastProxyConfig;
      }
    }
    
    // 初始化用户语言
    if (!data.userLanguage) {
      try {
        // 获取浏览器当前语言
        const currentLanguage = chrome.i18n.getUILanguage();
        let langCode = currentLanguage.replace('-', '_');
        
        // 简化语言代码，例如 zh_CN_#Hans 到 zh_CN
        if (langCode.includes('_#')) {
          langCode = langCode.split('_#')[0];
        }
        
        // 处理特殊情况，确保我们能匹配到正确的语言
        if (langCode.startsWith('zh')) {
          if (langCode.includes('TW') || langCode.includes('HK') || langCode.includes('MO')) {
            langCode = 'zh_TW'; // 繁体中文
          } else {
            langCode = 'zh_CN'; // 简体中文
          }
        } else if (langCode.startsWith('ko')) {
          langCode = 'ko'; // 韩语
        } else if (langCode.startsWith('ja')) {
          langCode = 'ja'; // 日语
        } else if (langCode.startsWith('en')) {
          langCode = 'en'; // 英语
        }
        
        // 检查我们是否支持这种语言
        const supportedLanguages = ['zh_CN', 'zh_TW', 'en', 'ja', 'ko'];
        if (!supportedLanguages.includes(langCode)) {
          // 默认使用英文
          langCode = 'en';
        }
        
        // 保存用户语言
        await chrome.storage.local.set({ userLanguage: langCode });
        console.log('已初始化用户语言:', langCode);
      } catch (error) {
        console.error('初始化用户语言失败:', error);
        // 出错时默认使用简体中文
        await chrome.storage.local.set({ userLanguage: 'zh_CN' });
      }
    }
    
    // 应用当前活动的代理配置
    await applyProxyConfig(activeConfigId);
    
    // 初始化图标状态
    updateExtensionIcon(activeConfigId !== 'direct');
    
    // 设置代理认证处理程序
    setupProxyAuthHandler();
    
    // 设置代理设置变更监听
    setupProxyChangeListener();
    
    // 设置代理健康检查
    setupProxyHealthCheck();
    
    // 设置网络错误监听
    setupNetworkErrorListener();
    
    // 启动时验证代理状态是否与UI一致
    setTimeout(validateProxyState, 2000);
    
    // 标记初始化完成
    isInitialized = true;
  } catch (error) {
    console.error('初始化配置时出错:', error);
  }
});

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getConfigs') {
    // 在返回配置前，确保状态是最新的
    if (!isInitialized) {
      // 如果未初始化，先同步一下状态
      syncWithChromeProxySettings().then(() => {
        // 获取所有代理配置
        getProxyConfigs().then(configs => {
          sendResponse({ configs, activeConfigId });
        });
      }).catch(error => {
        console.error('同步状态出错:', error);
        // 即使出错也返回当前状态
        getProxyConfigs().then(configs => {
          sendResponse({ configs, activeConfigId });
        });
      });
    } else {
      // 已初始化，直接返回配置
      getProxyConfigs().then(configs => {
        sendResponse({ configs, activeConfigId });
      });
    }
    return true; // 保持消息通道开放，以便异步响应
  } 
  else if (message.action === 'activateConfig') {
    // 激活指定的代理配置
    applyProxyConfig(message.configId).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('应用代理配置失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  else if (message.action === 'saveConfig') {
    // 保存代理配置
    saveProxyConfig(message.config).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('保存代理配置失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  else if (message.action === 'deleteConfig') {
    // 删除代理配置
    deleteProxyConfig(message.configId).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('删除代理配置失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  else if (message.action === 'importConfigs') {
    // 导入代理配置
    importProxyConfigs(message.configs, message.mode).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('导入代理配置失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  else if (message.action === 'syncState') {
    // 同步状态
    syncWithChromeProxySettings().then(() => {
      sendResponse({ success: true, activeConfigId });
    }).catch(error => {
      console.error('同步状态失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// 获取所有代理配置
async function getProxyConfigs() {
  const data = await chrome.storage.local.get('proxyConfigs');
  return data.proxyConfigs || DEFAULT_CONFIGS;
}

// 保存代理配置
async function saveProxyConfig(config) {
  // 获取现有配置
  const configs = await getProxyConfigs();
  
  // 检查配置ID
  if (!config.id) {
    // 新配置，生成唯一ID
    config.id = 'config_' + Date.now();
    configs.push(config);
  } else {
    // 更新现有配置
    const index = configs.findIndex(c => c.id === config.id);
    if (index >= 0) {
      configs[index] = config;
    } else {
      configs.push(config);
    }
  }
  
  // 保存更新后的配置列表
  await chrome.storage.local.set({ proxyConfigs: configs });
  
  // 如果这是当前激活的配置，则重新应用它
  if (config.id === activeConfigId) {
    await applyProxyConfig(config.id);
  }
  
  return config;
}

// 删除代理配置
async function deleteProxyConfig(configId) {
  // 不允许删除系统配置
  if (configId === 'direct' || configId === 'system') {
    throw new Error(getMessage('error_cannotDeleteSystemConfig') || '系统配置不能删除');
  }
  
  // 获取现有配置
  const configs = await getProxyConfigs();
  
  // 过滤掉要删除的配置
  const newConfigs = configs.filter(c => c.id !== configId);
  
  // 保存更新后的配置列表
  await chrome.storage.local.set({ proxyConfigs: newConfigs });
  
  // 如果删除的是当前激活的配置，记录到控制台
  if (configId === activeConfigId) {
    console.log('删除了当前激活的代理配置，请手动选择新的代理');
  }
  
  return true;
}

// 导入代理配置
async function importProxyConfigs(newConfigs, mode = 'merge') {
  // 验证导入的配置
  if (!Array.isArray(newConfigs)) {
    throw new Error('配置格式错误');
  }
  
  // 获取现有配置
  let configs = await getProxyConfigs();
  
  if (mode === 'replace') {
    // 替换模式：保留系统配置，替换其他所有配置
    configs = configs.filter(c => c.isSystem).concat(
      newConfigs.filter(c => !c.isSystem)
    );
  } else {
    // 合并模式：添加新配置，如有同名配置则更新
    newConfigs.forEach(newConfig => {
      if (!newConfig.id) {
        newConfig.id = 'config_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      }
      
      const index = configs.findIndex(c => c.id === newConfig.id || (!c.isSystem && c.name === newConfig.name));
      
      if (index >= 0 && !configs[index].isSystem) {
        // 更新现有非系统配置
        configs[index] = { ...newConfig, id: configs[index].id };
      } else if (!configs.some(c => c.isSystem && c.id === newConfig.id)) {
        // 添加新配置，但不添加系统配置
        configs.push(newConfig);
      }
    });
  }
  
  // 保存更新后的配置列表
  await chrome.storage.local.set({ proxyConfigs: configs });
  
  // 如果当前激活的配置不存在于新配置中，记录日志
  if (!configs.some(c => c.id === activeConfigId)) {
    console.log('导入配置后，当前激活的代理配置不存在，请手动选择新的代理');
  }
  
  return true;
}

// 刷新当前活动标签页
async function refreshCurrentTab() {
  console.log('准备刷新当前标签页以应用新的代理设置');
  
  try {
    // 获取当前窗口的活动标签页
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tabs && tabs.length > 0) {
      const currentTab = tabs[0];
      
      // 排除扩展页面和Chrome内置页面
      if (!currentTab.url.startsWith('chrome-extension:') && 
          !currentTab.url.startsWith('chrome:') &&
          !currentTab.url.startsWith('chrome-search:') &&
          !currentTab.url.startsWith('devtools:')) {
        
        console.log(`刷新标签页: ${currentTab.title}`);
        await chrome.tabs.reload(currentTab.id, { bypassCache: true });
        
        // 显示通知
        console.log('已自动刷新当前页面以应用新的代理设置');
      } else {
        console.log('当前页面是扩展或浏览器内部页面，不进行刷新');
      }
    } else {
      console.log('未找到当前活动标签页');
    }
  } catch (error) {
    console.error('刷新当前标签页时出错:', error);
  }
}

// 应用代理配置
async function applyProxyConfig(configId) {
  try {
    // 标记为手动修改
    manuallyChanged = true;
    
    // 获取所有配置
    const configs = await getProxyConfigs();
    
    // 查找指定的配置
    const config = configs.find(c => c.id === configId);
    
    if (!config) {
      throw new Error(`找不到配置: ${configId}`);
    }
    
    // 记录切换前的配置
    const previousConfig = { ...lastProxyConfig };
    
    // 更新当前激活的配置ID和记录
    activeConfigId = configId;
    lastProxyConfig = { 
      id: config.id,
      name: config.name,
      type: config.type,
      host: config.host,
      port: config.port
    };
    
    // 保存到存储中，确保在后台脚本重启时能恢复
    await chrome.storage.local.set({ 
      activeConfigId: activeConfigId,
      lastProxyConfig: lastProxyConfig  
    });
    
    // 记录详细日志
    console.log(`正在从 "${previousConfig.name}" 切换到 "${config.name}"`);
    
    // 根据配置类型应用不同的代理设置
    if (config.type === 'direct') {
      // 直连模式 - 不使用clear()，而是明确设置为direct模式
      await chrome.proxy.settings.set({
        value: { mode: 'direct' },
        scope: 'regular'
      });
      console.log('已应用直连模式');
      
      // 更新图标为默认状态
      updateExtensionIcon(false);
    } 
    else if (config.type === 'system') {
      // 系统代理模式
      await chrome.proxy.settings.set({
        value: { mode: 'system' },
        scope: 'regular'
      });
      console.log('已应用系统代理模式');
      
      // 更新图标为工作状态
      updateExtensionIcon(true);
    } 
    else {
      // 处理白名单规则
      let bypassList = [...(config.whitelist || [])];
      
      // 如果选择了使用全局白名单，则合并全局规则
      if (config.useGlobalWhitelist !== false) {
        try {
          const data = await chrome.storage.local.get('globalWhitelist');
          const globalRules = data.globalWhitelist || [];
          
          // 合并规则并去重
          bypassList = [...new Set([...globalRules, ...bypassList])];
          console.log('已合并全局白名单规则，共 ' + bypassList.length + ' 条规则');
        } catch (error) {
          console.error('读取全局白名单失败:', error);
        }
      }
      
      // 自定义代理模式
      const proxyConfig = {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: config.type,
            host: config.host,
            port: parseInt(config.port, 10)
          },
          bypassList: bypassList
        }
      };
      
      await chrome.proxy.settings.set({
        value: proxyConfig,
        scope: 'regular'
      });
      
      console.log(`已应用代理配置: ${config.name} (${config.type} ${config.host}:${config.port})`);
      
      // 更新图标为工作状态
      updateExtensionIcon(true);
    }
    
    console.log(`代理已从"${previousConfig.name}"切换到"${config.name}"`);
    
    // 重新设置代理认证处理程序，确保新配置生效
    setupProxyAuthHandler();
    
    // 延迟2秒后验证代理状态，确保设置已生效
    setTimeout(validateProxyState, 2000);
    
    // 刷新当前标签页以立即应用新的代理设置
    refreshCurrentTab();
    
    return config;
  } catch (error) {
    console.error('应用代理配置时出错:', error);
    throw error;
  }
}

// 设置代理设置变更监听
function setupProxyChangeListener() {
  if (chrome.proxy && chrome.proxy.settings && chrome.proxy.settings.onChange) {
    try {
      // 添加代理设置变更监听
      chrome.proxy.settings.onChange.addListener(details => {
        console.log('检测到代理设置变更:', details);
        
        // 获取当前代理设置
        chrome.proxy.settings.get({}, async settings => {
          let newMode = settings.value.mode;
          let message = '';
          
          // 检查是否是我们通过扩展API手动修改的
          if (manuallyChanged) {
            message = `代理设置已手动更改为: ${newMode}`;
            console.log(message);
          } else {
            message = `代理设置被外部更改为: ${newMode}`;
            console.log(message);
            
            // 如果当前设置为直连，但我们的activeConfigId不是direct
            if (newMode === 'direct' && activeConfigId !== 'direct') {
              console.log('代理被外部切换为直连模式，但不自动同步UI状态');
              
              // 不自动更新activeConfigId，只记录日志
              message += `。出于安全考虑，ProxyFox UI未自动同步。如需同步，请点击"直连模式"选项。`;
            } else if (newMode !== 'direct' && activeConfigId === 'direct') {
              // 从直连切换到其他模式
              message += `。出于安全考虑，ProxyFox UI未自动同步。请手动选择对应的代理配置。`;
            }
          }
          
          // 只记录日志，不显示通知
          console.log(message);
        });
        
        // 重置手动修改标志
        manuallyChanged = false;
      });
      
      console.log('已设置代理设置变更监听');
    } catch (e) {
      console.error('设置代理设置变更监听出错:', e);
    }
  } else {
    console.warn('当前浏览器环境不支持代理设置变更监听 API');
  }
}

// 设置网络错误监听（简化版本，不依赖webRequest API）
function setupNetworkErrorListener() {
  console.log('已设置简化版网络状态检查（不依赖webRequest API）');
  
  // 每30秒检查一次代理状态，确保UI与Chrome代理设置一致
  setInterval(() => {
    // 简化原来的网络错误监听逻辑，只检查代理状态一致性
    if (activeConfigId !== 'direct' && activeConfigId !== 'system') {
      validateProxyState();
    }
  }, 30 * 1000);
}

// 验证并同步代理状态
async function validateProxyState() {
  console.log('正在验证代理状态...');
  
  try {
    // 获取Chrome当前代理设置
    const proxyInfo = await new Promise((resolve) => {
      chrome.proxy.settings.get({}, (details) => {
        resolve(details);
      });
    });
    
    console.log('Chrome当前代理设置:', JSON.stringify(proxyInfo.value));
    console.log('插件当前代理ID:', activeConfigId);
    
    // 获取当前配置
    const configs = await getProxyConfigs();
    const activeConfig = configs.find(c => c.id === activeConfigId);
    
    if (!activeConfig) {
      console.error('找不到活动配置');
      return;
    }
    
    let statusMismatch = false;
    let mismatchDetails = '';
    
    // 检查Chrome代理设置与插件状态是否一致
    if (activeConfig.type === 'direct') {
      // 直连模式 - Chrome应该是direct模式
      // 注意：Chrome可能会将clear()解释为system模式，或者反之亦然
      // 所以我们只在Chrome明确使用固定代理服务器时才报告不一致
      if (proxyInfo.value.mode === 'fixed_servers') {
        console.error('状态不一致: UI显示直连，但Chrome使用固定代理服务器');
        statusMismatch = true;
        mismatchDetails = 'UI显示直连模式，但Chrome实际使用了固定代理服务器。';
      } else {
        // direct或system模式都算作直连的一种形式，不再报告不一致
        console.log('Chrome使用的是 ' + proxyInfo.value.mode + ' 模式，与UI显示的直连模式兼容');
      }
    } else if (activeConfig.type === 'system') {
      if (proxyInfo.value.mode !== 'system') {
        console.error('状态不一致: UI显示系统代理，但Chrome使用其他模式');
        statusMismatch = true;
        mismatchDetails = 'UI显示系统代理，但Chrome使用了其他代理模式。';
      }
    } else if (activeConfig.type !== 'direct' && activeConfig.type !== 'system') {
      // 检查自定义代理
      if (proxyInfo.value.mode !== 'fixed_servers') {
        console.error('状态不一致: UI显示自定义代理，但Chrome不是fixed_servers模式');
        statusMismatch = true;
        mismatchDetails = `UI显示使用自定义代理"${activeConfig.name}"，但Chrome没有使用该代理。`;
      } else if (proxyInfo.value.rules && proxyInfo.value.rules.singleProxy) {
        const chromeProxy = proxyInfo.value.rules.singleProxy;
        // 检查代理服务器信息是否匹配
        if (chromeProxy.scheme !== activeConfig.type || 
            chromeProxy.host !== activeConfig.host || 
            chromeProxy.port !== parseInt(activeConfig.port, 10)) {
          console.error('状态不一致: 代理服务器信息不匹配');
          statusMismatch = true;
          mismatchDetails = `UI显示使用代理"${activeConfig.name}"，但Chrome使用了不同的代理服务器。`;
        }
      }
    }
    
    // 如果状态不一致，只记录日志，不提供通知
    if (statusMismatch) {
      console.log('检测到代理状态不一致:', mismatchDetails);
      console.log('出于安全考虑，不会自动切换。请手动选择正确的代理设置。');
    } else {
      console.log('代理状态验证通过，UI与Chrome设置一致');
    }
  } catch (error) {
    console.error('验证代理状态时出错:', error);
  }
}

// 设置代理健康检查
function setupProxyHealthCheck() {
  // 使用setTimeout替代alarms API，每10分钟检查一次代理状态
  console.log('已设置代理健康检查（使用setTimeout）');
  
  // 立即执行一次健康检查
  checkProxyHealth();
  
  // 设置定时器，每10分钟执行一次
  setInterval(checkProxyHealth, 10 * 60 * 1000);
}

// 检查代理健康状态
async function checkProxyHealth() {
  // 如果当前不是使用自定义代理，则不检查
  if (activeConfigId === 'direct' || activeConfigId === 'system') {
    return;
  }
  
  try {
    // 获取当前配置
    const configs = await getProxyConfigs();
    const activeConfig = configs.find(c => c.id === activeConfigId);
    
    if (!activeConfig || activeConfig.type === 'direct' || activeConfig.type === 'system') {
      return;
    }
    
    console.log(`检查代理 ${activeConfig.name} (${activeConfig.host}:${activeConfig.port}) 的健康状态`);
    
    // 检查验证代理状态是否与UI一致
    validateProxyState();
    
    // 日志记录，不使用通知
    console.log(`代理状态检查: 当前使用的代理是 ${activeConfig.name}，健康检查已完成`);
  } catch (error) {
    console.error('检查代理健康状态出错:', error);
  }
}

// 设置代理认证处理程序
function setupProxyAuthHandler() {
  if (chrome.proxy && chrome.proxy.onAuthRequired) {
    try {
      // 移除可能存在的旧监听器(如果可能的话)
      chrome.proxy.onAuthRequired.removeListener(proxyAuthHandler);
    } catch (e) {
      // 忽略可能的错误
    }
    
    // 添加新的代理认证处理程序，使用同步处理方式
    chrome.proxy.onAuthRequired.addListener(
      proxyAuthHandler,
      {urls: ["<all_urls>"]},
      ["asyncBlocking"] // 使用asyncBlocking模式
    );
    console.log('已设置代理认证处理程序');
  } else {
    console.warn('当前浏览器环境不支持代理认证API');
  }
}

// 代理认证处理程序 - 新版本
function proxyAuthHandler(details, callback) {
  console.log('收到代理认证请求:', details);
  
  // 检查是否是代理认证请求
  if (details.isProxy) {
    const proxyHost = details.challenger?.host || '';
    const proxyPort = details.challenger?.port || '';
    console.log(`正在处理代理认证: ${proxyHost}:${proxyPort}`);
    
    getProxyConfigs().then(configs => {
      // 获取当前活动配置
      const activeConfig = configs.find(c => c.id === activeConfigId);
      console.log('当前活动配置:', activeConfigId, activeConfig ? '找到配置' : '未找到配置');
      
      if (activeConfig && activeConfig.username && activeConfig.password) {
        // 检查代理地址是否匹配
        const configHost = activeConfig.host || '';
        const configPort = activeConfig.port || '';
        
        console.log(`比较代理地址: 配置=${configHost}:${configPort}, 请求=${proxyHost}:${proxyPort}`);
        
        // 如果主机和端口匹配，或者至少主机匹配（可能端口信息不准确）
        const hostMatches = proxyHost.includes(configHost) || configHost.includes(proxyHost);
        
        if (hostMatches) {
          console.log(`提供认证信息: 用户名=${activeConfig.username}, 密码长度=${activeConfig.password.length}`);
          
          // 提供认证凭据
          callback({
            authCredentials: {
              username: activeConfig.username,
              password: activeConfig.password
            }
          });
          return;
        } else {
          console.log('代理地址不匹配，不提供认证');
        }
      } else {
        console.log('当前配置没有认证信息');
      }
      
      // 如果没有找到匹配的配置或认证信息，直接回调
      callback();
    }).catch(error => {
      console.error('代理认证处理出错:', error);
      callback();
    });
  } else {
    console.log('非代理认证请求，转发给用户处理');
    callback();
  }
} 