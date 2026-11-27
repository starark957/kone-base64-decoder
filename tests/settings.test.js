const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../src/lib/settings.js');

test('빈 값이면 기본값(켜짐)', () => {
  assert.deepEqual(settings.normalize(undefined), { enabled: true });
});

test('저장된 값이 기본값보다 우선', () => {
  assert.deepEqual(settings.normalize({ enabled: false }), { enabled: false });
});

test('잘못된 값은 기본값으로', () => {
  assert.deepEqual(settings.normalize({ enabled: 'yes' }), { enabled: true });
});

test('예전 버전이 저장한 키(decodeTitles, linkify, minLength 등)는 버린다', () => {
  const s = settings.normalize({
    enabled: false,
    decodeTitles: false,
    linkify: false,
    display: 'both',
    minLength: { body: 20 },
    includeComments: true,
  });
  assert.deepEqual(s, { enabled: false });
});
