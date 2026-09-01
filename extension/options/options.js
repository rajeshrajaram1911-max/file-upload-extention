const $ = (id) => document.getElementById(id);

const HISTORY_KEY = 'share_history';

function inExtensionContext() {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
}

function setStatus(element, text, ok) {
  element.textContent = text;
  element.classList.toggle('ok', ok === true);
  element.classList.toggle('error', ok === false);
}

async function loadConfig() {
  if (!inExtensionContext()) return;
  const result = await chrome.runtime.sendMessage({ type: 'get-host-config' });
  if (result && result.ok) {
    $('provider').value = result.result.provider || 'catbox';
    $('customUrl').value = result.result.customUrl || '';
  }
}

function toggleCustomUrl() {
  const isCustom = $('provider').value === 'custom';
  $('customUrl').style.display = isCustom ? 'block' : 'none';
  const label = document.querySelector('label[for="customUrl"]');
  if (label) label.style.display = isCustom ? 'block' : 'none';
}

$('provider').addEventListener('change', () => {
  toggleCustomUrl();
  setStatus($('configStatus'), '', null);
});

$('saveBtn').addEventListener('click', async () => {
  const status = $('configStatus');
  if (!inExtensionContext()) {
    setStatus(status, 'Open this page through the extension Options (chrome-extension:// URL) first.', false);
    return;
  }
  const provider = $('provider').value;
  const customUrl = $('customUrl').value.trim();
  if (provider === 'custom' && !customUrl) {
    setStatus(status, 'Enter the custom upload URL.', false);
    return;
  }
  if (customUrl && !/^https?:\/\//i.test(customUrl)) {
    setStatus(status, 'Custom URL must start with http:// or https://.', false);
    return;
  }
  const result = await chrome.runtime.sendMessage({
    type: 'save-host-config',
    config: { provider, customUrl }
  });
  if (result && result.ok) {
    setStatus(status, 'Saved. Next uploads will use ' + (provider === 'custom' ? customUrl : provider) + '.', true);
  } else {
    setStatus(status, 'Save failed: ' + ((result && result.error) || 'unknown error'), false);
  }
});

$('clearHistoryBtn').addEventListener('click', async () => {
  const status = $('clearStatus');
  if (!inExtensionContext()) {
    setStatus(status, 'Not available outside the extension.', false);
    return;
  }
  await chrome.storage.local.remove(HISTORY_KEY);
  setStatus(status, 'Share history cleared.', true);
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  toggleCustomUrl();
});