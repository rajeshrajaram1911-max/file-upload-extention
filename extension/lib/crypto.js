const CryptoKit = (() => {
  const B64_LOOKUP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const subtle = crypto.subtle;

  function bufToB64(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
      out += B64_LOOKUP[b0 >> 2];
      out += B64_LOOKUP[((b0 & 3) << 4) | (b1 >> 4)];
      out += i + 1 < bytes.length ? B64_LOOKUP[((b1 & 15) << 2) | (b2 >> 6)] : '=';
      out += i + 2 < bytes.length ? B64_LOOKUP[b2 & 63] : '=';
    }
    return out;
  }

  function b64ToBuf(b64) {
    const cleaned = String(b64).replace(/[^A-Za-z0-9+\/=]/g, '');
    const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
    const out = new Uint8Array(Math.floor((cleaned.length * 3) / 4) - padding);
    let outIdx = 0;
    let buffer = 0;
    let bits = 0;
    for (let i = 0; i < cleaned.length; i++) {
      const val = B64_LOOKUP.indexOf(cleaned[i]);
      if (val === -1) continue;
      buffer = (buffer << 6) | val;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[outIdx++] = (buffer >> bits) & 0xff;
      }
    }
    return out;
  }

  function base64ToBase64Url(b64) {
    return String(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBase64(key) {
    let s = String(key).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return s;
  }

  async function encryptFileToEnvelope(file) {
    const aesKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await file.arrayBuffer();
    const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);
    const rawAes = await subtle.exportKey('raw', aesKey);
    return {
      envelope: {
        version: 1,
        algorithm: 'AES-256-GCM',
        fileName: String(file.name || 'file.bin'),
        fileType: String(file.type || 'application/octet-stream'),
        iv: bufToB64(iv),
        ciphertext: bufToB64(ciphertext)
      },
      key: base64ToBase64Url(bufToB64(rawAes))
    };
  }

  async function decryptEnvelope(envelope, keyBase64Url) {
    if (!envelope || !envelope.ciphertext || !envelope.iv) {
      throw new Error('Not a valid encrypted envelope.');
    }
    if (!keyBase64Url) {
      throw new Error('The decryption key is missing. Paste the full share link (or the key).');
    }
    const raw = b64ToBuf(base64UrlToBase64(keyBase64Url));
    const aesKey = await subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
    const bytes = await subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBuf(envelope.iv) },
      aesKey,
      b64ToBuf(envelope.ciphertext)
    );
    return {
      bytes,
      fileName: String(envelope.fileName || 'file.bin'),
      fileType: String(envelope.fileType || 'application/octet-stream')
    };
  }

  function parseShareText(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('Nothing to parse.');
    let key = '';
    const hashIndex = raw.indexOf('#');
    if (hashIndex !== -1) {
      const params = new URLSearchParams(raw.slice(hashIndex + 1));
      key = params.get('key') || '';
    }
    const isLink = /^https?:\/\//i.test(raw) || (hashIndex !== -1 && /^https?:\/\//i.test(raw.slice(0, hashIndex)));
    if (isLink) {
      return { envelope: null, key };
    }
    return { envelope: JSON.parse(raw), key };
  }

  function buildShareLink(baseUrl, key) {
    return baseUrl.split('#')[0] + '#key=' + encodeURIComponent(key);
  }

  function downloadFromBytes(bytes, fileName, fileType) {
    const blob = new Blob([bytes], { type: fileType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return {
    encryptFileToEnvelope,
    decryptEnvelope,
    parseShareText,
    buildShareLink,
    downloadFromBytes
  };
})();