importScripts('../lib/host.js');

const DEFAULT_HOST_CONFIG = { provider: 'catbox', customUrl: '' };

const handlers = {
  async 'get-host-config'() {
    const data = await chrome.storage.local.get('host_config');
    const config = {
      provider: 'catbox',
      customUrl: ''
    };
    if (data.host_config) {
      if (data.host_config.provider) config.provider = data.host_config.provider;
      if (data.host_config.customUrl) config.customUrl = data.host_config.customUrl;
    }
    return config;
  },

  async 'save-host-config'(message) {
    const config = message.config || {};
    await chrome.storage.local.set({
      host_config: {
        provider: config.provider || 'catbox',
        customUrl: config.customUrl || ''
      }
    });
    return { ok: true };
  },

  async 'upload-share'(message) {
    if (!message.envelope || !message.envelope.ciphertext) {
      throw new Error('There is nothing to upload; encryption failed.');
    }
    const data = await chrome.storage.local.get('host_config');
    const config = data.host_config || DEFAULT_HOST_CONFIG;
    const url = await Host.upload(config, message.envelope, message.fileName);
    if (!url) throw new Error('Upload returned no URL.');
    return { url };
  }
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message && message.type];
  if (!handler) return false;
  Promise.resolve(handler(message))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: (error && error.message) || String(error) }));
  return true;
});
