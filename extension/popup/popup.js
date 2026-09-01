const $ = (id) => document.getElementById(id);

const HISTORY_KEY = 'share_history';
const MAX_HISTORY = 20;

function inExtensionContext() {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
}

let pendingFile = null;
let envelopeFileText = null;

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function setStatus(element, text, ok) {
  element.textContent = text;
  element.classList.toggle('ok', ok === true);
  element.classList.toggle('error', ok === false);
}

function showPanel(panel) {
  $('panelShare').classList.toggle('hidden', panel !== 'share');
  $('panelReceive').classList.toggle('hidden', panel !== 'receive');
  $('tabShare').classList.toggle('active', panel === 'share');
  $('tabReceive').classList.toggle('active', panel === 'receive');
}

async function getHostConfig() {
  if (!inExtensionContext()) return { provider: 'catbox', customUrl: '' };
  const response = await chrome.runtime.sendMessage({ type: 'get-host-config' });
  if (response && response.ok) return response.result;
  return { provider: 'catbox', customUrl: '' };
}

async function loadHistory() {
  if (!inExtensionContext()) return;
  const data = await chrome.storage.local.get(HISTORY_KEY);
  const list = data[HISTORY_KEY] || [];
  const block = $('historyBlock');
  const ul = $('historyList');
  ul.textContent = '';
  if (!list.length) {
    block.classList.add('hidden');
    return;
  }
  block.classList.remove('hidden');
  list.forEach((entry) => {
    const li = document.createElement('li');
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    meta.textContent = (entry.name || 'file') + ' · ' + (entry.date || '');
    li.appendChild(meta);

    const url = document.createElement('span');
    url.className = 'history-url';
    url.textContent = entry.link || entry.url || '';
    li.appendChild(url);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(entry.link || entry.url || '');
      copy.textContent = 'Copied!';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
    });
    li.appendChild(copy);
    ul.appendChild(li);
  });
}

async function addToHistory(entry) {
  if (!inExtensionContext()) return;
  const data = await chrome.storage.local.get(HISTORY_KEY);
  const list = data[HISTORY_KEY] || [];
  list.unshift({
    link: entry.link,
    url: entry.url,
    name: entry.name,
    size: entry.size,
    date: new Date().toISOString().slice(0, 16).replace('T', ' ')
  });
  await chrome.storage.local.set({ [HISTORY_KEY]: list.slice(0, MAX_HISTORY) });
}

function validateEnvelope(parsed) {
  if (!parsed || typeof parsed !== 'object' || !parsed.ciphertext || !parsed.iv) {
    throw new Error('This is not a Secure Share envelope (missing ciphertext).');
  }
  return parsed;
}

async function fetchEnvelopeFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Download failed (HTTP ' + response.status + '). The file host may have expired the file.');
  }
  const text = await response.text();
  return validateEnvelope(JSON.parse(text));
}

$('tabShare').addEventListener('click', () => showPanel('share'));
$('tabReceive').addEventListener('click', () => showPanel('receive'));
$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('fileInput').addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  pendingFile = file || null;
  setStatus($('shareStatus'), file ? 'Selected: ' + file.name + ' (' + formatBytes(file.size) + ')' : '', Boolean(file));
});

$('shareBtn').addEventListener('click', async () => {
  const status = $('shareStatus');
  if (!pendingFile) { setStatus(status, 'Choose a file first.', false); return; }

  try {
    setStatus(status, 'Encrypting locally…', true);
    const result = await CryptoKit.encryptFileToEnvelope(pendingFile);
    const envelopeName = (pendingFile.name || 'file.bin') + '.enc';
    const attachmentName = pendingFile.name || 'file.bin';

    setStatus(status, 'Uploading ciphertext to the host…', true);
    const uploadResponse = await chrome.runtime.sendMessage({
      type: 'upload-share',
      envelope: result.envelope,
      fileName: envelopeName
    });
    if (!uploadResponse || !uploadResponse.ok) {
      const err = (uploadResponse && uploadResponse.error) || 'Upload failed.';
      setStatus(status, err, false);
      return;
    }

    const link = CryptoKit.buildShareLink(uploadResponse.result.url, result.key);
    $('shareLinkOut').value = link;
    $('resultBox').classList.remove('hidden');
    await addToHistory({
      link: link,
      url: uploadResponse.result.url,
      name: attachmentName,
      size: pendingFile.size
    });
    await loadHistory();
    setStatus(status, 'Share link ready (' + formatBytes(pendingFile.size) + ' encrypted).', true);
    pendingFile = null;
    $('fileInput').value = '';
  } catch (error) {
    setStatus(status, 'Error: ' + ((error && error.message) || error), false);
  }
});

