const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../src/lib/settings.js');

const DEFAULTS = {
  enabled: true,
  areaTitle: true,
  areaBody: true,
  areaList: true,
  shortTokens: true,
  color: 'blue',
  koneSameTab: false,
};

test('빈 값이면 기본값 (1.0.0과 같은 동작)', () => {
  assert.deepEqual(settings.normalize(undefined), DEFAULTS);
  assert.deepEqual(settings.DEFAULTS, DEFAULTS);
});

test('1.0.0이 저장한 값({ enabled })은 그대로 이어받고 나머지는 기본값', () => {
  assert.deepEqual(settings.normalize({ enabled: false }), { ...DEFAULTS, enabled: false });
});

test('저장된 값이 기본값보다 우선', () => {
  const saved = { enabled: false, areaTitle: false, areaBody: false, areaList: false, shortTokens: false, color: 'pink', koneSameTab: true };
  assert.deepEqual(settings.normalize(saved), saved);
});

test('잘못된 값은 기본값으로', () => {
  assert.deepEqual(settings.normalize({ enabled: 'yes', areaBody: 0, color: 'red', koneSameTab: 'true' }), DEFAULTS);
});

test('색상은 정해진 이름만', () => {
  for (const c of settings.COLORS) assert.equal(settings.normalize({ color: c }).color, c);
  assert.equal(settings.normalize({ color: '#ff0000' }).color, 'blue');
});

test('예전 개발판이 저장한 키(decodeTitles, linkify, minLength 등)는 버린다', () => {
  const s = settings.normalize({
    enabled: false,
    decodeTitles: false,
    linkify: false,
    display: 'both',
    minLength: { body: 20 },
    includeComments: true,
  });
  assert.deepEqual(s, { ...DEFAULTS, enabled: false });
});
