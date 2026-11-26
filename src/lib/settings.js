// 설정 기본값과 읽기·쓰기. 저장소는 chrome.storage.sync.
(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: true,
    display: 'replace', // 'replace' | 'both' (v1.1 옵션 페이지에서 선택)
    decodeTitles: true,
    linkify: true,
    minLength: Object.freeze({ body: 16, title: 4 }),
  });

  /** 저장된 값(일부만 있을 수 있음)을 기본값과 합쳐 완전한 설정으로 만든다. */
  function normalize(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const minLength = { ...DEFAULTS.minLength, ...(src.minLength || {}) };
    return {
      enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULTS.enabled,
      display: src.display === 'both' ? 'both' : 'replace',
      decodeTitles: typeof src.decodeTitles === 'boolean' ? src.decodeTitles : DEFAULTS.decodeTitles,
      linkify: typeof src.linkify === 'boolean' ? src.linkify : DEFAULTS.linkify,
      minLength: {
        body: positiveInt(minLength.body, DEFAULTS.minLength.body),
        title: positiveInt(minLength.title, DEFAULTS.minLength.title),
      },
    };
  }

  function positiveInt(value, fallback) {
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  async function load() {
    const raw = await root.B64D.api.storageGet(null);
    return normalize(raw);
  }

  async function save(patch) {
    const next = normalize({ ...(await load()), ...patch });
    await root.B64D.api.storageSet(next);
    return next;
  }

  /** 설정이 바뀔 때마다 새 설정 전체로 cb를 부른다. */
  function onChange(cb) {
    return root.B64D.api.onStorageChanged(() => {
      load().then(cb);
    });
  }

  const settings = { DEFAULTS, normalize, load, save, onChange };

  if (typeof module === 'object' && module.exports) module.exports = settings;
  else root.B64D = Object.assign(root.B64D || {}, { settings });
})(globalThis);
