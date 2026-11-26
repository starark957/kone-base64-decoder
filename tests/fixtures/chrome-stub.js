// fixture 페이지용 가짜 chrome.* API (메모리 저장소). 확장 없이 콘텐츠 스크립트를 돌려 볼 때 쓴다.
(function () {
  'use strict';

  const data = {};
  const storageListeners = new Set();
  const messageListeners = new Set();

  globalThis.chrome = {
    storage: {
      sync: {
        async get(defaults) {
          if (defaults === null || defaults === undefined) return structuredClone(data);
          return { ...structuredClone(defaults), ...structuredClone(data) };
        },
        async set(values) {
          const changes = {};
          for (const [k, v] of Object.entries(values)) {
            changes[k] = { oldValue: data[k], newValue: v };
            data[k] = structuredClone(v);
          }
          for (const l of storageListeners) l(changes, 'sync');
        },
      },
      onChanged: {
        addListener: (l) => storageListeners.add(l),
        removeListener: (l) => storageListeners.delete(l),
      },
    },
    runtime: {
      onMessage: { addListener: (l) => messageListeners.add(l) },
    },
  };

  /** 팝업이 보내는 메시지를 흉내 낸다. */
  globalThis.__stub = {
    data,
    sendMessage(message) {
      return new Promise((resolve) => {
        for (const l of messageListeners) l(message, {}, resolve);
      });
    },
  };
})();
