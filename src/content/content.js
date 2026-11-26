// 코네 페이지에 주입되는 콘텐츠 스크립트.
// M1: 설정을 읽고 팝업 메시지에 응답한다. 실제 디코딩은 M3부터 붙는다.
(function (root) {
  'use strict';

  const { api, settings } = root.B64D;

  const state = {
    enabled: settings.DEFAULTS.enabled,
    count: 0,
  };

  function applySettings(s) {
    state.enabled = s.enabled;
    // 확장이 동작 중인지 페이지 쪽에서 확인할 수 있게 표시만 남긴다.
    document.documentElement.dataset.b64d = s.enabled ? 'on' : 'off';
  }

  api.onMessage((message) => {
    if (message && message.type === 'b64d:getStats') {
      return { enabled: state.enabled, count: state.count };
    }
    return undefined;
  });

  settings.load().then(applySettings);
  settings.onChange(applySettings);
})(globalThis);
