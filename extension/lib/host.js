const Host = (() => {
  const PROVIDERS = ['catbox', 'tmpfiles', 'fileio', 'custom'];

  function buildEnvelopeFile(envelope, fileName) {
    const text = JSON.stringify(envelope, null, 2);
    return new File([text], fileName || 'secure-share.enc', { type: 'application/json' });
  }

  async function upload(config, envelope, fileName) {
    const provider = (config && config.provider) || 'catbox';
    if (!PROVIDERS.includes(provider)) {
      throw new Error('Unsupported upload provider: ' + provider);
    }
    const file = buildEnvelopeFile(envelope, fileName);
    switch (provider) {
      case 'catbox':
        return uploadCatbox(file);
      case 'tmpfiles':
        return uploadTmpfiles(file);
      case 'fileio':
        return uploadFileio(file);
      case 'custom':
        return uploadCustom((config && config.customUrl) || '', file);
    }
  }

  async function uploadCatbox(file) {
    const form = new FormData();
    form.append('reqtype', 'fileupload');
    form.append('fileToUpload', file);
    const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form });
    const text = (await res.text()).trim();
    if (!res.ok || !/^https?:\/\//.test(text)) {
      throw new Error('Catbox error: ' + (text || res.status));
    }
    return text;
  }

  async function uploadTmpfiles(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: form });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.data || !payload.data.url) {
      throw new Error('tmpfiles.org error: ' + ((payload && payload.error) || res.status));
    }
    return String(payload.data.url).replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
  }

  async function uploadFileio(file) {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('https://file.io', { method: 'POST', body: form });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success || !payload.link) {
      throw new Error('file.io error: ' + ((payload && payload.message) || res.status));
    }
    return String(payload.link);
  }

  async function uploadCustom(url, file) {
    if (!url) {
      throw new Error('Custom upload URL is not configured. Open Options first.');
    }
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(url, { method: 'POST', body: form });
    const text = (await res.text()).trim();
    if (!res.ok) {
      throw new Error('Upload server error: ' + (text || res.status));
    }
    try {
      const payload = JSON.parse(text);
      if (payload && payload.url) return String(payload.url);
      if (payload && payload.data && payload.data.url) return String(payload.data.url);
      if (payload && payload.link) return String(payload.link);
    } catch (err) {
    }
    if (/^https?:\/\//.test(text)) return text;
    throw new Error('Upload server returned an unrecognized response; expected a URL.');
  }

  return {
    PROVIDERS,
    upload
  };
})();