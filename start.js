const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const rootExt = path.resolve(__dirname, 'extension');
const extPath = fs.existsSync(path.join(rootExt, 'manifest.json'))
  ? rootExt
  : fs.existsSync(path.join(__dirname, 'manifest.json'))
    ? __dirname
    : rootExt;

function findBrowser() {
  const env = process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;
  const pf = process.env.PROGRAMFILES || '';
  const pfx = process.env['PROGRAMFILES(X86)'] || '';
  const la = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pfx, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(la, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pfx, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function main() {
  const dryRun = process.env.SS_DRY_RUN === '1';
  const browser = findBrowser();
  if (!browser) {
    console.log('Chrome or Edge was not found. Install Google Chrome, or load the extension manually at chrome://extensions:');
    console.log('  ' + extPath);
    process.exit(1);
  }
  const profile = path.join(os.tmpdir(), 'file-upload-extention-' + process.pid.toString());
  const args = [
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--load-extension=' + extPath,
    'chrome://extensions'
  ];
  console.log('Browser:     ' + browser);
  console.log('Extension:   ' + extPath);
  console.log('Profile:     ' + profile);
  if (dryRun) {
    console.log('Dry run ok. Would launch: ' + args.slice(1).join(' '));
    return;
  }
  const child = spawn(browser, args, { detached: true, stdio: 'ignore' });
  child.on('error', (err) => {
    console.error('Failed to start the browser: ' + err.message + ' Use the manual steps printed above.');
    process.exit(1);
  });
  child.unref();
  console.log('Browser is starting with the file upload extention loaded.');
}

main();