$('copyLinkBtn').addEventListener('click', async () => {
  const value = $('shareLinkOut').value;
  if (!value) return;
  await navigator.clipboard.writeText(value);
  $('copyLinkBtn').textContent = 'Copied!';
  setTimeout(() => { $('copyLinkBtn').textContent = 'Copy link'; }, 1500);
});

$('linkInput').addEventListener('input', () => {
  const raw = $('linkInput').value.trim();
  if (!raw.startsWith('http')) return;
  try {
    const hashIndex = raw.indexOf('#');
    if (hashIndex === -1) return;
    const params = new URLSearchParams(raw.slice(hashIndex + 1));
    const key = params.get('key') || '';
    if (key) {
      $('keyInput').value = key;
      $('keyAutoBadge').textContent = 'Key extracted from link.';
      $('keyAutoBadge').classList.remove('hidden');
    } else {
      $('keyAutoBadge').classList.add('hidden');
    }
  } catch (e) {
  }
});

$('envelopeFile').addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) { envelopeFileText = null; return; }
  try {
    envelopeFileText = await file.text();
    const parsed = validateEnvelope(JSON.parse(envelopeFileText));
    setStatus($('receiveStatus'), 'Envelope loaded: ' + (parsed.fileName || 'unknown'), true);
  } catch (error) {
    envelopeFileText = null;
    setStatus($('receiveStatus'), 'Invalid envelope file: ' + error.message, false);
  }
});

$('receiveBtn').addEventListener('click', async () => {
  const status = $('receiveStatus');
  const rawLink = $('linkInput').value.trim();
  const manualKey = $('keyInput').value.trim();

  try {
    let envelope = null;
    let key = manualKey;

    if (envelopeFileText) {
      envelope = validateEnvelope(JSON.parse(envelopeFileText));
      if (!key && rawLink) key = CryptoKit.parseShareText(rawLink).key;
    } else if (rawLink) {
      const parsed = CryptoKit.parseShareText(rawLink);
      if (parsed.key && !key) key = parsed.key;
      if (/^https?:\/\//i.test(rawLink)) {
        envelope = await fetchEnvelopeFromUrl(rawLink.split('#')[0]);
      } else {
        envelope = validateEnvelope(parsed.envelope);
      }
    } else {
      setStatus(status, 'Paste a share link or choose an envelope file.', false);
      return;
    }

    if (!envelope) {
      setStatus(status, 'No envelope found. Paste a link or load a file.', false);
      return;
    }

    setStatus(status, 'Decrypting…', true);
    const decrypted = await CryptoKit.decryptEnvelope(envelope, key);
    CryptoKit.downloadFromBytes(decrypted.bytes, decrypted.fileName, decrypted.fileType);
    setStatus(status, 'Decrypted: ' + decrypted.fileName + ' (' + formatBytes(decrypted.bytes.byteLength) + '). Download started.', true);
  } catch (error) {
    setStatus(status, 'Decryption failed: ' + ((error && error.message) || error), false);
  }
});

(async function init() {
  try {
    if (!inExtensionContext()) {
      $('providerBadge').textContent = 'outside extension';
      setStatus(
        $('shareStatus'),
        'The extension APIs are not available on this page. Open it through the Secure Share toolbar icon (or the extension popup URL) instead.',
        false
      );
      return;
    }
    const config = await getHostConfig();
    $('providerBadge').textContent = config.provider === 'custom' ? 'custom server' : config.provider;
    await loadHistory();
  } catch (error) {
    setStatus($('shareStatus'), 'Error: ' + ((error && error.message) || error), false);
  }
})();