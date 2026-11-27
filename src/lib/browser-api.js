// chrome.* 와 browser.* (Firefox) 차이를 감추는 얇은 래퍼.
// 확장 전체에서 브라우저 API는 이 파일을 통해서만 부른다.
(function (root) {
  'use strict';

  const ext = root.browser ?? root.chrome;

  const api = {
    /** 저장된 설정을 읽는다. 없는 키는 defaults 값으로 채워진다. */
    storageGet(defaults) {
      return ext.storage.sync.get(defaults);
    },

    storageSet(values) {
      return ext.storage.sync.set(values);
    },

    /** sync 영역이 바뀌면 cb(changes)를 부른다. 해제 함수를 돌려준다. */
    onStorageChanged(cb) {
      const listener = (changes, area) => {
        if (area === 'sync') cb(changes);
      };
      ext.storage.onChanged.addListener(listener);
      return () => ext.storage.onChanged.removeListener(listener);
    },

    /** 확장 버전 (manifest.json의 version) */
    version() {
      return ext.runtime.getManifest().version;
    },
  };

  root.B64D = Object.assign(root.B64D || {}, { api });
})(globalThis);
