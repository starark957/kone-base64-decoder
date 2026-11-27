// 설정 기본값과 읽기·쓰기. 저장소는 chrome.storage.sync.
// 사용자 설정은 자동 디코딩 켜기·끄기 하나뿐이다. 디코딩 범위(본문·제목·목록 제목),
// 주소 링크 표시, 최소 길이 같은 기준은 설정이 아니라 코드(content.js, base64.js)에 둔다.
(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: true,
  });

  /** 저장된 값(일부만 있을 수 있음)을 기본값과 합쳐 완전한 설정으로 만든다. 모르는 키는 버린다. */
  function normalize(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULTS.enabled,
    };
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
