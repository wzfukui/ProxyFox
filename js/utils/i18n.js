// i18n 工具模块 - 国际化功能共享模块

class I18nManager {
  constructor() {
    this.cachedMessages = {};
    this.supportedLanguages = ['zh_CN', 'zh_TW', 'en', 'ja', 'ko'];
    this.currentLanguage = 'en';
    this.loadedLanguages = new Set();
  }

  async preloadMessages(language = this.currentLanguage) {
    const basePath = chrome.runtime.getURL('_locales/');
    const languages = [...new Set([language, 'en'])]
      .filter(lang => this.supportedLanguages.includes(lang) && !this.loadedLanguages.has(lang));
    if (languages.length === 0) return;

    const loadPromises = languages.map(async (lang) => {
      try {
        const url = `${basePath}${lang}/messages.json`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.cachedMessages[lang] = await response.json();
        this.loadedLanguages.add(lang);
      } catch (error) {
        console.error(`Failed to load locale ${lang}:`, error.message);
      }
    });
    await Promise.all(loadPromises);
  }

  // 获取消息文本（优化版本）
  fetchMessage(messageName, language = null) {
    const lang = language || this.currentLanguage;
    
    // 优先从缓存获取
    if (this.cachedMessages[lang]?.[messageName]) {
      return this.cachedMessages[lang][messageName].message;
    }
    
    // 降级到Chrome i18n API
    const chromeMessage = chrome.i18n.getMessage(messageName);
    if (chromeMessage) {
      return chromeMessage;
    }
    
    // 降级到英语
    if (lang !== 'en' && this.cachedMessages.en?.[messageName]) {
      return this.cachedMessages.en[messageName].message;
    }
    
    // 最后降级到消息键本身
    console.warn(`无法获取消息: ${messageName} (${lang})`);
    return messageName;
  }

  // 设置当前语言
  setCurrentLanguage(language) {
    if (this.supportedLanguages.includes(language)) {
      this.currentLanguage = language;
    }
  }

  // 获取当前语言
  getCurrentLanguage() {
    return this.currentLanguage;
  }

  async refreshInterfaceText(language = null) {
    const lang = language || this.currentLanguage;
    await this.preloadMessages(lang);
    this.localizeDocument(lang);
  }

  localizeDocument(language = this.currentLanguage) {
    this.setCurrentLanguage(language);
    this.processInnerHTMLMessages(language);
    this.updateTextNodes(language);
    this.updatePlaceholders(language);
    this.updateTitles(language);
    this.updateMessageAttributes(language);
  }

  updateMessageAttributes(language) {
    document.querySelectorAll('[aria-label^="__MSG_"]').forEach(element => {
      const value = element.getAttribute('aria-label');
      const messageName = value.slice(6, -2);
      element.setAttribute('aria-label', this.fetchMessage(messageName, language));
    });
  }

  // 更新文本节点（优化版本）
  updateTextNodes(language) {
    const textNodes = document.querySelectorAll('[data-i18n]');
    
    // 批量更新减少重绘
    const updates = [];
    textNodes.forEach(node => {
      const messageName = node.getAttribute('data-i18n');
      if (messageName) {
        const newText = this.fetchMessage(messageName, language);
        if (node.textContent !== newText) {
          updates.push({ node, text: newText });
        }
      }
    });
    
    // 批量应用更新
    updates.forEach(({ node, text }) => {
      node.textContent = text;
    });
  }

  // 更新按钮文本
  updateButtonTexts(language) {
    const buttons = document.querySelectorAll('button[data-i18n]');
    buttons.forEach(button => {
      const messageName = button.getAttribute('data-i18n');
      if (messageName) {
        button.textContent = this.fetchMessage(messageName, language);
      }
    });
  }

  // 更新占位符
  updatePlaceholders(language) {
    const inputs = document.querySelectorAll('input[placeholder^="__MSG_"], textarea[placeholder^="__MSG_"]');
    inputs.forEach(input => {
      const placeholder = input.getAttribute('placeholder');
      if (placeholder?.startsWith('__MSG_') && placeholder.endsWith('__')) {
        const messageName = placeholder.slice(6, -2);
        input.placeholder = this.fetchMessage(messageName, language);
      }
    });
  }

  // 更新标题属性
  updateTitles(language) {
    const elements = document.querySelectorAll('[title^="__MSG_"]');
    elements.forEach(element => {
      const title = element.getAttribute('title');
      if (title?.startsWith('__MSG_') && title.endsWith('__')) {
        const messageName = title.slice(6, -2);
        element.title = this.fetchMessage(messageName, language);
      }
    });
  }

  // 处理innerHTML内容中的国际化标记（优化版本）
  processInnerHTMLMessages(language) {
    const elements = document.querySelectorAll('*');
    
    elements.forEach(element => {
      // 跳过脚本和样式标签
      if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') {
        return;
      }
      
      const childNodes = Array.from(element.childNodes);
      childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent;
          if (text.includes('__MSG_')) {
            const updatedText = text.replace(/__MSG_(\w+)__/g, (match, messageName) => {
              return this.fetchMessage(messageName, language);
            });
            
            if (text !== updatedText) {
              node.textContent = updatedText;
            }
          }
        }
      });
    });
  }
}

// 创建全局实例
window.i18nManager = new I18nManager();

// 导出接口函数（兼容现有代码）
window.preloadMessages = () => window.i18nManager.preloadMessages();
window.fetchMessage = (messageName, language) => window.i18nManager.fetchMessage(messageName, language);
window.refreshInterfaceText = (language) => window.i18nManager.refreshInterfaceText(language);
