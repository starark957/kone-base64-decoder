// 스토어 이미지용 가짜 chrome.* API. 설정은 메모리에, 버전은 globalThis.__b64dVersion에서.
// shots.html이 직접 불러오고, store-shots.js가 팝업 iframe에도 넣는다.
(function () {
  'use strict';
  const data = {};
  const listeners = new Set();
  globalThis.chrome = {
    storage: {
      sync: {
        async get(defaults) { return { ...(defaults || {}), ...data }; },
        async set(values) {
          const changes = {};
          for (const [k, v] of Object.entries(values)) { changes[k] = { oldValue: data[k], newValue: v }; data[k] = v; }
          for (const l of listeners) l(changes, 'sync');
        },
      },
      onChanged: { addListener: (l) => listeners.add(l), removeListener: (l) => listeners.delete(l) },
    },
    runtime: {
      getManifest: () => ({ version: globalThis.__b64dVersion || '' }),
      onMessage: { addListener() {} },
    },
  };
})();
