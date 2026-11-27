// Chrome 웹 스토어용 이미지를 만든다: store/images/*.jpg
// store/shots.html의 장면을 헤드리스 Chromium(Edge·Chrome)으로 열어 찍는다. 외부 패키지 없이 Node 기본 기능만 쓴다.
//   node scripts/store-shots.js            (브라우저 자동 탐색)
//   BROWSER="C:\...\msedge.exe" node scripts/store-shots.js
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store', 'images');
const PORT = 9333;

/** 장면: 스크린샷 1280×800 3장, 작은 홍보 타일 440×280 1장 */
const SHOTS = [
  { scene: 'post', file: 'screenshot-1-post.jpg', w: 1280, h: 800, click: '[data-b64d-clickable]', clickIndex: 2 },
  { scene: 'list', file: 'screenshot-2-list.jpg', w: 1280, h: 800 },
  { scene: 'dark', file: 'screenshot-3-dark.jpg', w: 1280, h: 800, dark: true, click: '.b64d-toggle', clickIndex: 0 },
  { scene: 'tile', file: 'promo-small-440x280.jpg', w: 440, h: 280 },
];

function findBrowser() {
  if (process.env.BROWSER) return process.env.BROWSER;
  const pf = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const fixed = [
    ...pf.map((p) => path.join(p, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    ...pf.map((p) => path.join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
  ];
  for (const f of fixed) if (fs.existsSync(f)) return f;
  // Edge 런타임(EdgeCore\<버전>\msedge.exe)
  for (const p of pf) {
    const core = path.join(p, 'Microsoft', 'EdgeCore');
    if (!fs.existsSync(core)) continue;
    const vers = fs.readdirSync(core).sort().reverse();
    for (const v of vers) {
      const f = path.join(core, v, 'msedge.exe');
      if (fs.existsSync(f)) return f;
    }
  }
  throw new Error('Chromium 계열 브라우저를 찾지 못했습니다. BROWSER 환경 변수로 경로를 알려 주세요.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // 아직 뜨는 중
    }
    await sleep(200);
  }
  throw new Error('브라우저 디버깅 포트에 연결하지 못했습니다.');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    } else if (msg.method && events.has(msg.method)) {
      events.get(msg.method)(msg.params);
      events.delete(msg.method);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const once = (method) => new Promise((resolve) => events.set(method, resolve));
  return new Promise((resolve) => {
    ws.onopen = () => resolve({ send, once, close: () => ws.close() });
  });
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const browser = findBrowser();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'b64d-shots-'));
  const proc = spawn(browser, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    '--allow-file-access-from-files', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    const page = await cdp(await connect());
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    // 팝업 iframe에도 가짜 chrome.* 를 넣는다 (모든 프레임에서 문서보다 먼저 실행됨)
    const stub = fs.readFileSync(path.join(ROOT, 'store', 'chrome-stub.js'), 'utf8');
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `globalThis.__b64dVersion = ${JSON.stringify(manifest.version)};
${stub}`,
    });
    fs.mkdirSync(OUT, { recursive: true });

    for (const s of SHOTS) {
      await page.send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: false });
      await page.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: s.dark ? 'dark' : 'light' }],
      });
      const url = pathToFileURL(path.join(ROOT, 'store', 'shots.html'));
      url.search = `?scene=${s.scene}`;
      const loaded = page.once('Page.loadEventFired');
      await page.send('Page.navigate', { url: url.href });
      await loaded;
      await sleep(600); // 콘텐츠 스크립트 처리·폰트 로드
      if (s.click) {
        const { result } = await page.send('Runtime.evaluate', {
          expression: `(() => { const el = document.querySelectorAll(${JSON.stringify(s.click)})[${s.clickIndex}];
            if (!el) return false; el.click(); return true; })()`,
          returnByValue: true,
        });
        if (!result.value) throw new Error(`${s.scene}: 누를 요소(${s.click})가 없습니다.`);
        await sleep(500); // 애니메이션
      }
      const { data } = await page.send('Page.captureScreenshot', {
        format: 'jpeg', quality: 95,
        clip: { x: 0, y: 0, width: s.w, height: s.h, scale: 1 },
      });
      fs.writeFileSync(path.join(OUT, s.file), Buffer.from(data, 'base64'));
      console.log(`store/images/${s.file} (${s.w}×${s.h})`);
    }
    page.close();
  } finally {
    proc.kill();
    await sleep(500);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
