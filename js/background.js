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

// 存储当前激活的配置ID
let activeConfigId = 'direct';

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

// 初始化
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('ProxyFox 已安装/更新');
  
  try {
    // 初始化默认配置中的国际化文本
    initializeDefaultConfigs();
    
    // 检查是否已有配置数据
    const data = await chrome.storage.local.get(['proxyConfigs', 'activeConfigId', 'userLanguage']);
    
    if (!data.proxyConfigs) {
      // 首次安装，初始化默认配置
      await chrome.storage.local.set({
        proxyConfigs: DEFAULT_CONFIGS,
        activeConfigId: 'direct'
      });
      console.log('已初始化默认配置');
    } else {
      // 已有配置，加载当前活动配置
      activeConfigId = data.activeConfigId || 'direct';
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
  } catch (error) {
    console.error('初始化配置时出错:', error);
  }
});

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

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getConfigs') {
    // 获取所有代理配置
    getProxyConfigs().then(configs => {
      sendResponse({ configs, activeConfigId });
    });
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
  
  // 如果删除的是当前激活的配置，则切换到直连模式
  if (configId === activeConfigId) {
    await applyProxyConfig('direct');
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
  
  // 如果当前激活的配置不存在于新配置中，则切换到直连模式
  if (!configs.some(c => c.id === activeConfigId)) {
    await applyProxyConfig('direct');
  }
  
  return true;
}

// 应用代理配置
async function applyProxyConfig(configId) {
  try {
    // 获取所有配置
    const configs = await getProxyConfigs();
    
    // 查找指定的配置
    const config = configs.find(c => c.id === configId);
    
    if (!config) {
      throw new Error(`找不到配置: ${configId}`);
    }
    
    // 更新当前激活的配置ID
    activeConfigId = configId;
    await chrome.storage.local.set({ activeConfigId });
    
    // 根据配置类型应用不同的代理设置
    if (config.type === 'direct') {
      // 直连模式
      await chrome.proxy.settings.clear({ scope: 'regular' });
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
      
      console.log(`已应用代理配置: ${config.name}`);
      
      // 更新图标为工作状态
      updateExtensionIcon(true);
    }
    
    // 重新设置代理认证处理程序，确保新配置生效
    setupProxyAuthHandler();
    
    return config;
  } catch (error) {
    console.error('应用代理配置时出错:', error);
    throw error;
  }
} 