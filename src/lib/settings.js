// 설정 기본값과 읽기·쓰기. 저장소는 chrome.storage.sync.
// 사용자가 팝업에서 바꾸는 값만 여기에 둔다. 디코딩 기준(최소 길이, 오탐 규칙 등)은 코드(base64.js)에 둔다.
(function (root) {
  'use strict';

  /** 강조 색상 이름. 실제 색은 content.css의 [data-b64d-color]에 있다. */
  const COLORS = Object.freeze(['blue', 'green', 'purple', 'orange', 'pink', 'gray']);

  const DEFAULTS = Object.freeze({
    /** 자동 디코딩 전체 켜기·끄기 */
    enabled: true,
    /** 게시물 제목 */
    areaTitle: true,
    /** 게시물 본문 */
    areaBody: true,
    /** 글 목록 제목 (게시판·검색·홈·프로필) */
    areaList: true,
    /** 16자 미만의 짧은 Base64 (Qw==, 7ZWc6riA 등) */
    shortTokens: true,
    /** 칩·카드의 강조 색상 */
    color: 'blue',
    /** 풀린 주소가 kone.gg면 새 탭 대신 지금 탭에서 열기 */
    koneSameTab: false,
  });

  const BOOLEAN_KEYS = Object.keys(DEFAULTS).filter((k) => typeof DEFAULTS[k] === 'boolean');

  /** 저장된 값(일부만 있을 수 있음)을 기본값과 합쳐 완전한 설정으로 만든다. 모르는 키와 잘못된 값은 버린다. */
  function normalize(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    for (const k of BOOLEAN_KEYS) out[k] = typeof src[k] === 'boolean' ? src[k] : DEFAULTS[k];
    out.color = COLORS.includes(src.color) ? src.color : DEFAULTS.color;
    return out;
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

  const settings = { COLORS, DEFAULTS, normalize, load, save, onChange };

  if (typeof module === 'object' && module.exports) module.exports = settings;
  else root.B64D = Object.assign(root.B64D || {}, { settings });
})(globalThis);
