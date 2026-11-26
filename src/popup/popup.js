(function (root) {
  'use strict';

  const { api, settings } = root.B64D;
  const enabled = document.getElementById('enabled');
  const enabledDesc = document.getElementById('enabled-desc');

  const DESC_ON = '코네의 Base64 문장을 자동으로 풀어 줍니다';
  const DESC_OFF = '꺼져 있습니다. 원문이 그대로 보입니다';

  function render(s) {
    enabled.checked = s.enabled;
    enabledDesc.textContent = s.enabled ? DESC_ON : DESC_OFF;
  }

  async function init() {
    try {
      document.getElementById('version').textContent = `v${api.version()}`;
    } catch {
      // 버전을 못 읽어도 팝업은 동작해야 한다
    }
    render(await settings.load());
    enabled.addEventListener('change', async () => {
      render(await settings.save({ enabled: enabled.checked }));
    });
  }

  init();
})(globalThis);
