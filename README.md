# file upload extention

A Chrome extension (Manifest V3) that encrypts files locally with AES-256-GCM and shares them via secure links.

## Features
- AES-256-GCM encryption entirely in the browser before anything is uploaded
- Upload ciphertext to Catbox, tmpfiles.org, file.io, or a custom server
- The decryption key travels only in the share link fragment (`#key=...`) and never reaches the host
- Receive tab decrypts a share link or an `.enc` envelope file and downloads the original file

## Usage
```sh
npm start
```
This launches Chrome (or Edge) with the extension loaded. Alternatively, load it manually:
1. Open `chrome://extensions`
2. Enable Developer mode
3. Click **Load unpacked** and select the `extension` folder

Then click the file upload extention toolbar icon.

## How it works
1. You pick a file in the popup; it is encrypted locally with AES-256-GCM (random key + IV).
2. Only the ciphertext envelope is uploaded to the configured file host.
3. You get a share link: `https://host/.../file.enc#key=<base64url-key>`.
4. The recipient pastes the full link in the Receive tab; the extension fetches the envelope, extracts the key from the fragment, decrypts, and downloads the original file.

## Project structure
```
extension/
  background/service-worker.js   Message handling, host config, uploads
  lib/crypto.js                  AES-256-GCM envelope encryption, link parsing
  lib/host.js                    Upload adapters (catbox, tmpfiles.org, file.io, custom)
  options/                       Upload-host configuration
  popup/                         Share / Receive UI
        manifest.json
start.js      Launches Chrome/Edge with the extension loaded
package.json  npm start
```

## Privacy
Files leave your device only as AES-256-GCM ciphertext. The key exists solely in the share link fragment; anyone with the full link can decrypt, but the host and anyone without the link cannot.