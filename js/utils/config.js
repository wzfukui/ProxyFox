(function initProxyFoxConfig(globalScope) {
  'use strict';

  const SUPPORTED_PROXY_TYPES = new Set(['http', 'https', 'socks4', 'socks5']);
  const SYSTEM_CONFIG_IDS = new Set(['direct', 'system']);
  const MAX_WHITELIST_RULES = 10000;
  const MAX_RULE_LENGTH = 2048;

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function normalizeHost(value) {
    let host = String(value || '').trim().toLowerCase();
    assert(host, 'Proxy host is required');
    assert(host.length <= 255, 'Proxy host is too long');
    assert(!/\s/.test(host), 'Proxy host cannot contain whitespace');
    assert(!host.includes('://') && !/[/?#]/.test(host), 'Proxy host must not include a scheme or path');

    if (host.startsWith('[') && host.endsWith(']')) {
      host = host.slice(1, -1);
    }

    if (host.includes(':')) {
      assert(/^[0-9a-f:.]+$/i.test(host), 'Invalid IPv6 proxy host');
    } else {
      assert(/^[a-z0-9.-]+$/i.test(host), 'Proxy host must be an ASCII hostname or IP address');
      assert(!host.startsWith('.') && !host.endsWith('.'), 'Invalid proxy host');
      assert(!host.includes('..'), 'Invalid proxy host');
    }

    return host;
  }

  function normalizePort(value) {
    const port = Number(value);
    assert(Number.isInteger(port) && port >= 1 && port <= 65535, 'Proxy port must be between 1 and 65535');
    return port;
  }

  function normalizeWhitelist(value) {
    if (value == null) return [];
    assert(Array.isArray(value), 'Whitelist must be an array');
    assert(value.length <= MAX_WHITELIST_RULES, `Whitelist cannot exceed ${MAX_WHITELIST_RULES} rules`);

    const normalized = [];
    const seen = new Set();
    for (const item of value) {
      assert(typeof item === 'string', 'Whitelist rules must be strings');
      const rule = item.trim();
      if (!rule) continue;
      assert(rule.length <= MAX_RULE_LENGTH, 'Whitelist rule is too long');
      if (!seen.has(rule)) {
        seen.add(rule);
        normalized.push(rule);
      }
    }
    return normalized;
  }

  function parseWhitelistText(input) {
    if (!input || typeof input !== 'string') return [];
    const rules = input
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const commentIndex = line.indexOf('#');
        return commentIndex === -1 ? line : line.slice(0, commentIndex).trim();
      })
      .filter(Boolean);
    return normalizeWhitelist(rules);
  }

  function expandWhitelist(value) {
    const rules = normalizeWhitelist(value);
    const expanded = [...rules];
    for (const rule of rules) {
      if (rule.startsWith('*.') || rule.startsWith('.')) {
        const rootDomain = rule.startsWith('*.') ? rule.slice(2) : rule.slice(1);
        if (rootDomain.includes('.') && !rootDomain.startsWith('.')) {
          expanded.push(rootDomain);
        }
      }
    }
    return [...new Set(expanded)];
  }

  function normalizeConfig(config, options = {}) {
    const { allowSystem = false } = options;
    assert(config && typeof config === 'object' && !Array.isArray(config), 'Invalid proxy configuration');

    const id = config.id == null ? '' : String(config.id).trim();
    if (SYSTEM_CONFIG_IDS.has(id)) {
      assert(allowSystem, 'System proxy configurations cannot be modified');
      return {
        id,
        name: String(config.name || id).trim(),
        type: id,
        host: '',
        port: 0,
        whitelist: [],
        isSystem: true
      };
    }

    const name = String(config.name || '').trim();
    const type = String(config.type || '').trim().toLowerCase();
    assert(/^[A-Za-z0-9_-]{1,128}$/.test(id), 'Invalid proxy configuration ID');
    assert(name && name.length <= 100, 'Proxy name must be between 1 and 100 characters');
    assert(SUPPORTED_PROXY_TYPES.has(type), 'Unsupported proxy type');

    const normalized = {
      id,
      name,
      type,
      host: normalizeHost(config.host),
      port: normalizePort(config.port),
      username: String(config.username || '').trim(),
      password: String(config.password || ''),
      useGlobalWhitelist: config.useGlobalWhitelist !== false,
      whitelist: normalizeWhitelist(config.whitelist)
    };

    assert(normalized.username.length <= 512, 'Proxy username is too long');
    assert(normalized.password.length <= 2048, 'Proxy password is too long');
    return normalized;
  }

  function proxySettingsMatch(value, config) {
    if (!value || !config) return false;
    if (config.type === 'direct' || config.type === 'system') {
      return value.mode === config.type;
    }

    return proxyValuesMatch(value, {
      mode: 'fixed_servers',
      rules: {
        singleProxy: {
          scheme: config.type,
          host: config.host,
          port: config.port
        },
        bypassList: expandWhitelist(config.whitelist || [])
      }
    });
  }

  function proxyValuesMatch(actual, expected) {
    if (!actual || !expected || actual.mode !== expected.mode) return false;
    if (expected.mode !== 'fixed_servers') return true;

    const actualRules = actual.rules || {};
    const expectedRules = expected.rules || {};
    const actualProxy = actualRules.singleProxy;
    const expectedProxy = expectedRules.singleProxy;
    if (!actualProxy || !expectedProxy) return false;

    try {
      if (String(actualProxy.scheme || 'http').toLowerCase() !== String(expectedProxy.scheme || 'http').toLowerCase()
          || normalizeHost(actualProxy.host) !== normalizeHost(expectedProxy.host)
          || normalizePort(actualProxy.port) !== normalizePort(expectedProxy.port)) {
        return false;
      }
    } catch (_error) {
      return false;
    }

    if (actualRules.proxyForHttp || actualRules.proxyForHttps || actualRules.proxyForFtp || actualRules.fallbackProxy) {
      return false;
    }

    const normalizeBypassList = value => [...new Set(normalizeWhitelist(value || []))].sort();
    const actualBypass = normalizeBypassList(actualRules.bypassList);
    const expectedBypass = normalizeBypassList(expectedRules.bypassList);
    return actualBypass.length === expectedBypass.length
      && actualBypass.every((rule, index) => rule === expectedBypass[index]);
  }

  function authChallengeMatches(details, config) {
    if (!details || !details.isProxy || !config || SYSTEM_CONFIG_IDS.has(config.id)) return false;
    const challenger = details.challenger || {};
    if (!challenger.host || challenger.port == null) return false;
    try {
      return normalizeHost(challenger.host) === normalizeHost(config.host)
        && normalizePort(challenger.port) === normalizePort(config.port);
    } catch (_error) {
      return false;
    }
  }

  const api = {
    SUPPORTED_PROXY_TYPES,
    SYSTEM_CONFIG_IDS,
    normalizeHost,
    normalizePort,
    normalizeWhitelist,
    parseWhitelistText,
    expandWhitelist,
    normalizeConfig,
    proxySettingsMatch,
    proxyValuesMatch,
    authChallengeMatches
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.ProxyFoxConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
