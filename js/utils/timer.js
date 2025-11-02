// 定时器管理工具 - 优化性能和内存使用

class TimerManager {
  constructor() {
    this.timers = new Map();
    this.intervals = new Map();
    this.nextId = 1;
  }

  // 设置延时执行（替代setTimeout）
  setTimeout(callback, delay, ...args) {
    const id = this.nextId++;
    const timerId = setTimeout(() => {
      this.timers.delete(id);
      callback(...args);
    }, delay);
    
    this.timers.set(id, timerId);
    return id;
  }

  // 设置周期执行（替代setInterval，带防抖功能）
  setInterval(callback, interval, options = {}) {
    const { immediate = false, maxExecutions = Infinity } = options;
    const id = this.nextId++;
    let executionCount = 0;
    
    const execute = () => {
      if (executionCount >= maxExecutions) {
        this.clearInterval(id);
        return;
      }
      
      executionCount++;
      try {
        callback();
      } catch (error) {
        console.error('定时器执行出错:', error);
      }
    };
    
    // 立即执行一次（如果设置了immediate）
    if (immediate) {
      execute();
    }
    
    // 设置定期执行
    const intervalId = setInterval(execute, interval);
    this.intervals.set(id, intervalId);
    
    return id;
  }

  // 清除延时执行
  clearTimeout(id) {
    const timerId = this.timers.get(id);
    if (timerId) {
      clearTimeout(timerId);
      this.timers.delete(id);
      return true;
    }
    return false;
  }

  // 清除周期执行
  clearInterval(id) {
    const intervalId = this.intervals.get(id);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(id);
      return true;
    }
    return false;
  }

  // 清除所有定时器
  clearAll() {
    // 清除所有setTimeout
    for (const timerId of this.timers.values()) {
      clearTimeout(timerId);
    }
    this.timers.clear();
    
    // 清除所有setInterval
    for (const intervalId of this.intervals.values()) {
      clearInterval(intervalId);
    }
    this.intervals.clear();
  }

  // 获取活跃定时器数量
  getActiveCount() {
    return {
      timeouts: this.timers.size,
      intervals: this.intervals.size,
      total: this.timers.size + this.intervals.size
    };
  }

  // 设置自适应间隔（根据页面可见性调整）
  setAdaptiveInterval(callback, normalInterval, backgroundInterval = normalInterval * 4) {
    let currentInterval = normalInterval;
    let intervalId = null;
    
    const updateInterval = () => {
      const newInterval = document.hidden ? backgroundInterval : normalInterval;
      if (newInterval !== currentInterval) {
        if (intervalId) {
          this.clearInterval(intervalId);
        }
        currentInterval = newInterval;
        intervalId = this.setInterval(callback, currentInterval);
      }
    };
    
    // 监听页面可见性变化
    document.addEventListener('visibilitychange', updateInterval);
    
    // 初始设置
    updateInterval();
    
    return {
      clear: () => {
        if (intervalId) {
          this.clearInterval(intervalId);
        }
        document.removeEventListener('visibilitychange', updateInterval);
      }
    };
  }

  // 防抖定时器
  debounce(callback, delay) {
    let timeoutId = null;
    
    return (...args) => {
      if (timeoutId) {
        this.clearTimeout(timeoutId);
      }
      
      timeoutId = this.setTimeout(() => {
        callback(...args);
      }, delay);
    };
  }

  // 节流定时器
  throttle(callback, interval) {
    let lastExecution = 0;
    let timeoutId = null;
    
    return (...args) => {
      const now = Date.now();
      const timeSinceLastExecution = now - lastExecution;
      
      if (timeSinceLastExecution >= interval) {
        lastExecution = now;
        callback(...args);
      } else {
        if (timeoutId) {
          this.clearTimeout(timeoutId);
        }
        
        timeoutId = this.setTimeout(() => {
          lastExecution = Date.now();
          callback(...args);
        }, interval - timeSinceLastExecution);
      }
    };
  }
}

// 创建全局实例
window.timerManager = new TimerManager();

// 页面卸载时清理所有定时器
window.addEventListener('beforeunload', () => {
  window.timerManager.clearAll();
});

// 导出常用接口
window.optimizedSetTimeout = (callback, delay, ...args) => 
  window.timerManager.setTimeout(callback, delay, ...args);

window.optimizedSetInterval = (callback, interval, options) => 
  window.timerManager.setInterval(callback, interval, options);

window.clearOptimizedTimeout = (id) => 
  window.timerManager.clearTimeout(id);

window.clearOptimizedInterval = (id) => 
  window.timerManager.clearInterval(id);