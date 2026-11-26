const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../src/lib/settings.js');

test('빈 값이면 기본값', () => {
  assert.deepEqual(settings.normalize(undefined), {
    enabled: true,
    display: 'replace',
    decodeTitles: true,
    linkify: true,
    minLength: { body: 16, title: 4 },
  });
});

test('저장된 값이 기본값보다 우선', () => {
  const s = settings.normalize({ enabled: false, decodeTitles: false, minLength: { body: 20 } });
  assert.equal(s.enabled, false);
  assert.equal(s.decodeTitles, false);
  assert.deepEqual(s.minLength, { body: 20, title: 4 });
});

test('잘못된 값은 기본값으로', () => {
  const s = settings.normalize({ enabled: 'yes', display: 'weird', minLength: { body: -1, title: 2.5 } });
  assert.equal(s.enabled, true);
  assert.equal(s.display, 'replace');
  assert.deepEqual(s.minLength, { body: 16, title: 4 });
});

test('예전 설정의 includeComments 같은 모르는 키는 버린다', () => {
  const s = settings.normalize({ includeComments: true });
  assert.equal('includeComments' in s, false);
});
