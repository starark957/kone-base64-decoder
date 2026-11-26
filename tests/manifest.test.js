const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('Manifest V3, storage 권한만 사용', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
});

test('콘텐츠 스크립트는 kone.gg에만 주입', () => {
  for (const cs of manifest.content_scripts) {
    assert.deepEqual(cs.matches, ['https://kone.gg/*']);
  }
});

test('manifest가 가리키는 파일이 모두 있다', () => {
  const files = [
    ...manifest.content_scripts.flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
    manifest.action.default_popup,
    ...(manifest.options_ui ? [manifest.options_ui.page] : []),
    ...Object.values(manifest.icons || {}),
  ];
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(root, f)), `없는 파일: ${f}`);
  }
});

test('browser-api.js가 콘텐츠 스크립트 중 가장 먼저 로드된다', () => {
  for (const cs of manifest.content_scripts) {
    assert.equal(cs.js[0], 'src/lib/browser-api.js');
    assert.equal(cs.js[cs.js.length - 1], 'src/content/content.js');
  }
});
